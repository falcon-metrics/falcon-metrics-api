import { DateTime, Interval } from "luxon";
import { IQueryFilters } from "../../../common/filters_v2";
import { SecurityContext } from "../../../common/security";
import { IState, StateCategory } from '../../../workitem/state_aurora';
import { Logger } from 'log4js';
import { QueryTypes, Sequelize } from "sequelize";
import { IWorkItemQueries, WorkItemQueries } from "../../../workitem/workitem_queries";
import { RetrievalScenario, StateItem, TreatedSnapshotItem } from "../../../workitem/interfaces";
import { AggregationKey, generateDateArray, getWorkItemDateAdjuster, separateWorkItemsInIntervalBuckets } from "../../../common/aggregation";
import { generateJoinedCategoryFilter } from "../../../common/dateAnalysis";
import { TIMEZONE_UTC, validateTzOrUTC } from "../../../utils/date_utils";
import { PredefinedWidgetTypes } from "../common/enum";
import { WidgetInformation, WidgetInformationUtils } from "../../../utils/getWidgetInformation";
import { ISnapshot } from "../../../workitem/snapshot_db";
import { getPercentile, roundToDecimalPlaces } from "../../../utils/statistics";
import pgp from 'pg-promise';
import _ from "lodash";

type Row = {
    state: string,
    timeInState: string,
    timeInStateDays: number;
    workItemCount: number;
};

export type TimeInStageOption = {
    perspective: 'proposed' | 'inprogress' | 'completed';
    stepType: 'queue' | 'active';
    stepCategory: 'proposed' | 'inprogress' | 'completed';
    stages?: Row[];
    workItemCount?: number;
    query?: string;
};

export type FullTimeInStageData = TimeInStageOption[];

export type FlowEfficiencyPeriodData = {
    startDate: string,
    endDate: string,
    workItemIdList: string[];
    activeCount: number;
    waitingCount: number;
    count?: number;
    activeTimeInHours?: string,
    waitingTimeInHours?: string;
};

export type FlowEfficiencyOption = {
    perspective: 'inprogress' | 'completed';
    includeArrival: 'include' | 'exclude';
    totals: {
        activeTime: number;
        waitingTime: number;
    };
    aggregated: FlowEfficiencyPeriodData[];
};

export type FullFlowEfficiencyData = FlowEfficiencyOption[];

export type FlowEfficiencyBodyResponse = {
    flowEfficiency: FullFlowEfficiencyData;
    timeInStage: FullTimeInStageData;
    flowEfficiencyWidgetInfo?: WidgetInformation[];
    timeInStageWidgetInfo?: WidgetInformation[];
};

export class Calculations {
    readonly orgId: string;
    readonly aurora: Promise<Sequelize>;
    readonly filters: IQueryFilters;
    readonly state: IState;
    readonly snapshot: ISnapshot;
    readonly workItemQueries: IWorkItemQueries;
    readonly widgetInformationUtils: WidgetInformationUtils;
    /**
     * timezone in the request
     */
    readonly timezone: string;

    private treatedSnapshotCache: Record<string, Promise<any> | any> = {};

    private scenarioWorkItemCache: {
        [scenario: string]: Promise<StateItem[]> | StateItem[];
    } = {};
    private categoryWorkItemCache: {
        [stateCategory: string]: Promise<StateItem[]> | StateItem[];
    } = {};

    constructor(opts: {
        security: SecurityContext;
        state: IState;
        snapshot: ISnapshot;
        logger: Logger;
        filters: IQueryFilters;
        aurora: Promise<Sequelize>;
        workItemQueries: IWorkItemQueries;
        widgetInformationUtils: WidgetInformationUtils;
    }) {
        this.orgId = opts.security.organisation!;
        this.aurora = opts.aurora;
        this.filters = opts.filters;
        this.state = opts.state;
        this.snapshot = opts.snapshot;
        this.workItemQueries = opts.workItemQueries;
        this.widgetInformationUtils = opts.widgetInformationUtils;
        this.timezone = validateTzOrUTC(this.filters?.clientTimezone ?? TIMEZONE_UTC);
    }

    async getFlowEfficiency(aggregation: AggregationKey, timeZone: string) {
        const interval = await this.filters.datePeriod();

        const flowEfficiencyPromises: Promise<FlowEfficiencyOption>[] = [];
        for (const includeArrival of ['include', 'exclude']) {
            for (const perspective of ['inprogress', 'completed']) {
                flowEfficiencyPromises.push(
                    this.getFlowEfficiencyWithParameters(
                        perspective as any,
                        includeArrival as any,
                        aggregation,
                        timeZone,
                        interval
                    )
                );
            }
        }

        const flowEfficiencyOptions = await Promise.all(flowEfficiencyPromises);
        return flowEfficiencyOptions;
    }

