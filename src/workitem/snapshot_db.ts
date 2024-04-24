/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { DateTime, Interval } from 'luxon';
import { IQueryFilters, PredefinedFilterTags } from '../common/filters_v2';
import {
    EfficiencyItem, FlowEfficiencyAverageItem,
    SnapshotItem, StateCategoryGroup, TreatedSnapshotItem
} from './interfaces';
import { IState, StateCategory, StateType } from './state_aurora';

import { Op, QueryTypes, Sequelize } from 'sequelize';
import { CustomFieldsService } from '../data_v2/custom_fields_service';
import { FQLFilterFactory, FQLFilterModel } from '../models/FilterModel';
import { SnapshotModel } from '../models/SnapshotModel';

import { Logger } from 'log4js';
import { WorkItemQueries } from './workitem_queries';

export type WorkItemCountByStateDateMap = {
    [state: string]: {
        [date: string]: number;
    };
};

export type StepCategoryHistory = {
    workItemId: string;
    flomatikaSnapshotDate: Date;
    stepCategory: string;
};

export interface ISnapshot {

    /**
     * This is the central point where all snapshots should be fetched from. It performs a single
     * database query (to get_snapshots) and then fixes the edge cases remaining before returning.
     * @returns A Promise that resolves into a record of workItemId with their ordered snapshot lists.
     * Each key in the record is a work item id, and each value is a list of snapshots in order.
     * The order is from the smallest flomatikaSnapshotDate time to the largest.
     */
    getTreatedSnapshots(
        orgId: string,
        snapshotColumnList?: string[],
        timeZone?: string,
        workItemIdList?: string[],
        workItemTypeIdList?: string[],
        startDate?: Date | DateTime,
        endDate?: Date | DateTime,
    ): Promise<
        { [workItemId: string]: TreatedSnapshotItem[]; }
    >;

    /**
     * @deprecated Use getSnapshotsTz or use the get_snapshots 
     * database functions to fetch snapshots 
     */
    getSnapshots(
        orgId: string,
        stateCategory: StateCategory,
        from: DateTime,
        to: DateTime,
        filters?: IQueryFilters,
        columnNames?: Array<string>,
    ): Promise<{
        snapshots: Array<SnapshotItem>;
        maxDate: DateTime;
    }>;

    getDatabaseCFD(
        orgId: string,
        period: Interval,
        inprogress: string,
        completed: string,
        timezone: string,
        workItemTypeIdList?: string[],
        workItemIdList?: string[],
    ): Promise<{ state: string; date: Date; items: number; }[]>;

    /**
     * @deprecated Because this is dead code. 
     * This function is not called at runtime. 
     * 
     * If you start using this again, change the query 
     * to call get_snapshots instead of querying the snapshots
     * table directly
     * 
     * Marking this deprecated for now
     */
    getStateDateCount(
        orgId: string,
        stepCategory: string,
        period: Interval,
        workItemTypeList: string[],
        workItemIdList: string[],
    ): Promise<WorkItemCountByStateDateMap>;

    /**
     * @deprecated Because this is dead code. 
     * This function is not called at runtime. 
     * 
     * If you start using this again, change the query 
     * to call get_snapshots instead of querying the snapshots
     * table directly
     * 
     * Marking this deprecated for now
     */
    getStepCategoryDateCount(
        orgId: string,
        period: Interval,
        stepCategoryList: string[],
        workItemIdList: string[],
    ): Promise<WorkItemCountByStateDateMap>;


    /**
    * @deprecated Because this is dead code. 
    * 
    * This code was used for the old analytics dashboard
    * 
    * If you start using this again, change the query 
    * to call get_snapshots instead of querying the snapshots
    * table directly
    * 
    * Marking this deprecated for now
    */
    getFlowEfficiencyAverage(
        orgId: string,
        from: DateTime,
        to: DateTime,
        uiFilters?: IQueryFilters,
        filterTags?: string,
        parsedQuery?: string,
    ): Promise<Array<any>>;

    /**
     * @deprecated Because this is dead code. 
     * This function is not called at runtime. 
     * 
     * If you start using this again, change the query 
     * to call get_snapshots instead of querying the snapshots
     * table directly
     * 
     * Marking this deprecated for now
     */
    getActiveAndQueueTime(
        workItemIds: any,
        orgId: string,
        from: DateTime,
        to: DateTime,
        uiFilters?: IQueryFilters,
        customStateCategory?: string,
    ): Promise<Array<FlowEfficiencyAverageItem>>;

    /**
    * @deprecated Because this is dead code. 
    * 
    * This code was used for the old analytics dashboard
    * 
    * If you start using this again, change the query 
    * to call get_snapshots instead of querying the snapshots
    * table directly
    * 
    * Marking this deprecated for now
    */
    getEfficiencyAnalysis(
        orgId: string,
        stateCategory: StateCategory,
        from: DateTime,
        to: DateTime,
        filters?: IQueryFilters,
        workItemsForContext?: Array<string> | undefined,
    ): Promise<EfficiencyItem>;

