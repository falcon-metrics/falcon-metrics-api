import {
    DateTime,
    Interval,
} from 'luxon';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    IQueryFilters,
    PredefinedFilterTags,
} from '../common/filters_v2';
import { IContextFilter } from '../context/context_filter';
import {
    FlowEfficiencyAnalysis,
} from '../flow_efficiency/calculations';
import { TIMEZONE_UTC } from '../utils/date_utils';
import {
    EfficiencyItem,
    FlowEfficiencyAverageItem,
    SnapshotItem,
    StateCategoryGroup,
} from './interfaces';
import { ISnapshot, WorkItemCountByStateDateMap } from './snapshot_db';
import {
    IState,
    StateCategory,
} from './state_aurora';

export interface ISnapshotQueries {

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
        { [workItemId: string]: any[]; }
    >;

    /**
     * @deprecated use getFixedSnapshots to get the snapshots without the problematic edge cases.
     * 
     * If you start using this again, change the query 
     * to call get_snapshots instead of querying the
     * table directly.
     */
    getSnapshots(
        orgId: string,
        stateCategory: StateCategory,
        filters?: IQueryFilters,
        columnNames?: Array<string>,
    ): Promise<Array<SnapshotItem>>;

    /**
    * @deprecated Because this was used for the
    * old analytics dashboard. Its not being used anymore
    * 
    * If you start using this again, change the query 
    * to call get_snapshots instead of querying the
    * table directly
    * 
    * Marking this deprecated for now
    */
    getFlowEfficiencyAverage(
        orgId: string,
        parsedQuery?: string,
    ): Promise<Array<any>>;

    /**
    * @deprecated Because this is dead code. 
    * This function is not called at runtime. 
    * 
    * If you start using this again, change the query 
    * to call get_snapshots instead of querying the
    * table directly
    * 
    * Marking this deprecated for now
    */
    getActiveAndQueueTime(
        workItemsId: string[],
        orgId: string,
    ): Promise<Array<FlowEfficiencyAverageItem>>;

    /**
    * @deprecated Because this is dead code. 
    * This function is not called at runtime. 
    * 
    * If you start using this again, change the query 
    * to call get_snapshots instead of querying the
    * table directly
    * 
    * Marking this deprecated for now
    */
    getWorkflowTrend(
        orgId: string,
        from: DateTime,
        to: DateTime,
    ): Promise<Array<StateCategoryGroup>>;

    /**
     * @deprecated Because this is dead code. 
     * This function is not called at runtime. 
     * 
     * If you start using this again, change the query 
     * to call get_snapshots instead of querying the
     * table directly
     * 
     * Marking this deprecated for now
     */
    getStateDateCount(
        orgId: string,
        stepCategory: 'inprogress' | 'completed',
        period: Interval,
        workItemTypeList: string[],
        workItemIdList: string[],
    ): Promise<WorkItemCountByStateDateMap>;