    async getTimeInStage() {
        const interval = await this.filters.datePeriod();
        const beginDate = interval?.start;
        const endDate = interval?.end;
        const areValidDates = interval?.isValid;

        if (interval === undefined || !interval.isValid || !areValidDates) {
            return [];
        }


        const timeInStagePromises: Promise<TimeInStageOption>[] = [];
        for (const perspective of ['inprogress', 'completed', 'proposed']) {
            for (const stepType of ['queue', 'active']) {
                for (const stepCategory of ['inprogress', 'completed', 'proposed']) {
                    timeInStagePromises.push(
                        this.getTimeInStageWithParameters(
                            this.orgId,
                            perspective as any,
                            stepType as any,
                            stepCategory as any,
                            beginDate,
                            endDate
                        )
                    );
                }
            }
        }

        const timeInStageOptions = await Promise.all(timeInStagePromises);

        return timeInStageOptions;
    }

    async getWidgetInformation(type: PredefinedWidgetTypes) {
        return this.widgetInformationUtils.getWidgetInformation(type);
    }

    private async getCachedTreatedSnapshots(
        timeZone: string,
        interval: Interval,
    ) {
        if (this.treatedSnapshotCache[this.orgId] instanceof Promise) {
            return await this.treatedSnapshotCache[this.orgId];
        } else if (this.treatedSnapshotCache[this.orgId]) {
            return this.treatedSnapshotCache[this.orgId];
        }
        const [
            proposed,
            inprogress,
            completed,
        ] = await Promise.all([
            this.getCachedWorkItemsByStateCategory(StateCategory.PROPOSED),
            this.getCachedWorkItemsByStateCategory(StateCategory.INPROGRESS),
            this.getCachedWorkItemsByStateCategory(StateCategory.COMPLETED),
        ]);
        const promise = this.snapshot.getTreatedSnapshots(
            this.orgId,
            ['workItemId', 'stateType', 'stateCategory'],
            timeZone,
            [
                ...proposed,
                ...inprogress,
                ...completed
            ].map(w => w.workItemId as string),
            undefined, // work item type id list
            interval.start,
            interval.end,
        );
        this.treatedSnapshotCache[this.orgId] = promise;
        this.treatedSnapshotCache[this.orgId] = await promise;
        return this.treatedSnapshotCache[this.orgId];
    }

    async getTreatedFlowEfficiency(
        proposedWorkItemList: { workItemId?: string; departureDateTime?: DateTime; stateCategory?: string; }[],
        inprogressWorkItemList: { workItemId?: string; departureDateTime?: DateTime; stateCategory?: string; }[],
        completedWorkItemList: { workItemId?: string; departureDateTime?: DateTime; stateCategory?: string; }[],
        aggregation: AggregationKey,
        timeZone: string,
    ) {
        const flowEfficiencyPromises: Promise<FlowEfficiencyOption>[] = [];
        for (const includeArrival of ['include', 'exclude']) {
            for (const perspective of ['inprogress', 'completed']) {
                flowEfficiencyPromises.push(
                    this.getTreatedFlowEfficiencyWithParameters(
                        perspective as any,
                        includeArrival as any,
                        proposedWorkItemList,
                        inprogressWorkItemList,
                        completedWorkItemList,
                        aggregation,
                        timeZone,
                    )
                );
            }
        }
        const flowEfficiencyOptions = await Promise.all(flowEfficiencyPromises);
        return flowEfficiencyOptions;
    }

    async getTreatedFlowEfficiencyWithParameters(
        arrivalPoint: 'include' | 'exclude',
        perspective: 'inprogress' | 'completed',
        proposed: { workItemId?: string; departureDateTime?: DateTime; stateCategory?: string; }[],
        inprogress: { workItemId?: string; departureDateTime?: DateTime; stateCategory?: string; }[],
        completed: { workItemId?: string; departureDateTime?: DateTime; stateCategory?: string; }[],
        aggregation: AggregationKey,
        timeZone: string,
    ) {
        const [totals, aggregated] = await Promise.all([
            this.getTreatedFlowEfficiencyDonutData(
                proposed,
                inprogress,
                completed,
                arrivalPoint,
                perspective,
                timeZone,
            ),
            this.getTreatedFlowEfficiencyOverTime(
                arrivalPoint,
                perspective,
                aggregation,
                timeZone
            )
        ]);

        const flowEfficiencyOption: FlowEfficiencyOption = {
            perspective,
            includeArrival: arrivalPoint,
            totals,
            aggregated,
        };

        return flowEfficiencyOption;
    }