    /**
    * @deprecated Because this is dead code. 
    * 
    * This code was used for the old analytics dashboard
    * 
    * If you start using this again, change the query 
    * to call get_snapshots instead of querying the snapshots
    * table directly
    * 
    * Marking this deprecated for now
    */
    getStateAnalysis(
        orgId: string,
        from: DateTime,
        to: DateTime,
        proposed: boolean,
        inProgress: boolean,
        filters?: IQueryFilters,
        workItemsForContext?: Array<string> | undefined,
    ): Promise<Array<{ state: string; totalDays: number; }>>;

    /**
    * @deprecated Because this is dead code. 
    * 
    * This code was used for the old analytics dashboard
    * 
    * If you start using this again, change the query 
    * to call get_snapshots instead of querying the snapshots
    * table directly
    * 
    * Marking this deprecated for now
    */
    getWorkflowTrend(
        orgId: string,
        from: DateTime,
        to: DateTime,
        filters?: IQueryFilters,
    ): Promise<Array<StateCategoryGroup>>;

    /**
    * @deprecated Because this is dead code. 
    * 
    * This code was used for the old analytics dashboard
    * 
    * If you start using this again, change the query 
    * to call get_snapshots instead of querying the snapshots
    * table directly
    * 
    * Marking this deprecated for now
    */
    getStepCategoryHistory(
        orgId: string,
        workItemIdList: string[],
    ): Promise<StepCategoryHistory[]>;

    getDiscardedAfterStartActiveDaysSpent(
        orgId: string,
        workItemIdList: string[],
        from: DateTime,
        to: DateTime,
        timezone: string
    ): Promise<{ workItemId: string; count: number; }[]>;

    /**
    * Gets the snapshots for a work item and org Id combination ordered by flomatikaSnapshotDate
    */
    getSnapshotsForWorkItemId(
        workItemId: string,
        orgId: string,
        includeFillers: boolean
    ): Promise<any>;
}

export class Snapshot implements ISnapshot {
    private aurora: Promise<Sequelize>;
    private logger: Logger;
    private customFieldsService: CustomFieldsService;
    private cacheFilters: Map<string, FQLFilterModel[]> = new Map();
    private state: IState;

    constructor(opts: {
        logger: Logger;
        aurora: Promise<Sequelize>;
        customFieldsService: CustomFieldsService;
        state: IState;
    }) {
        this.logger = opts.logger;
        this.aurora = opts.aurora;
        this.customFieldsService = opts.customFieldsService;
        this.state = opts.state;
    }

