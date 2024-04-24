import { SecurityContext } from '../../../common/security';
import { Logger } from "log4js";
import { DateAnalysisOptions, IQueryFilters, PredefinedFilterTags } from "../../../common/filters_v2";
import { IWorkItemType } from "../../../data_v2/work_item_type_aurora";
import { WidgetInformationUtils } from "../../../utils/getWidgetInformation";
import { ISnapshotQueries } from "../../../workitem/snapshot_queries";
import { IState, StateCategory } from "../../../workitem/state_aurora";
import { PerspectiveKey, getPerspectiveProfile } from '../../../common/perspectives';
import { ExtendedStateItem, StateItem } from '../../../workitem/interfaces';
import { FG_COLOR } from '../../../utils/log_colors';
import _ from 'lodash';
import WorkflowStepsModel from '../../../models/WorkflowStepsModel';
import { DateTime } from 'luxon';
import { TIMEZONE_UTC, validateTzOrUTC } from "../../../utils/date_utils";
import { QueryTypes } from 'sequelize';
import { getPercentile } from '../../../utils/statistics';
import WorkflowEventsModel from '../../../models/WorkflowEventsModel';
type Row = {
    workItemId: string;
    state: string;
    timeInState: string;
    timeInStateDays: number;
};
type StepData = {
    name: string;
    type: string;
    average: number;
    '50thPercentile': number;
    '85thPercentile': number;
    '98thPercentile': number;
    totalTime: number;
    currentWipCount: number;
    totalWipTime: number;
    thresholdWeight?: number;
    items: {
        workItemId: string;
        workItemTitle: string;
        workItemType: string;
        timeInCurrentState: number;
    }[];
};
type WorkItemTypeMapData = {
    projectName: string;
    workItemTypeName: string;
    workflowId: string;
    steps: StepData[];
};
export class Calculations {
    readonly orgId: string;
    readonly state: IState;
    readonly filters: IQueryFilters;
    readonly aurora: any;
    readonly timezone: string;

    private workItemCache: Map<string, Array<ExtendedStateItem>> = new Map();


    constructor(opts: {
        security: SecurityContext;
        logger: Logger;
        state: IState;
        filters: IQueryFilters;
        workItemType: IWorkItemType;
        snapshotQueries: ISnapshotQueries;
        widgetInformationUtils: WidgetInformationUtils;
        aurora: any;
    }) {
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
        this.filters = opts.filters;
        this.filters.dateAnalysisOption = DateAnalysisOptions.all;
        this.aurora = opts.aurora;
        this.timezone = validateTzOrUTC(this.filters?.clientTimezone ?? TIMEZONE_UTC);
    }

    private async getItemsByPerspective(
        perspective: PerspectiveKey,
    ): Promise<ExtendedStateItem[]> {
        const { stateCategory } = getPerspectiveProfile(perspective);

        if (perspective === 'past') {
            console.log(FG_COLOR.GREEN, '------past > became');
            console.log("🚀 ~ file: calculations.ts:60 ~ Calculations ~ console:", console);
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }

        const orgId = this.orgId;
        const { filterByDate, dateAnalysisOption } = this.filters || {};
        const cacheKey = `${orgId}#${perspective}#${filterByDate}#${dateAnalysisOption}`;

        if (this.workItemCache.has(cacheKey)) {
            return this.workItemCache.get(cacheKey) || [];
        } else {
            const workItems = await this.state.getExtendedWorkItems(
                this.orgId,
                [stateCategory],
                this.filters,
                undefined,
                undefined,
                undefined,
                true,
            );

            this.workItemCache.set(cacheKey, workItems);
            return workItems;
        }
    }