    async getTreatedFlowEfficiencyDonutData(
        proposedWorkItemList: { workItemId?: string; departureDateTime?: DateTime; stateCategory?: string; }[],
        inprogressWorkItemList: { workItemId?: string; departureDateTime?: DateTime; stateCategory?: string; }[],
        completedWorkItemList: { workItemId?: string; departureDateTime?: DateTime; stateCategory?: string; }[],
        arrivalPoint: 'include' | 'exclude',
        perspective: string,
        timeZone: string,
    ) {
        const interval = await this.filters.datePeriod()!;
        const snapshotRecord = await this.getCachedTreatedSnapshots(
            timeZone,
            interval
        );

        const statesAndSnapshotsRecord: {
            [workItemId: string]: {
                departureDateTime: DateTime,
                stateCategory: string,
                snapshots: TreatedSnapshotItem[];
            };
        } = {};

        // Business rule: select a origin list depending on the perspective
        const list = (perspective === 'proposed') ? proposedWorkItemList :
            (perspective === 'inprogress') ? inprogressWorkItemList :
                (perspective === 'completed') ? completedWorkItemList : [];

        for (const item of list) {
            const workItemId = item.workItemId as string;
            statesAndSnapshotsRecord[workItemId] = {
                departureDateTime: item.departureDateTime as DateTime,
                stateCategory: perspective,
                snapshots: snapshotRecord[workItemId],
            };
        }

        // Calculate active time, waiting time, and flow efficiency
        const result: any = null; // this.snapshot.calculateActiveTimeAndWaitingTimeBulk(statesAndSnapshotsRecord, arrivalPoint, interval.start, interval.end);

        return result;
    }

    async getTreatedFlowEfficiencyOverTime(
        arrivalPoint: 'include' | 'exclude',
        perspective: 'inprogress' | 'completed',
        aggregation: AggregationKey,
        timeZone: string,
    ) {
        const rawWorkItems = await this.getCachedExtendedWorkItemsByPerspective(
            perspective === 'inprogress' ? RetrievalScenario.WAS_WIP_BETWEEN_DATES : RetrievalScenario.BECAME_COMPLETED_BETWEEN_DATES,
        );
        const interval = await this.filters.datePeriod()!;

        const snapshotRecord = await this.getCachedTreatedSnapshots(
            timeZone,
            interval
        );

        const buckets: {
            dateStart: DateTime,
            dateEnd: DateTime,
            workItemList: StateItem[];
            activeTime?: number;
            waitingTime?: number;
            flowEfficiency?: number;
        }[] = separateWorkItemsInIntervalBuckets(
            rawWorkItems,
            interval,
            aggregation,
            perspective === 'inprogress' ? 'commitmentDateTime' :
                perspective === 'completed' ? 'departureDateTime' :
                    'arrivalDateTime'
        );

        const periodList: FlowEfficiencyPeriodData[] = [];

        for (const bucket of buckets) {
            const statesAndSnapshotsRecord: {
                [workItemId: string]: {
                    departureDateTime: DateTime,
                    stateCategory: string,
                    snapshots: TreatedSnapshotItem[];
                };
            } = {};
            for (const item of bucket.workItemList) {
                statesAndSnapshotsRecord[item.workItemId as string] = {
                    departureDateTime: item.departureDateTime as DateTime,
                    stateCategory: perspective,
                    snapshots: snapshotRecord[item.workItemId as string] || [],
                };
            }
            /*
            const result = this.snapshot.calculateActiveTimeAndWaitingTimeBulk(statesAndSnapshotsRecord, arrivalPoint, bucket.dateStart, bucket.dateEnd);
            bucket.activeTime = result.activeTime;
            bucket.waitingTime = result.waitingTime;
            bucket.flowEfficiency = result.flowEfficiency;
            
            periodList.push({
                startDate: bucket.dateStart.toISO().toString(),
                endDate: bucket.dateEnd.toISO().toString(),
                activeCount: bucket.activeTime,
                waitingCount: bucket.waitingTime,
                workItemIdList: [], // No longer necessary // bucket.workItemList.map(a => a.workItemId)
            });
            */
        }

        return periodList;
    }