    async getTreatedSnapshots(
        orgId: string,
        snapshotColumnList?: string[],
        timeZone?: string,
        workItemIdList?: string[],
        workItemTypeIdList?: string[],
        startDate?: Date | DateTime,
        endDate?: Date | DateTime
    ): Promise<
        { [workItemId: string]: TreatedSnapshotItem[]; }
    > {
        if (!snapshotColumnList) {
            snapshotColumnList = [
                'workItemId',
                'flomatikaSnapshotDate',
                'createdAt',
                'updatedAt',
                'changedDate',
                'flomatikaCreatedBy',
                'flomatikaCreatedDate',
                'flomatikaWorkItemTypeId',
                'flomatikaWorkItemTypeLevel',
                'flomatikaWorkItemTypeName',
                'gs2PartitionKey',
                'gs2SortKey',
                'isFiller',
                'partitionKey',
                'revision',
                'sortKey',
                'state',
                'stateCategory',
                'stateOrder',
                'stateType',
                'title',
                'workItemType',
                'assignedTo',
                'flomatikaWorkItemTypeServiceLevelExpectationInDays',
                'classOfServiceId',
                'natureOfWorkId',
                'valueAreaId',
                'projectId',
                'isDelayed',
                'stepCategory',
                'resolution',
            ];
        } else if (!snapshotColumnList.includes('flomatikaSnapshotDate')) {
            // Must have that column to do the fix
            snapshotColumnList.push('flomatikaSnapshotDate');
        }
        // Transform the columns into raw strings
        snapshotColumnList = snapshotColumnList.map(
            column => {
                if (column === 'stateType') {
                    // Edge case 4: When departure date matches the snapshot date the state type is 'active'
                    // otherwise it comes from the column itself
                    return (
                        'CASE WHEN states."departureDate"::DATE = snapshots."flomatikaSnapshotDate"::DATE ' +
                        'THEN \'active\' ELSE snapshots."stateType" END AS "stateType"'
                    );
                } else if (column.includes('"')) {
                    throw new Error('Cannot have quotes on column names for snapshot query');
                } else {
                    return `snapshots."${column}"`;
                }
            }
        );
        const aurora = await this.aurora;
        const rows: any[] = await aurora.query(
            `SELECT ${snapshotColumnList.join(',')}
            FROM public.get_snapshots(
                :orgId,
                :timeZone,
                ${workItemIdList ? 'array[:workItemIdList]' : 'null'},
                ${workItemTypeIdList ? 'array[:workItemTypeIdList]' : 'null'},
                ${startDate ? ':startDate' : 'null'},
                ${endDate ? ':endDate' : 'null'}
            ) AS snapshots
            LEFT JOIN states ON states."partitionKey" = 'state#' || :orgId AND states."workItemId" = snapshots."workItemId"
            WHERE
                snapshots."partitionKey" = 'snapshot#' || :orgId AND
                (states."departureDate" IS NULL OR snapshots."flomatikaSnapshotDate" < states."departureDate")
            ORDER BY "workItemId", "flomatikaSnapshotDate"`,
            {
                replacements: {
                    orgId,
                    workItemIdList,
                    workItemTypeIdList,
                    timeZone: timeZone || 'utc',
                    startDate: startDate instanceof DateTime ? startDate.toJSDate() : startDate,
                    endDate: endDate instanceof DateTime ? endDate.toJSDate() : endDate,
                },
                type: QueryTypes.SELECT,
            }
        );

        for (const row of rows) {
            row.flomatikaSnapshotDate = DateTime.fromJSDate(row.flomatikaSnapshotDate, { zone: timeZone });
        }

        /**
         * Variable to keep track of duplicate dates with a efficient hash map.
         * A Set is just a unique list with fast .has() and .add() methods.
         */
        const snapshotDateSetRecord: { [workItemId: string]: Set<string>; } = {};
        const workItemRecord: { [workItemId: string]: TreatedSnapshotItem[]; } = {};

        for (const row of rows) {
            const workItemId = row.workItemId;
            delete row.workItemId;
            if (!workItemRecord[workItemId]) {
                workItemRecord[workItemId] = [];
                snapshotDateSetRecord[workItemId] = new Set<string>();
            }
            const rowDate = row.flomatikaSnapshotDate.toISODate().toString();
            if (snapshotDateSetRecord[workItemId].has(rowDate)) {
                // Edge case 2: Skip duplicated dates
                continue;
            }
            snapshotDateSetRecord[workItemId].add(rowDate);
            workItemRecord[workItemId].push(row);
        }

        const millisecondsInDay = 3.6e6 * 24;
        for (const workItemId in workItemRecord) {
            const snapshotList = workItemRecord[workItemId];
            for (let i = 0; i < snapshotList.length - 1; i++) {
                // We need to calculate how many days (in a float) there has between the current date and the next.
                // The time part of the date does not matter, we only care about the date part.
                const date = new Date(snapshotList[i].flomatikaSnapshotDate.toISODate().toString() + 'T12:00:00Z');
                const nextDate = new Date(snapshotList[i + 1].flomatikaSnapshotDate.toISODate().toString() + 'T12:00:00Z');
                const daysBetween = (nextDate.getTime() - date.getTime()) / millisecondsInDay;
                // When there are less than or roughly equal to 1 day it is correct
                if (daysBetween <= 1.1) {
                    continue;
                }
                // Edge case 1: Missing days due to timezone shift
                // When there are more than one day of difference we need to add an object on the list
                const addition = {
                    ...snapshotList[i]
                };
                // Put a date between the two dates
                addition.flomatikaSnapshotDate = DateTime.fromMillis(
                    (date.getTime() + nextDate.getTime()) / 2
                );
                // Insert that into the snapshot list
                snapshotList.splice(i + 1, 0, addition);

                // Since we added an element, skip it
                i++;
            }
        }

        return workItemRecord;
    }

    async getStepCategoryHistory(
        orgId: string,
        workItemIdList: string[]
    ): Promise<StepCategoryHistory[]> {

        if (!orgId || !workItemIdList.length) {
            return [];
        }

        const snapshotModel = SnapshotModel(await this.aurora);

        const history = await snapshotModel.findAll({
            attributes: ['workItemId', 'flomatikaSnapshotDate', 'stepCategory'],
            where: {
                partitionKey: `snapshot#${orgId}`,
                workItemId: workItemIdList,
            },
            order: [['flomatikaSnapshotDate', 'DESC']],
        });

        const results: StepCategoryHistory[] = [];

        history.forEach((h: any) => {
            if (h.dataValues) {
                results.push({
                    workItemId: h.workItemId,
                    flomatikaSnapshotDate: h.flomatikaSnapshotDate,
                    stepCategory: h.stepCategory,
                });
            }
        });

        return results;
    }