    /**
    * @deprecated Because this is dead code. 
    * This function is not called at runtime. 
    * 
    * If you start using this again, change the query 
    * to call get_snapshots instead of querying the
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

    getDatabaseCFD(
        orgId: string,
        period: Interval,
        inprogress: string,
        completed: string,
        timezone: string,
        workItemTypeIdList?: string[],
        workItemIdList?: string[]
    ): Promise<{ state: string; date: Date; items: number; }[]>;

    getDiscardedAfterStartActiveDaysSpent(
        orgId: string,
        workItemIdList: string[],
        from: DateTime,
        to: DateTime,
    ): Promise<{ workItemId: string, count: number; }[]>;
}

export class SnapshotQueries implements ISnapshotQueries {
    private state: IState;
    private snapshot: ISnapshot;
    private filters: IQueryFilters;
    private contextFilter: IContextFilter;

    constructor(opts: {
        state: IState;
        snapshot: ISnapshot;
        filters: IQueryFilters;
        contextFilter: IContextFilter;
    }) {
        this.snapshot = opts.snapshot;
        this.state = opts.state;
        this.filters = opts.filters;
        this.contextFilter = opts.contextFilter;
    }

    getTreatedSnapshots(
        orgId: string,
        snapshotColumnList?: string[],
        timeZone?: string,
        workItemIdList?: string[],
        workItemTypeIdList?: string[],
        startDate?: Date | DateTime,
        endDate?: Date | DateTime
    ) {
        return this.snapshot.getTreatedSnapshots(
            orgId,
            snapshotColumnList,
            timeZone,
            workItemIdList,
            workItemTypeIdList,
            startDate,
            endDate,
        );
    }

    private async getWorkItemsForContext(
        orgId: string,
        contextId: string,
        filters?: IQueryFilters,
    ): Promise<Array<string>> {
        const workItemIdsFromContext: Array<string> = await this.state.getWorkItemIdsFromContext(
            orgId,
            contextId,
            filters,
        );

        return workItemIdsFromContext;
    }

    async getDiscardedAfterStartActiveDaysSpent(
        orgId: string,
        workItemIdList: string[],
        from: DateTime,
        to: DateTime,
    ): Promise<{ workItemId: string, count: number; }[]> {
        return this.snapshot.getDiscardedAfterStartActiveDaysSpent(
            orgId,
            workItemIdList,
            from,
            to,
            this.filters.clientTimezone ?? TIMEZONE_UTC
        );
    }

    async getEfficiencyAnalysis(
        orgId: string,
        stateCategory: StateCategory,
        filters?: IQueryFilters,
    ): Promise<FlowEfficiencyAnalysis> {
        const period = await this.filters.datePeriod()!;
        let workItemsForContext: Array<string> | undefined;

        const contextId = filters?.getContextId();
        if (contextId) {
            workItemsForContext = await this.getWorkItemsForContext(
                orgId,
                contextId,
            );
        }

        const efficientItem: EfficiencyItem = await this.snapshot.getEfficiencyAnalysis(
            orgId,
            stateCategory,
            period.start,
            period.end,
            filters,
            workItemsForContext,
        );

        const flowEfficiencyAnalysis: FlowEfficiencyAnalysis = {
            valueAddingTimeDays: efficientItem.valueAddingTimeInDays!,
            waitingTimeDays: efficientItem.waitingTimeDays!,
        };

        return flowEfficiencyAnalysis;
    }

    async getActiveAndQueueTime(
        workItemsId: string[],
        orgId: string,
        customStateCategory?: string,
    ): Promise<Array<FlowEfficiencyAverageItem>> {
        const period: Interval = await this.filters.datePeriod()!;
        const flowEfficiencyItems = await this.snapshot.getActiveAndQueueTime(
            workItemsId,
            orgId,
            period.start,
            period.end,
            this.filters,
            customStateCategory,
        );
        return flowEfficiencyItems;
    }

    // For calculate avgFlowEfficiency in summary table 'present'
    async getFlowEfficiencyAverage(
        orgId: string,
        parsedQuery?: string,
    ): Promise<Array<FlowEfficiencyAverageItem>> {
        const period: Interval = await this.filters.datePeriod()!;

        const flowEfficiencyItems = await this.snapshot.getFlowEfficiencyAverage(
            orgId,
            period.start,
            period.end,
            this.filters,
            parsedQuery ? undefined : PredefinedFilterTags.DEMAND,
            parsedQuery,
        );

        return flowEfficiencyItems;
    }

    async getSnapshots(
        orgId: string,
        stateCategory: StateCategory,
        filters?: IQueryFilters,
        columnNames?: Array<string>,
    ): Promise<SnapshotItem[]> {
        if (!orgId || orgId === '') return [];

        const period = await this.filters.datePeriod()!;
        const contextId = filters?.getContextId();

        const snapshotResult = await this.snapshot.getSnapshots(
            orgId,
            stateCategory,
            period.start,
            period.end,
            filters,
            columnNames,
        );

        let contextFilteredSnapshots: Array<SnapshotItem>;

        if (contextId) {
            const workItemIdsFromContext: Array<string> = await this.getWorkItemsForContext(
                orgId,
                contextId,
            );

            contextFilteredSnapshots = snapshotResult.snapshots.filter(
                (snapshotItem) =>
                    workItemIdsFromContext.includes(snapshotItem.workItemId!),
            );
        } else {
            contextFilteredSnapshots = snapshotResult.snapshots;
        }

        const snapshots = contextFilteredSnapshots;

        if (snapshots.length < 1) return [];

        return snapshots;
    }

    async getWorkflowTrend(
        orgId: string,
        from: DateTime,
        to: DateTime,
    ): Promise<Array<StateCategoryGroup>> {
        if (!orgId || orgId === '') return [];

        let start = from;
        let end = to;

        if (!start || !end) {
            const period = await this.filters.datePeriod()!;
            start = period.start;
            end = period.end;
        }

        const snapshotResult = await this.snapshot.getWorkflowTrend(
            orgId,
            start,
            end,
            this.filters,
        );

        return snapshotResult;
    }

    async getStateDateCount(
        orgId: string,
        stepCategory: 'inprogress' | 'completed',
        period: Interval,
        workItemTypeList: string[],
        workItemIdList: string[]
    ) {
        return this.snapshot.getStateDateCount(orgId, stepCategory, period, workItemTypeList, workItemIdList);
    }

    async getStepCategoryDateCount(
        orgId: string,
        period: Interval,
        stepCategoryList: string[],
        workItemIdList: string[]
    ) {
        return this.snapshot.getStepCategoryDateCount(orgId, period, stepCategoryList, workItemIdList);
    }

    async getDatabaseCFD(
        orgId: string,
        period: Interval,
        inprogress: string,
        completed: string,
        timezone: string,
        workItemTypeIdList?: string[],
        workItemIdList?: string[]
    ): Promise<{ state: string; date: Date; items: number; }[]> {
        return await this.snapshot.getDatabaseCFD(
            orgId,
            period,
            inprogress,
            completed,
            timezone,
            workItemTypeIdList,
            workItemIdList
        );
    }

}