    async getFlowEfficiencyDonutData(
        arrivalPoint: 'include' | 'exclude',
        perspective: 'inprogress' | 'completed',
    ) {
        const result = { activeTime: 0, waitingTime: 0, activeTimeInHours: '', waitingTimeInHours: '' };

        const workItemList = await this.getCachedWorkItemsByStateCategory(
            perspective === 'inprogress' ? StateCategory.INPROGRESS : StateCategory.COMPLETED
        );
        if (workItemList.length === 0) {
            return result;
        }
        const workItemIdList = workItemList.map(workItem => workItem.workItemId as string);

        const aurora = await this.aurora;

        const contextId = this.filters.getContextId();

        const contextIdList: string[] = await this.workItemQueries.getContextIdsForExtendedItems(
            this.orgId,
            contextId,
        );

        if (contextIdList.length === 0) {
            return result;
        }

        const interval = await this.filters.datePeriod()!;
        const excludeWeekends = !!(await this.filters.getExcludeWeekendsSetting(this.orgId));

        type CustomRowType = {
            workItemId: string;
            activeTime: number | null;
            waitingTime: number | null;
            stateCategory: 'inprogress' | 'completed' | 'proposed' | string;
            activeTimeInSeconds: number | null;
            waitingTimeInSeconds: number | null;
        };

        // There is a comment on the SQL query so that other queries that run in parallel can be distinguished
        const rows: CustomRowType[] = await aurora.query(`
            -- ${workItemIdList.length} work items from ${perspective} and ${arrivalPoint}-ing arrival point
            SELECT
                "workItemId",
                "activeTime",
                "waitingTime",
                "activeTimeInSeconds",
                "waitingTimeInSeconds"
            FROM get_extended_state_items(:orgId, array[:contextIdList], null, array[:workItemIdList], :arrivalPoint, :startDate, :endDate, :timezone, :excludeWeekends)
        `.trim(), {
            replacements: {
                orgId: this.orgId,
                contextIdList,
                workItemIdList,
                startDate: interval.start.toISO(),
                endDate: interval.end.toISO(),
                perspective,
                timezone: this.timezone,
                arrivalPoint: arrivalPoint === 'include' ? true : false,
                excludeWeekends,
            },
            type: QueryTypes.SELECT
        });

        let activeTotalSeconds = 0, waitingTotalSeconds = 0;
        for (const row of rows) {
            if (row.activeTime && row.activeTimeInSeconds) {
                result.activeTime += row.activeTime;
                activeTotalSeconds += row.activeTimeInSeconds;
            }
            if (row.waitingTime && row.waitingTimeInSeconds) {
                result.waitingTime += row.waitingTime;
                waitingTotalSeconds += row.waitingTimeInSeconds;
            }
        }
        result.activeTimeInHours = Math.floor(activeTotalSeconds / 3600) + ":" + Math.floor(activeTotalSeconds % 3600 / 60) + ":" + Math.floor(activeTotalSeconds % 3600 % 60);
        result.waitingTimeInHours = Math.floor(waitingTotalSeconds / 3600) + ":" + Math.floor(waitingTotalSeconds % 3600 / 60) + ":" + Math.floor(waitingTotalSeconds % 3600 % 60);
        result.activeTime = roundToDecimalPlaces(result.activeTime, 2);
        result.waitingTime = roundToDecimalPlaces(result.waitingTime, 2);
        return result;
    }