    async getStateAnalysis(
        orgId: string,
        from: DateTime,
        to: DateTime,
        proposed: boolean,
        inProgress: boolean,
        filters?: any, //IQueryFilters,
        workItemsForContext?: Array<string> | undefined,
    ): Promise<Array<{ state: string; totalDays: number; }>> {
        const aurora = await this.aurora;

        this.logger.debug('connected to aurora');

        const snapshotModel = SnapshotModel(aurora);

        /*
select	count(*) as daysInState, "state"
    	
from	snapshots
WHERE   "partitionKey" = 'snapshot#38aacc6a-18cc-11eb-8613-1c1b0d991873'
AND		"stateCategory"	!= 'completed'
AND 	"stateCategory"	= 'inprogress'
AND     "flomatikaSnapshotDate" >= '2020-12-20'
AND     "flomatikaSnapshotDate" <= '2021-01-19'

group by "state"

order by daysInState desc
*/

        const attributes: any = [
            [Sequelize.fn('COUNT', Sequelize.col('*')), 'daysInState'],
            'state',
        ];

        const group = ['"state"'];
        const order = ['"state"'];

        let where: any = {};
        where['"partitionKey"'] = `snapshot#${orgId}`;
        where['"type"'] = 'state_change';
        where['"stateCategory"'] = {
            [Op.ne]: [
                StateCategory[StateCategory.COMPLETED].toLowerCase(),
                StateCategory[StateCategory.PRECEDING].toLowerCase(),
            ],
        };
        const stateCategories: Array<string> = [];

        if (proposed) {
            stateCategories.push(
                StateCategory[StateCategory.PROPOSED].toLowerCase(),
            );
        }

        if (inProgress) {
            stateCategories.push(
                StateCategory[StateCategory.INPROGRESS].toLowerCase(),
            );
        }

        if (stateCategories.length > 0) {
            where['"stateCategory"'] = stateCategories;
        }

        if (filters?.filterByDate) {
            where['"flomatikaSnapshotDate"'] = {
                [Op.gte]: from.toISO(),
                [Op.lte]: to.toISO(),
            };
        }

        if (filters?.stateTypeFilter !== 'allSteps') {
            where['"stateType"'] =
                filters?.queryParameters?.stateTypeFilter ||
                filters.stateTypeFilter;
        }

        if (filters?.workItemTypes) {
            where['"flomatikaWorkItemTypeId"'] = filters?.workItemTypes;
        }

        if (filters?.workItemLevels) {
            where['"flomatikaWorkItemTypeLevel"'] = filters?.workItemLevels;
        }

        if (filters?.classesOfService) {
            where['"classOfServiceId"'] = filters?.classesOfService;
        }

        if (workItemsForContext) {
            where['"workItemId"'] = workItemsForContext;
        }

        const customFieldSubQueries: Array<{}> = await this.customFieldsService.generateSubQueryFilters(
            orgId,
            snapshotModel,
            filters?.customFields,
        );

        if (customFieldSubQueries.length > 0) {
            where = Object.assign(where, {
                [Op.and]: customFieldSubQueries,
            });
        }

        const stateAnalysisDbResponse = await snapshotModel.findAll({
            attributes,
            where,
            group,
            order,
        });

        const result: Array<{ state: string; totalDays: number; }> = [];

        stateAnalysisDbResponse.forEach((analysis: any) => {
            if (analysis.dataValues) {
                result.push({
                    state: analysis.dataValues.state,
                    totalDays: parseInt(analysis.dataValues.daysInState),
                });
            }
        });

        return result;
    }

    async getEfficiencyAnalysis(
        orgId: string,
        stateCategory: StateCategory,
        from: DateTime,
        to: DateTime,
        filters?: IQueryFilters,
        workItemsForContext?: Array<string> | undefined,
    ): Promise<EfficiencyItem> {
        const aurora = await this.aurora;

        const snapshotModel = SnapshotModel(aurora);

        /*
select	count(*) as daysInState, "stateType"
    	
from	snapshots
WHERE   "partitionKey" = 'snapshot#38aacc6a-18cc-11eb-8613-1c1b0d991873'
AND		"stateCategory"	!= 'completed'
AND 	"stateCategory"	= 'inprogress'
AND     "flomatikaSnapshotDate" >= '2020-12-20'
AND     "flomatikaSnapshotDate" <= '2021-01-19'

group by "stateType"

order by daysInState desc
*/

        const attributes: any = [
            [Sequelize.fn('COUNT', Sequelize.col('*')), 'daysInState'],
            'stateType',
        ];

        const group = ['"stateType"'];

        let where: any = {};
        where['"partitionKey"'] = `snapshot#${orgId}`;
        where['"type"'] = 'state_change';
        where['"stateCategory"'] = filters?.filterByStateCategory
            ? { [Op.eq]: StateCategory[stateCategory].toLowerCase() }
            : {
                [Op.notIn]: [
                    StateCategory[StateCategory.COMPLETED].toLowerCase(),
                    StateCategory[StateCategory.REMOVED].toLowerCase(),
                    StateCategory[StateCategory.PRECEDING].toLowerCase(),
                ],
            };

        if (filters?.filterByDate) {
            where['"flomatikaSnapshotDate"'] = {
                [Op.gte]: from.toISO(),
                [Op.lte]: to.toISO(),
            };
        }

        if (filters?.workItemTypes) {
            where['"flomatikaWorkItemTypeId"'] = filters?.workItemTypes;
        }

        if (filters?.workItemLevels) {
            where['"flomatikaWorkItemTypeLevel"'] = filters?.workItemLevels;
        }

        if (filters?.workflowSteps) {
            where['state'] = { [Op.in]: filters?.workflowSteps };
        }

        if (filters?.classesOfService) {
            where['"classOfServiceId"'] = filters?.classesOfService;
        }

        if (workItemsForContext) {
            where['"workItemId"'] = workItemsForContext;
        }

        const customFieldSubQueries: Array<{}> = await this.customFieldsService.generateSubQueryFilters(
            orgId,
            snapshotModel,
            filters?.customFields,
        );

        if (customFieldSubQueries.length > 0) {
            where = Object.assign(where, {
                [Op.and]: customFieldSubQueries,
            });
        }

        const efficiencyDbResponse = await snapshotModel.findAll({
            attributes,
            where,
            group,
        });

        // console.log('efficiencyDbResponse: %o', efficiencyDbResponse);
        const active: any = efficiencyDbResponse.find(
            //(e: { stateType: string }) =>
            (e: any) =>
                e.dataValues.stateType ===
                StateType[StateType.ACTIVE].toLowerCase(),
        );
        const queue: any = efficiencyDbResponse.find(
            //(e: { stateType: string }) =>
            (e: any) =>
                e.dataValues.stateType ===
                StateType[StateType.QUEUE].toLowerCase(),
        );
        const efficiencyItem: EfficiencyItem = {
            valueAddingTimeInDays: parseInt(
                active?.dataValues.daysInState ?? 0,
            ),
            waitingTimeDays: parseInt(queue?.dataValues.daysInState ?? 0),
        };

        // console.log('efficiencyItem: %o', efficiencyItem);

        return efficiencyItem;
    }