    private async getCompletedItemsPast90Days() {
        const filterCopy = _.cloneDeep(this.filters);
        if (
            filterCopy.queryParameters &&
            filterCopy.queryParameters['departureDateUpperBoundary']
        ) {
            filterCopy.queryParameters[
                'departureDateLowerBoundary'
            ] = DateTime.fromISO(
                filterCopy.queryParameters['departureDateUpperBoundary'],
            )
                .minus({ days: 90 })
                .startOf('day')
                .toISO();
        }
        const items = await this.state.getWorkItems(
            this.orgId,
            StateCategory.COMPLETED,
            filterCopy,
            undefined, //fql
            undefined, //column names
            undefined, //isDelayed
            undefined, //disabledDelayed
            undefined, //disabledDiscarded
        );
        // console.log("🚀 ~ file: calculations.ts:120 ~ Calculations ~ getCompletedItemsPast90Days");
        // console.table(items.map(x => ({
        //     id: x.workItemId,
        //     state: x.state
        // })
        // ));
        return items;
    }

    private async getCycleTimesOfItems(workItemIdList: string[]) {
        const aurora = await this.aurora;
        const query = `WITH events AS (
            SELECT 
              ROW_NUMBER() OVER (
                ORDER BY 
                  snapshots."workItemId", 
                  snapshots."flomatikaSnapshotDate"
              ) AS "row_number", 
              snapshots."workItemId",
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
          	 EXTRACT(
                    EPOCH 
                    FROM 
                      (
                        "nextDate" - "previousDate"
                      )
                  ) AS "difference"
                  from formatted_events
          )
          select 
          	fd."workItemId" as "workItemId",
          	fd."previousState" as "state",
          	sum(fd."difference") as "timeInState"
          from formatted_events_with_difference as fd
          group by "workItemId" , "previousState"
        `;

        const rows: Row[] = workItemIdList.length === 0 ? [] : await aurora.query(query, {
            replacements: {
                orgId: this.orgId,
                endDate: DateTime.now().endOf('day').toISO({ includeOffset: false }).toString(),
                workItemIdList,
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
            row.timeInState = hours.toString() + ":" + minutes.toString() + ":" + seconds.toString() + "." + millisecond;
            row.timeInStateDays = d / 86400;
        });
        return rows;
    }


    private async processWorkItemTypeMap(workItemTypeMap: any, completedList: StateItem[],
        wipItems: StateItem[], wipCycleTimes: Row[]): Promise<WorkItemTypeMapData> {
        const workFlowStepsModel = await WorkflowStepsModel();
        const workFlowSteps = await workFlowStepsModel.findAll({
            where: {
                orgId: this.orgId,
                workflowId: workItemTypeMap.workflowId,
                deletedAt: null,
                active: true
            } as any,
            raw: true,
            logging: console.log
        });
        const workflowEventsModel = await WorkflowEventsModel();
        const events = await workflowEventsModel.findOne({
            where: {
                orgId: this.orgId,
                workflowId: workItemTypeMap.workflowId,
                deletedAt: null,
            } as any,
            raw: true,
            logging: console.log
        });
      
        let filteredSortedSteps = workFlowSteps;
        if (events)
            filteredSortedSteps = workFlowSteps.filter(x => {
                const a = parseInt(x.order.toString());
                const b = parseInt(events.commitmentPointOrder.toString());
                const c = parseInt(events.departurePointOrder.toString());
                return a >= b && a < c;
            }).sort((stepa, stepb) => {
                return parseInt(stepa.order.toString()) - parseInt(stepb.order.toString());
            });
        // console.log(`File: calculations.ts, Line: 255 -> filteredSortedSteps`);
        // console.table(filteredSortedSteps);
        const filteredCompletedList = completedList.filter(item => item.projectId === workItemTypeMap.projectId && item.flomatikaWorkItemTypeId === workItemTypeMap.workItemTypeId);
        const cycleTimes = await this.getCycleTimesOfItems(filteredCompletedList.filter(x => x.workItemId !== undefined).map(x => x.workItemId || ''));
        const steps = filteredSortedSteps.map(step => {
            const relevantWipItems = wipItems.filter(x => x.state === step.name
                && x.projectId === workItemTypeMap.projectId && x.flomatikaWorkItemTypeId === workItemTypeMap.workItemTypeId);
            const relevantCycleTimes = cycleTimes.filter(x => x.state === step.name);
            const relevantCycleTimeDurations = relevantCycleTimes.map(x => x.timeInStateDays);
            const uniqueItems = _.uniq(relevantCycleTimes.map(x => x.workItemId)).length;
            const sum = relevantCycleTimeDurations.reduce((prevValue, curr) => {
                return prevValue + curr;
            }, 0);
            const average = sum / uniqueItems;
            return {
                name: step.name,
                type: step.stateType,
                average,
                '50thPercentile': getPercentile(50, relevantCycleTimeDurations),
                '85thPercentile': getPercentile(85, relevantCycleTimeDurations),
                '98thPercentile': getPercentile(98, relevantCycleTimeDurations),
                totalTime: sum,
                currentWipCount: relevantWipItems.length,
                totalWipTime: 0,
                items: relevantWipItems.map(item => {
                    return {
                        workItemId: item.workItemId,
                        workItemTitle: item.title,
                        workItemType: item.workItemType,
                        timeInCurrentState: wipCycleTimes.find(x => x.workItemId === item.workItemId && x.state === item.state)?.timeInStateDays || 0,
                    };
                })
            } as StepData;
        });
        steps.forEach(step => {
            step.totalWipTime = step.items.reduce((prevValue, value) => {
                return prevValue + value.timeInCurrentState;
            }, 0);
        });
        const activeSteps = _.sortBy(steps.filter(x => x.type === 'active'), 'totalWipTime');
      
        return {
            projectName: workItemTypeMap.projectName,
            workItemTypeName: workItemTypeMap.witName,
            workflowId: workItemTypeMap.workflowId,
            steps
        };
    }
    public async getStatesOfWorkItemTypes() {
        const completedItems = await this.getCompletedItemsPast90Days();
        const wipItems = await this.getItemsByPerspective("present");
        // console.table(wipItems.map(x => ({
        //     id: x.workItemId,
        //     wit: x.flomatikaWorkItemTypeId
        // })));
        const projectWitCombinations = _.uniqWith(wipItems.map(item => (
            {
                workItemTypeId: item.flomatikaWorkItemTypeId,
                projectId: item.projectId
            }
        )), _.isEqual);
        const wipItemsCycleTimes = await this.getCycleTimesOfItems(wipItems.map(x => x.workItemId || ''));

        const aurora = await this.aurora;
        const projectWitClause = projectWitCombinations.map(pwit => {
            return `("witm"."workItemTypeId" = '${pwit.workItemTypeId}' AND "witm"."projectId" = '${pwit.projectId}')`;
        }).join(' OR ');
        const query = `
        select witm.*
        , p."name" as "projectName"
        , wit."displayName" as "witName"
        from "workItemTypeMaps" witm 
        inner join "workItemTypes" wit on witm."workItemTypeId"  = wit."workItemTypeId" and wit."deletedAt" is null and wit."orgId" = :orgId
        inner join projects p on p."projectId"  = witm."projectId" and p."deletedAt" is null and p."orgId" = :orgId
        where witm."orgId" = :orgId and witm.archived = false 
        and (${projectWitClause});
        `;

        const workItemTypeMaps = projectWitCombinations.length > 0 ? await aurora.query(query, {
            replacements: {
                orgId: this.orgId,
            },
            type: QueryTypes.SELECT,
            logging: console.log
        }) : [];

        const promises = workItemTypeMaps.map((witm: any) => this.processWorkItemTypeMap(witm, completedItems, wipItems, wipItemsCycleTimes));
        let results: WorkItemTypeMapData[] = await Promise.all(promises);
        results = results.filter(x => x.steps.length > 0);
        results.forEach(result => {
            result.steps.forEach((step, index) => {
                if (!step.thresholdWeight)
                    step.thresholdWeight = 1;
                if (step.type === 'queue') {
                    const nextActiveStep = result.steps.findIndex((x, i) => i > index && x.type === 'active');
                    if (nextActiveStep > -1)
                        result.steps[nextActiveStep].thresholdWeight = (result.steps[nextActiveStep].thresholdWeight || 1) + step.totalWipTime;
                }
            });
        });
        return results;
    }


}