    async getTimeInStageWithParameters(
        orgId: string,
        perspective: 'inprogress' | 'completed' | 'proposed',
        stepType: 'queue' | 'active',
        stepCategory: 'inprogress' | 'completed' | 'proposed',
        startDate: DateTime,
        endDate: DateTime,
    ): Promise<TimeInStageOption> {
        const stateCategory = {
            'inprogress': StateCategory.INPROGRESS,
            'completed': StateCategory.COMPLETED,
            'proposed': StateCategory.PROPOSED
        }[perspective];
        if (!stateCategory) {
            throw new Error('Unhandled perspective: ' + perspective);
        }

        const workItemList = await this.getCachedWorkItemsByStateCategory(stateCategory);
        const workItemIdList = workItemList.map(workItem => workItem.workItemId as string);

        const option: TimeInStageOption = {
            perspective,
            stepType,
            stepCategory,
            stages: undefined,
        };

        const aurora = await this.aurora;

        const query = ` WITH events AS (
            SELECT 
              ROW_NUMBER() OVER (
                ORDER BY 
                  snapshots."workItemId", 
                  snapshots."flomatikaSnapshotDate"
              ) AS "row_number", 
              snapshots."workItemId", 
              --snapshots."flomatikaSnapshotDate" AS "flomatikaSnapshotDate"
              --date_trunc(
              --'second', snapshots."flomatikaSnapshotDate" + interval '500 millisecond'
              --) 
              snapshots."flomatikaSnapshotDate" at time zone :timezone as "formattedDate", 
              snapshots."stateType", 
              snapshots."state", 
              snapshots."stepCategory", 
              snapshots."revision" 
            FROM 
              snapshots 
            WHERE 
              snapshots."partitionKey" = 'snapshot#' || :orgId 
              AND snapshots."type" = 'state_change'
              AND snapshots."workItemId" in (:workItemIdList)
              and snapshots."isFiller" = false
          ),
          formatted_events as (SELECT 
                  events."workItemId" as "workItemId", 
                  events."revision", 
                  events."formattedDate" AS "previousDate", 
                  coalesce (next_events."formattedDate", :endDate)  AS "nextDate", 
                  events."stateType" AS "stateType",
                  events."stepCategory" AS "stepCategory",
                  events."state" AS "previousState", 
                  next_events."state" AS "nextState" 
                  from events
                  LEFT JOIN events AS next_events ON events.row_number + 1 = next_events.row_number
                  AND next_events."workItemId" = events."workItemId" 
          )
          ,formatted_events_with_difference as (
          	select * ,
          	CASE WHEN (
                    "nextDate" < :startDate 
                    OR "previousDate" > :endDate
                  ) THEN 0 :: FLOAT 
                  WHEN (
                    "previousDate" < :startDate 
                    AND "nextDate" > :startDate
                  ) THEN EXTRACT(
                    EPOCH 
                    FROM 
                      (
                        "nextDate" - :startDate
                      )
                  ) WHEN (
                    "previousDate" < :endDate 
                    AND "nextDate" > :endDate
                  ) THEN EXTRACT(
                    EPOCH 
                    FROM 
                      (
                        :endDate - "previousDate"
                      )
                  ) ELSE EXTRACT(
                    EPOCH 
                    FROM 
                      (
                        "nextDate" - "previousDate"
                      )
                  ) END AS "difference"
                  from formatted_events
                  WHERE 
                   "nextDate" >= :startDate 
                   and "previousDate" < :endDate
          )
          select 
            "previousState" as state, 
            "workItemId",
            sum(difference) as "timeInState"
            -- count(distinct "workItemId") as "workItemCount"
          from formatted_events_with_difference
          where formatted_events_with_difference."stepCategory" = :stepCategory and formatted_events_with_difference."stateType" = :stateType
          group by 
            formatted_events_with_difference."workItemId", 
            formatted_events_with_difference."previousState"`;

        option.workItemCount = workItemIdList.length;
        const rows: Row[] = workItemList.length === 0 ? [] : await aurora.query(query, {
            replacements: {
                orgId,
                startDate: startDate.toISO({ includeOffset: false }).toString(),
                endDate: endDate.toISO({ includeOffset: false }).toString(),
                workItemIdList,
                stateType: stepType,
                stepCategory,
                timezone: this.timezone
            },
            type: QueryTypes.SELECT,
        });

        rows.forEach(row => {
            const d = parseInt(row.timeInState, 10);
            const hours = Math.floor(d / 3600);
            const minutes = Math.floor(d % 3600 / 60);
            const seconds = Math.floor(d % 3600 % 60);
            const millisecond = (parseFloat(row.timeInState) - d).toFixed(3).split('.')[1];
            const timeInStateDays = d / 86400;
            row.timeInState = hours.toString() + ":" + minutes.toString() + ":" + seconds.toString() + "." + millisecond;
            row.timeInStateDays = timeInStateDays;
        });

        const rowsByState: any = _.groupBy(rows, 'state');

        const aggregatedRowsByState: any = [];
        Object.keys(rowsByState).forEach((key: any) => {
            const group = rowsByState[key];
            if (group[0].state) { 
                aggregatedRowsByState.push({
                    state: group[0].state,
                    timeInStateDays: _.sum(group.map((g: any) => g.timeInStateDays)),
                    workItemCount: group.length.toString(),
                    percentile85: getPercentile(85, group.map((g: any) => g.timeInStateDays))
                });
            }
        });

        option.stages = aggregatedRowsByState;

        // for (const row of rows) {
        //     if (!option.stages[row.state]) {
        //         option.stages[row.state] = 0;
        //     }
        //     option.stages[row.state] += parseInt(row.days, 10);
        // }

        return option;
    }