    async getDatabaseCFD(
        orgId: string,
        period: Interval,
        inprogress: string,
        completed: string,
        timezone: string,
        workItemTypeIdList?: string[],
        workItemIdList?: string[],
    ): Promise<{ state: string; date: Date; items: number; }[]> {
        const aurora = await this.aurora;

        const replacements: any = {};

        const functionName = workItemTypeIdList !== undefined && workItemTypeIdList !== null ? 'calculate_cfd' : 'calculate_cfd_stateCategory';

        const sqlQuery = `
            SELECT * FROM ${functionName}(:orgId, :startDate, :endDate, :inprogress, :completed, :workItemTypeId, :workItemIds, :timezone)
        `;

        if (workItemTypeIdList !== undefined && workItemTypeIdList !== null) {
            const arrayValue = `{${'"' + workItemTypeIdList.join('","') + '"'
                }}`;
            replacements.workItemTypeId = arrayValue;
        } else {
            replacements.workItemTypeId = null;
        }

        replacements.orgId = orgId;

        replacements.startDate = period.start.toUTC().toISO();
        replacements.endDate = period.end.toUTC().toISO();
        replacements.timezone = timezone;

        if (workItemIdList) {
            const arrayValue = `{${'"' + workItemIdList.join('","') + '"'
                }}`;
            replacements.workItemIds = arrayValue;
        } else {
            replacements.workItemIds = null;
        }

        replacements.inprogress = inprogress;
        replacements.completed = completed;

        type DatabaseCFDFunctionReturnRow = {
            items?: '136' | string;
            numberofitems?: '136' | string;
            state?: 'Done' | string;
            stateCategory?: 'inprogress' | string;
            date: '2021-12-27' | string;
        };

        const rawCfd: DatabaseCFDFunctionReturnRow[] = await aurora.query(sqlQuery, {
            replacements,
            type: QueryTypes.SELECT,
        });

        const cfd = rawCfd.map(
            (item) => ({
                date: new Date(item.date),
                items: parseInt((item.items || item.numberofitems) as string, 10),
                state: (item.state || item.stateCategory) as string
            })
        );

        return cfd;
    }

    async getStateDateCount(
        orgId: string,
        stepCategory: 'inprogress' | 'completed',
        period: Interval,
        workItemTypeList: string[],
        workItemIdList: string[]
    ) {
        const stateDateCount: WorkItemCountByStateDateMap = {};

        if (workItemIdList.length === 0) {
            return stateDateCount;
        }

        const sql = `
            SELECT
                "flomatikaSnapshotDate"::DATE AS "date",
                "state" AS "state",
                COUNT(*) AS "count"
            FROM "snapshots"
            WHERE
                "partitionKey" = :partitionKey
                AND "type" = 'state_change'
                AND "flomatikaSnapshotDate" >= :snapshotDateStart
                AND "flomatikaSnapshotDate" <= :snapshotDateEnd
                AND "stepCategory" IN (:stepCategory)
                ${workItemTypeList.length > 0 ? `AND "flomatikaWorkItemTypeId" IN (:workItemTypeList)` : ''}
                AND "workItemId" IN (:workItemIdList)
            GROUP BY
                "flomatikaSnapshotDate"::DATE, "state"
        `;

        const aurora = await this.aurora;

        type ResultRow = {
            date: '2022-01-01' | string;
            state: 'Dev Complete' | 'Done' | string;
            count: '1' | '2' | string;
        };

        const rows: ResultRow[] = await aurora.query(sql, {
            type: QueryTypes.SELECT,
            replacements: {
                partitionKey: `snapshot#${orgId}`,
                snapshotDateStart: period.start.toJSDate().toISOString(),
                snapshotDateEnd: period.end.toJSDate().toISOString(),
                workItemTypeList,
                stepCategory,
                workItemIdList,
            }
        });

        for (const row of rows) {
            if (!stateDateCount[row.state]) {
                stateDateCount[row.state] = {};
            }
            if (!stateDateCount[row.state][row.date]) {
                stateDateCount[row.state][row.date] = 0;
            }
            stateDateCount[row.state][row.date] += parseInt(row.count, 10);
        }

        return stateDateCount;
    }