    private async getCachedExtendedWorkItemsByPerspective(scenario: RetrievalScenario) {
        if (this.scenarioWorkItemCache[scenario] instanceof Promise) {
            return await this.scenarioWorkItemCache[scenario];
        } else if (this.scenarioWorkItemCache[scenario]) {
            return this.scenarioWorkItemCache[scenario];
        }

        this.scenarioWorkItemCache[scenario] = this.state.getExtendedWorkItemsWithScenarios(
            this.orgId,
            [scenario],
            this.filters,
            undefined,
            ['workItemId', 'stateCategory', 'arrivalDate', 'commitmentDate', 'departureDate'],
            undefined,
        );

        this.scenarioWorkItemCache[scenario] = await this.scenarioWorkItemCache[scenario];

        return this.scenarioWorkItemCache[scenario];
    }

    async getCachedWorkItemsByStateCategory(stateCategory: StateCategory) {
        if (this.categoryWorkItemCache[stateCategory] instanceof Promise) {
            return await this.categoryWorkItemCache[stateCategory];
        } else if (this.categoryWorkItemCache[stateCategory]) {
            return this.categoryWorkItemCache[stateCategory];
        }

        this.categoryWorkItemCache[stateCategory] = this.state.getWorkItems(
            this.orgId,
            stateCategory,
            this.filters,
            undefined,
            ['workItemId', 'arrivalDate', 'commitmentDate', 'departureDate'],
            undefined,
            true
        );

        this.categoryWorkItemCache[stateCategory] = await this.categoryWorkItemCache[stateCategory];

        return this.categoryWorkItemCache[stateCategory];
    }

    async getFlowEfficiencyWithParameters(
        perspective: 'inprogress' | 'completed',
        includeArrival: 'include' | 'exclude',
        aggregation: AggregationKey,
        timeZone: string,
        interval: Interval
    ) {
        const [
            totals,
            aggregated
        ] = await Promise.all([
            this.getFlowEfficiencyDonutData(
                includeArrival,
                perspective
            ),
            this.calculateFlowEfficiencyOverTime(
                includeArrival,
                perspective,
                aggregation,
                interval
            )
        ]);

        const flowEfficiencyOption: FlowEfficiencyOption = {
            perspective,
            includeArrival,
            totals,
            aggregated,
        };

        return flowEfficiencyOption;
    }

    async calculateFlowEfficiencyOverTime(
        arrivalPoint: 'include' | 'exclude',
        perspective: 'inprogress' | 'completed',
        aggregation: AggregationKey,
        interval: Interval,
    ): Promise<FlowEfficiencyPeriodData[]> {
        const workItemList = await this.getCachedWorkItemsByStateCategory(
            perspective === 'inprogress' ? StateCategory.INPROGRESS : StateCategory.COMPLETED
        );

        const buckets: {
            [startDate: string]: {
                startDate: DateTime,
                endDate: DateTime,
                formattedEndDate: DateTime,
                workItemList: CustomRowType[],
            };
        } = {};

        // Generate Time buckets
        generateDateArray(
            interval,
            aggregation,
        ).forEach(date => buckets[date.toISO()] = {
            startDate: date,
            endDate: date.endOf(aggregation),
            formattedEndDate: date.endOf(aggregation).valueOf() > interval.end.valueOf() ? interval.end : date.endOf(aggregation).plus({ milliseconds: 1 }),
            workItemList: [],
        });

        if (workItemList.length === 0) {
            return [];
        }

        const aurora = await this.aurora;

        const contextId = this.filters.getContextId();

        const contextIdList: string[] = await this.workItemQueries.getContextIdsForExtendedItems(
            this.orgId,
            contextId,
        );

        if (contextIdList.length === 0) {
            return [];
        }

        type CustomRowType = {
            workItemId: string;
            activeTime: number | null;
            waitingTime: number | null;
            stateCategory: 'inprogress' | 'completed' | 'proposed' | string;
            activeTimeInSeconds: number | null;
            waitingTimeInSeconds: number | null;
        };

        const scenario = perspective === 'inprogress' ? RetrievalScenario.WAS_WIP_BETWEEN_DATES : RetrievalScenario.BECAME_COMPLETED_BETWEEN_DATES;

        const unionParts: string[] = [];

        const excludeWeekends = !!(await this.filters.getExcludeWeekendsSetting(this.orgId));

        // Build a big union query
        // Compute flow efficiency for each period by calling the function
        // Do a union of the results to compute flow efficiency over time 
        // with a single call instead of doing one call per bucket
        Object.keys(buckets).forEach(date => {
            const filters = Object.assign({}, this.filters);
            filters.getContextId = this.filters.getContextId;
            filters.datePeriod = async function () {
                return Interval.fromDateTimes(
                    buckets[date].startDate,
                    buckets[date].endDate,
                );
            };
            const query = pgp.as.format(
                `
                (
                    -- ${workItemList.length} work items from ${perspective} and ${arrivalPoint}-ing arrival point
                    SELECT
                        "workItemId",
                        "activeTime",
                        "waitingTime",
                        "activeTimeInSeconds",
                        "waitingTimeInSeconds",
                        '${date}' as "bucketId" 
                    FROM get_extended_state_items($<orgId>, $<contextIdList>, $<sprintIdList>, $<workItemIdList>, $<includeArrivalPoint>, $<startDate>, $<endDate>, $<timezone>, $<excludeWeekends>) 
               )`,
                {
                    orgId: this.orgId,
                    contextIdList,
                    workItemIdList: workItemList.map(workItem => workItem.workItemId as string),
                    startDate: buckets[date].startDate.toISO(),
                    endDate: buckets[date].formattedEndDate.toISO(),
                    timezone: this.timezone,
                    includeArrivalPoint: arrivalPoint === 'include' ? true : false,
                    sprintIdList: [],
                    excludeWeekends
                },
            );

            unionParts.push(query);
        });

        const unionQuery = unionParts.join(`
            union
        `);

        let unionResult: Array<Record<any, any>> = await aurora.query(unionQuery, {
            type: QueryTypes.SELECT,
        });

        // Split the rows back into different buckets by using bucketId
        const groups = _.groupBy(unionResult, row => row.bucketId);
        Object.keys(groups).forEach(bucketId => {
            // Remove the bucketId property from the rows. 
            // We dont need the field after this point. Better avoid clutter
            buckets[bucketId].workItemList = groups[bucketId]
                .map(obj => _.omit(obj, ['bucketId'])) as CustomRowType[];
        });

        const list: FlowEfficiencyPeriodData[] = Object.keys(buckets).sort((a, b) => a.localeCompare(b)).map(date => {
            const activeTime = buckets[date].workItemList?.reduce((last, w) => last + (w.activeTimeInSeconds || 0), 0) || 0;
            const waitingTime = buckets[date].workItemList?.reduce((last, w) => last + (w.waitingTimeInSeconds || 0), 0) || 0;
            return {
                startDate: buckets[date].startDate.toISO().toString().substring(0, 10),
                endDate: buckets[date].endDate.toISO().toString().substring(0, 10),
                workItemIdList: buckets[date].workItemList?.map(w => w.workItemId as string) || [],
                activeCount: buckets[date].workItemList?.reduce((last, w) => last + (w.activeTime || 0), 0) || 0,
                waitingCount: buckets[date].workItemList?.reduce((last, w) => last + (w.waitingTime || 0), 0) || 0,
                count: buckets[date].workItemList?.length || 0,
                activeTimeInHours: Math.floor(activeTime / 3600) + ":" + Math.floor(activeTime % 3600 / 60) + ":" + Math.floor(activeTime % 3600 % 60),
                waitingTimeInHours: Math.floor(waitingTime / 3600) + ":" + Math.floor(waitingTime % 3600 / 60) + ":" + Math.floor(waitingTime % 3600 % 60)
            };
        });
        return list;
    }