    async getStepCategoryDateCount(
        orgId: string,
        period: Interval,
        stepCategoryList: string[],
        workItemIdList: string[],
    ) {
        const stateDateCount: WorkItemCountByStateDateMap = {};

        if (workItemIdList.length === 0) {
            return stateDateCount;
        }

        const sql = `
            SELECT
                "flomatikaSnapshotDate"::DATE AS "date",
                "stepCategory" AS "stepCategory",
                COUNT(*) AS "count"
            FROM "snapshots"
            WHERE
                "partitionKey" = :partitionKey
                AND "type" = 'state_change'
                AND "flomatikaSnapshotDate" >= :snapshotDateStart
                AND "flomatikaSnapshotDate" <= :snapshotDateEnd
                AND "stepCategory" IN (:stepCategoryList)
                AND "workItemId" IN (:workItemIdList)
            GROUP BY
                "flomatikaSnapshotDate"::DATE, "stepCategory"
        `;

        const aurora = await this.aurora;

        type ResultRow = {
            date: '2022-01-01' | string;
            stepCategory: 'inprogress' | 'completed' | string;
            count: '1' | '2' | string;
        };

        const rows: ResultRow[] = await aurora.query(sql, {
            type: QueryTypes.SELECT,
            replacements: {
                partitionKey: `snapshot#${orgId}`,
                snapshotDateStart: period.start.toJSDate().toISOString(),
                snapshotDateEnd: period.end.toJSDate().toISOString(),
                stepCategoryList,
                workItemIdList,
            }
        });

        for (const row of rows) {
            if (!stateDateCount[row.stepCategory]) {
                stateDateCount[row.stepCategory] = {};
            }
            if (!stateDateCount[row.stepCategory][row.date]) {
                stateDateCount[row.stepCategory][row.date] = 0;
            }
            stateDateCount[row.stepCategory][row.date] += parseInt(row.count, 10);
        }

        return stateDateCount;
    }

    async getSnapshots(
        orgId: string,
        stateCategory: StateCategory,
        from: DateTime,
        to: DateTime,
        filters?: IQueryFilters,
        columnNames?: Array<string>,
    ): Promise<{
        snapshots: any; //Array<SnapshotItem>;
        maxDate: DateTime;
    }> {
        const aurora = await this.aurora;
        const snapshotModel = SnapshotModel(aurora);

        let where: any = {};
        where['"partitionKey"'] = `snapshot#${orgId}`;

        if (filters?.filterByDate) {
            where['"flomatikaSnapshotDate"'] = {
                [Op.gte]: from.toISO(),
                [Op.lte]: to.toISO(),
            };
        }
        if (filters?.workItemTypes) {
            where['"flomatikaWorkItemTypeId"'] = filters?.workItemTypes;
        }

        if (filters?.workItemLevels) {
            where['"flomatikaWorkItemTypeLevel"'] = filters?.workItemLevels;
        }

        if (filters?.workflowSteps) {
            where['state'] = { [Op.in]: filters?.workflowSteps };
        }

        if (filters?.classesOfService) {
            where['"classOfServiceId"'] = filters?.classesOfService;
        }

        if (filters?.filterByStateCategory) {
            where['"stateCategory"'] = StateCategory[
                stateCategory
            ].toLowerCase();
        }

        const customFieldSubQueries: Array<{}> = await this.customFieldsService.generateSubQueryFilters(
            orgId,
            snapshotModel,
            filters?.customFields,
        );

        if (customFieldSubQueries.length > 0) {
            where = Object.assign(where, {
                [Op.and]: customFieldSubQueries,
            });
        }

        const query: any = {
            where,
            order: [['flomatikaSnapshotDate', 'DESC']],
        };

        if (columnNames && columnNames.length > 0) {
            query.attributes = columnNames;
        }

        const snapshots = await snapshotModel.findAll(query);

        return { snapshots: snapshots, maxDate: to };
    }

    async getSnapshotsForWorkItemId(
        workItemId: string,
        orgId: string,
        includeFillers: boolean
    ): Promise<any> {
        const aurora = await this.aurora;
        const snapshotModel = SnapshotModel(aurora);
        let where: any = {};
        where['"partitionKey"'] = `snapshot#${orgId}`;
        where['"workItemId"'] = workItemId;
        where['"isFiller"'] = includeFillers;
        const query: any = {
            where,
            order: [['flomatikaSnapshotDate', 'ASC']],
            raw: true
        };
        const snapshots = await snapshotModel.findAll(query);
        return snapshots;
    }


    async getFQLFilters(
        orgId: string,
        tags: string,
    ): Promise<Array<FQLFilterModel>> {
        const cacheKey = `${orgId}#${tags}`;
        if (this.cacheFilters.has(cacheKey)) {
            return this.cacheFilters.get(cacheKey)!;
        }

        const aurora = await this.aurora;
        const filterModel = FQLFilterFactory(aurora);
        const fqlFilters = await filterModel.findAll({
            where: {
                orgId,
                tags: {
                    [Op.iLike]: `%${tags}%`,
                },
                deletedAt: null,
                parsedQuery: {
                    [Op.not]: ''
                },
            } as any,
        });

        this.cacheFilters.set(cacheKey, fqlFilters);

        return fqlFilters;
    }

    async getActiveAndQueueTime(
        workItemIds: any,
        orgId: string,
        from: DateTime,
        to: DateTime,
        uiFilters?: IQueryFilters,
        customStateCategory?: string,
    ): Promise<Array<FlowEfficiencyAverageItem>> {

        if (!workItemIds || !workItemIds.length) {
            return [];
        }

        const aurora = await this.aurora;
        const contextId = uiFilters?.getContextId();

        let contextPredicate = '';
        if (contextId) {
            const GENERATE_SQL_ONLY = true;
            const contextSubQuery = await this.state.getWorkItemIdsFromContext(
                orgId,
                contextId,
                uiFilters,
                GENERATE_SQL_ONLY,
            );

            contextPredicate = `
                JOIN    "contextWorkItemMaps" cim 
                ON      "snapshotData"."workItemId" = cim."workItemId"
                AND     cim."workItemId" in (${contextSubQuery})
            `;
        }

        const stateCategory =
            customStateCategory || `AND "snapshotData"."stateCategory" != 'preceding'`;

        const query = `
            SELECT  "snapshotData"."stateType",
                    count("snapshotData"."state") as "daysInState",
                    "snapshotData"."workItemId"
            FROM    "snapshots" as "snapshotData"
            JOIN    "states" as "statesData" on "snapshotData"."workItemId" = "statesData"."workItemId"
            ${contextPredicate}
            WHERE
                "snapshotData"."partitionKey" = :partitionKey
                AND "statesData"."partitionKey" = :statePartitionKey
                AND "snapshotData"."type" = 'state_change'
                AND "snapshotData"."workItemId" IN (${workItemIds})
                ${stateCategory}
            GROUP BY
                    "snapshotData"."stateType",
                    "snapshotData"."workItemId"
        `;

        const countOfDaysInState: any[] = await aurora.query(query, {
            replacements: {
                partitionKey: `snapshot#${orgId}`,
                statePartitionKey: `state#${orgId}`,
                startDate: from.toISO(),
                endDate: to.toISO(),
            },
            type: QueryTypes.SELECT,
            raw: true,
            mapToModel: false,
        });
        return countOfDaysInState;
    }

    async getFlowEfficiencyAverage(
        orgId: string,
        from: DateTime,
        to: DateTime,
        uiFilters?: IQueryFilters,
        filterTags: string = PredefinedFilterTags.NORMALISATION,
        parsedQuery?: string,
    ): Promise<Array<FlowEfficiencyAverageItem>> {
        const aurora = await this.aurora;
        const contextId = uiFilters?.getContextId();

        const filters = await this.getFQLFilters(orgId, filterTags);

        if (!filters || (filters.length === 0 && !parsedQuery)) {
            return [];
        }

        let contextPredicate = '';
        if (contextId) {
            const GENERATE_SQL_ONLY = true;
            const contextSubQuery = await this.state.getWorkItemIdsFromContext(
                orgId,
                contextId,
                uiFilters,
                GENERATE_SQL_ONLY,
            );

            if (!contextSubQuery.length) {
                return [];
            }

            contextPredicate = `
            JOIN    "contextWorkItemMaps" cim 
            ON      "snapshotData"."workItemId" = cim."workItemId"
            AND     cim."workItemId" in (${contextSubQuery})
            `;

            // console.log('\x1b[35m%s\x1b[0m', contextPredicate);
        }

        const allQueries: Array<string> = [];
        if (parsedQuery) {
            const predicate = replaceAll(
                `AND (${parsedQuery})`,
                'flomatikaWorkItemTypeName',
                'snapshotData"."flomatikaWorkItemTypeName',
            );
            const query = `
              SELECT  "snapshotData"."stateType",
                      count("snapshotData"."state") as "daysInState",
                      "snapshotData"."workItemType" as "normalisedDisplayName"
              FROM    "snapshots" as "snapshotData"
              JOIN    "states" as "statesData" on "snapshotData"."workItemId" = "statesData"."workItemId"
              ${contextPredicate}
              WHERE   
                "snapshotData"."partitionKey" = :partitionKey
                AND "snapshotData"."type" = 'state_change'
                      ${predicate}
              GROUP BY "snapshotData"."stateType", "snapshotData"."workItemType"
          `;
            allQueries.push(query);
        } else {
            for (const filter of filters) {
                const predicate = replaceAll(
                    `AND (${filter.parsedQuery})`,
                    'flomatikaWorkItemTypeName',
                    'snapshotData"."flomatikaWorkItemTypeName',
                );
                const query = `
                  SELECT  "snapshotData"."stateType",
                          count("snapshotData"."state") as "daysInState",
                          '${filter.displayName}' as "normalisedDisplayName"
                  FROM    "snapshots" as "snapshotData"
                  JOIN    "states" as "statesData" on "snapshotData"."workItemId" = "statesData"."workItemId"
                  ${contextPredicate}

                  WHERE   
                    "snapshotData"."partitionKey" = :partitionKey
                    AND "snapshotData"."type" = 'state_change'
                          ${predicate}

                  GROUP BY "snapshotData"."stateType"
              `;
                allQueries.push(query);
            }
        }

        const finalQuery = allQueries
            .join(' union ')
            .concat(' order by "normalisedDisplayName"');

        const countOfDaysInState: any[] = await aurora.query(finalQuery, {
            replacements: {
                partitionKey: `snapshot#${orgId}`,
                startDate: from.toISODate(),
                endDate: to.toISODate(),
            },
            type: QueryTypes.SELECT,
            raw: true,
            mapToModel: false,
        });

        return countOfDaysInState;
    }