    /**
     * @deprecated
     */
    async calculateFlowEfficiencyOverTimeOld(
        arrivalPoint: 'include' | 'exclude',
        perspective: 'inprogress' | 'completed',
        aggregation: AggregationKey,
        timeZone: string,
        interval: Interval,
    ): Promise<FlowEfficiencyPeriodData[]> {
        const rawWorkItems = await this.getCachedExtendedWorkItemsByPerspective(
            perspective === 'inprogress' ? RetrievalScenario.WAS_WIP_BETWEEN_DATES : RetrievalScenario.BECAME_COMPLETED_BETWEEN_DATES,
        );

        // Simplify state items and do aggregation on dates
        const aggregationDateAdjuster = getWorkItemDateAdjuster(aggregation);
        const workItemList: StateItem[] = rawWorkItems.map(workItem => ({
            workItemId: workItem.workItemId,
            stateCategory: workItem.stateCategory,
            arrivalDateTime: workItem.arrivalDateTime,
            commitmentDateTime: workItem.commitmentDateTime,
            departureDateTime: workItem.departureDateTime,
        })).map(
            workItem => aggregationDateAdjuster(workItem as StateItem)
        );
        
        // Generate Time Points for Both Charts
        const dateList: DateTime[] = generateDateArray(
            interval,
            aggregation,
        );

        const buckets: {
            [startDate: string]: {
                startDate: DateTime,
                endDate: DateTime,
                workItemList: StateItem[];
            };
        } = {};

        // Determine Items joining Category in Each Time Block
        for (const date of dateList) {
            const joinedCategoryFilter = generateJoinedCategoryFilter(
                perspective === 'inprogress' ? 'present' : 'past',
                date,
                aggregation,
            );
            const inCategoryList = workItemList.filter(joinedCategoryFilter);

            buckets[date.toISO()] = {
                startDate: date,
                endDate: date.endOf(aggregation),
                workItemList: inCategoryList
            };
        }

        const aurora = await this.aurora;

        if (Object.keys(buckets).length > 500) {
            throw new Error('Cannot execute query because aggregation (' + aggregation + ') is too small for this time period');
        }

        const sortedNonEmptyKeys = Object.keys(buckets)
            .sort((a, b) => a.localeCompare(b))
            .filter(startDate => buckets[startDate].workItemList);

        const contextId = this.filters.getContextId();

        const contextIdList: string[] = await this.workItemQueries.getContextIdsForExtendedItems(
            this.orgId,
            contextId,
        );
        // Create a large union with a select for each date group
        const query = '(' + sortedNonEmptyKeys.map((bucketKey) => {
            const bucket = buckets[bucketKey];
            if (
                !bucket.startDate ||
                !bucket.endDate ||
                !(bucket.startDate instanceof DateTime) ||
                !(bucket.endDate instanceof DateTime) ||
                bucket.startDate.invalidReason ||
                bucket.endDate.invalidReason
            ) {
                throw new Error(`Malformed period date properties at key "${bucketKey}"`);
            }
            const workItemIds = bucket.workItemList.map(workItem => workItem.workItemId as string);

            const snapshotQuery = WorkItemQueries.buildTreatedSnapshotsRetrievalQuery({
                orgId: this.orgId,
                timezone: this.timezone,
                workItemIds,
                contextIdList,
                startDate: bucket.startDate.startOf('day'),
                endDate: bucket.endDate.endOf('day'),
                arrivalPoint: arrivalPoint === 'include' ? true : false,
                columnNames: [
                    `"activeTime"`,
                    `"waitingTime"`,
                    `"stateType"`,
                    `'${bucketKey}' AS "startDate"`
                ]
            });

            const query = `
                ${snapshotQuery} 
            `;
            return query;
        }).filter(
            query => query !== null
        ).join(') UNION ALL (') + ')';
        if (query === '()') return []; ///When there is no item in datasource
        type Row = {
            activeTime: number,
            waitingTime: number,
            stateType: 'active' | 'queue',
            startDate: '2022-01-01T03:00:00Z' | string,
        };

        const rows: Row[] = await aurora.query(query, {
            replacements: {
                orgId: this.orgId,
                timeZone: timeZone,
                stateCategoryList: arrivalPoint === 'include' ? ['proposed', 'inprogress'] : ['inprogress'],
            },
            type: QueryTypes.SELECT,
        });

        const resultRecord: { [startDate: string]: FlowEfficiencyPeriodData; } = {};
        // Setup result object in the right order
        for (const startDate of sortedNonEmptyKeys) {
            const workItemListOnBucket = buckets[startDate].workItemList;

            resultRecord[startDate] = {
                startDate: formatDate(buckets[startDate].startDate, aggregation),
                endDate: formatDate(buckets[startDate].endDate, aggregation),
                workItemIdList: workItemListOnBucket.map(workItem => workItem.workItemId as string),
                activeCount: 0,
                waitingCount: 0,
                count: workItemListOnBucket.length
            };
        }

        for (let row of rows) {
            if (!resultRecord[row.startDate]) {
                continue;
            }

            resultRecord[row.startDate].activeCount += row.activeTime;
            resultRecord[row.startDate].waitingCount += row.waitingTime;

            // convert to decimal places
            resultRecord[row.startDate].activeCount = roundToDecimalPlaces(resultRecord[row.startDate].activeCount, 2);
            resultRecord[row.startDate].waitingCount = roundToDecimalPlaces(resultRecord[row.startDate].waitingCount, 2);
        }

        return Object.values(resultRecord);
    }
}

function formatDate(
    aggregationDate: DateTime,
    aggregation: AggregationKey
) {
    switch (aggregation) {
        case 'month':
            return aggregationDate.toFormat("MMM yyyy");
        case 'quarter':
            return aggregationDate.toFormat("Qq yyyy");
        case 'year':
            return aggregationDate.toFormat("yyyy");
        default:
            return aggregationDate.toFormat("MMM-dd yyyy");
    }
}