    async getWorkflowTrend(
        orgId: string,
        from: DateTime,
        to: DateTime,
        filters?: IQueryFilters,
    ): Promise<Array<StateCategoryGroup>> {
        const aurora = await this.aurora;
        const contextId = filters?.getContextId();

        let contextPredicate = '';
        if (contextId) {
            const GENERATE_SQL_ONLY = true;
            const contextSubQuery = await this.state.getWorkItemIdsFromContext(
                orgId,
                contextId,
                filters,
                GENERATE_SQL_ONLY,
            );

            contextPredicate = `
			AND 	"workItemId" in (${contextSubQuery})
            `;

            // console.log('\x1b[35m%s\x1b[0m', contextPredicate);
        }

        const countOfStateCategory = await aurora.query(
            `
            select	count(*) as countInState, 
                    "stateCategory", 
                    extract(year from "flomatikaSnapshotDate")::integer as year, 
                    extract(month from "flomatikaSnapshotDate")::integer as month, 
                    extract(week from "flomatikaSnapshotDate")::integer as week, 
                    extract(day from "flomatikaSnapshotDate")::integer as day

            from	snapshots

            WHERE   "partitionKey" = :partitionKey
            AND     "type" = 'state_change'
            AND		"stateCategory"	in ('completed', 'inprogress', 'proposed')
            AND     "flomatikaSnapshotDate" >= :startDate
            AND     "flomatikaSnapshotDate" <= :endDate
            ${contextPredicate}

            group by "stateCategory", year, month, week, day

            order by year, month, week, day
            `,
            {
                replacements: {
                    partitionKey: `snapshot#${orgId}`,
                    startDate: from.toISODate(),
                    endDate: to.toISODate(),
                    contextPredicate,
                },
                type: QueryTypes.SELECT,
                raw: true,
                mapToModel: false,
            },
        );
        const responseItems: Array<StateCategoryGroup> = [];

        countOfStateCategory.forEach((item: any) => {
            responseItems.push({
                count: item.countinstate,
                itemTypeName: item.stateCategory,
                flomatikaSnapshotDate: DateTime.utc(
                    item.year,
                    item.month,
                    item.day,
                ).toISO(),
            });
        });

        return responseItems;
    }

    async getDiscardedAfterStartActiveDaysSpent(
        orgId: string,
        workItemIdList: string[],
        from: DateTime,
        to: DateTime,
        timezone: string
    ): Promise<{ workItemId: string; count: number; }[]> {
        if (workItemIdList.length === 0) {
            return [];
        }
        const aurora = await this.aurora;

        const getSnapshotsQuery = WorkItemQueries.buildSnapshotsRetrievalQuery({
            orgId,
            timezone,
            workItemIds: workItemIdList,
            startDate: from,
            endDate: to
        });
        const query = `
            WITH "getSnapshotsFnResult" AS (
                ${getSnapshotsQuery}
            )
            SELECT
                "workItemId",
                COUNT(*) as "count"
            FROM "getSnapshotsFnResult"
            WHERE "stateType" = 'active'
                AND "flomatikaWorkItemTypeLevel" IN ('Team')
            GROUP BY "workItemId"
        `;

        const result: any[] = await aurora.query(query,
            {
                type: QueryTypes.SELECT,
                raw: true,
                mapToModel: false,
            },
        );

        return result.map((row: {
            workItemId: string,
            count: string;
        }) => ({
            workItemId: row.workItemId,
            count: parseInt(row.count, 10)
        }));
    }
}

function replaceAll(string: string, search: string, replace: string): string {
    return string.split(search).join(replace);
}
