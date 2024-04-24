import { groupBy } from 'lodash';
import { Logger } from 'log4js';

import {
    IQueryFilters,
    PredefinedFilterTags,
} from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import {
    FlowEfficiencyAverageItem,
    KeySourceOfDelayItem,
    SnapshotItem,
} from '../workitem/interfaces';
import { ISnapshotQueries } from '../workitem/snapshot_queries';
import {
    StateCategory,
    StateType,
} from '../workitem/state_aurora';

export type CFDNewDataItem = {
    stateName: string;
    summary: {
        arrivalRate: number;
        departureRate: number;
        dailyAverage: number;
        averageCycleTime: number;
    };
    cumulativeFlowData: Record<string | '2020-01-01', number | 0>;
};

export type CfdDataItem = {
    stateName: string;
    cumulativeFlowData: { sampleDate: Date; numberOfItems: number | null }[];
};

export type FlowEfficiencyAnalysis = {
    valueAddingTimeDays: number;
    waitingTimeDays: number;
};

export type FlowEfficiencyAvgItem = {
    flowEfficiencyAverage: string;
    itemTypeName: string;
};

export type TimeInStateInDays = {
    workItemId: string;
    state: string;
    stateCategory: string;
    stateType: string;
    daysInState: number;
    flomatikaWorkItemTypeName?: string;
    flomatikaWorkItemTypeId?: number;
};

type KeySourceDelay = {
    itemTypeName: string;
    keySourceOfDelay: string;
};

export class Calculations {
    private orgId: string;
    private snapshotQueries: ISnapshotQueries;
    private snapShots?: Array<SnapshotItem>;
    private filters?: IQueryFilters;
    private logger: Logger;
    private completedSnapShots?: Array<SnapshotItem>;

    constructor(opts: {
        security: SecurityContext;
        snapshotQueries: ISnapshotQueries;
        filters?: IQueryFilters;
        logger: Logger;
    }) {
        this.orgId = opts.security.organisation!;
        this.snapshotQueries = opts.snapshotQueries;
        this.filters = opts.filters;
        this.logger = opts.logger;
    }

    private async getSnapshots(stateCategory = StateCategory.INPROGRESS) {
        this.logger.debug('getSnapshots');
        // if (!this.snapShots) {
        const snapShotsInProgress = await this.snapshotQueries.getSnapshots(
            this.orgId,
            stateCategory,
            this.filters,
        );

        this.snapShots = snapShotsInProgress;
        // }
        return this.snapShots!;
    }

    async getFlowEfficiencyAvg(
        parsedQuery?: string,
    ): Promise<Array<FlowEfficiencyAvgItem>> {
        const result: Array<FlowEfficiencyAvgItem> = [];
        const flowEfficiencyItems: Array<FlowEfficiencyAverageItem> = await this.snapshotQueries.getFlowEfficiencyAverage(
            this.orgId,
            parsedQuery,
        );

        const groupedByTypeName = groupBy(
            flowEfficiencyItems,
            'normalisedDisplayName',
        );

        Object.keys(groupedByTypeName).forEach((itemTypeName) => {
            const currentItemsByDisplayName = groupedByTypeName[itemTypeName];
            const activeDaysInState =
                currentItemsByDisplayName.find(
                    (item) => item.stateType === 'active',
                )?.daysInState ?? 0;
            const queueDaysInState =
                currentItemsByDisplayName.find(
                    (item) => item.stateType === 'queue',
                )?.daysInState ?? 0;

            const total: number =
                Number(activeDaysInState) + Number(queueDaysInState);
            const avgValue =
                !total || !activeDaysInState
                    ? 0
                    : (activeDaysInState / total) * 100;

            result.push({
                itemTypeName,
                flowEfficiencyAverage: avgValue
                    ? `${Math.round(avgValue)}%`
                    : '-',
            });
        });
        return result;
    }

    async getRawSnapshots(): Promise<SnapshotItem[]> {
        // this.logger.debug('getRawSnapshots');
        if (!this.completedSnapShots) {
            this.filters!.filterByStateCategory = true;
            const completedSnapShots = (await this.getSnapshots(StateCategory.COMPLETED));
            this.completedSnapShots = completedSnapShots;
            return completedSnapShots;
        }
        return this.completedSnapShots;
    }

    async getCalculatedCompletedWorkItemsTimeInState(): Promise<
        TimeInStateInDays[]
    > {
        const snapshots: SnapshotItem[] = await this.getRawSnapshots();
        const timeInState: TimeInStateInDays[] = this.calculateTimeInStateInDays(
            snapshots,
        );
        return timeInState;
    }

    async getFlowEfficiencyAnalysisData(
        flowEfficiencyFromArrivalPoint?: string | undefined,
    ): Promise<FlowEfficiencyAnalysis> {
        this.logger.debug('getFlowEfficiencyAnalysisData');
        let snapshots = await this.getRawSnapshots();

        let flowEfficiencyFromArrivalPointParam: boolean = false;
        if (flowEfficiencyFromArrivalPoint !== undefined) {
            flowEfficiencyFromArrivalPointParam = JSON.parse(
                flowEfficiencyFromArrivalPoint,
            );
        }
        if (!flowEfficiencyFromArrivalPointParam) {
            console.log(
                'in progress only: ',
                !flowEfficiencyFromArrivalPointParam,
            );
            snapshots = snapshots.filter(
                (revision) =>
                    revision.stateCategory?.toLowerCase() ===
                    StateCategory[StateCategory.INPROGRESS].toLowerCase(),
            );
        }

        const result = {
            valueAddingTimeDays: 0,
            waitingTimeDays: 0,
        };

        const timeInState = this.calculateTimeInStateInDays(snapshots);

        timeInState.forEach((timeInStateDays) => {
            if (
                timeInStateDays.stateType ===
                StateType[StateType.ACTIVE].toLowerCase()
            ) {
                result.valueAddingTimeDays += timeInStateDays.daysInState;
            } else {
                result.waitingTimeDays += timeInStateDays.daysInState;
            }
        });

        return result;
    }

    /**
        Given an array of daily snapshots, reduce it to an array with an entry for each workItemId and state
        and the number of times that combination appears in the original array
    */
    calculateTimeInStateInDays(
        snapshots: Array<SnapshotItem>,
    ): Array<TimeInStateInDays> {
        // this.logger.debug('calculateTimeInStateInDays');

        const result = snapshots.sort(
            (a, b) =>
                parseInt(a.workItemId!) - parseInt(b.workItemId!) ||
                a.revision! - b.revision!,
        );

        let timeInStateInDays: TimeInStateInDays[] = result.map(
            (revision: any) =>
            ({
                workItemId: revision.workItemId,
                state: revision.state,
                stateCategory: revision.stateCategory,
                stateType: revision.stateType,
                daysInState: 1,
                flomatikaWorkItemTypeName: revision.flomatikaWorkItemTypeName,
                flomatikaWorkItemTypeId: revision.flomatikaWorkItemTypeId,
            }),
        );

        timeInStateInDays = timeInStateInDays.reduce(
            (consolidated, current) => {
                const lastConsolidatedEntry =
                    consolidated[consolidated.length - 1];

                if (
                    lastConsolidatedEntry &&
                    lastConsolidatedEntry.workItemId === current.workItemId &&
                    lastConsolidatedEntry.state === current.state
                ) {
                    lastConsolidatedEntry.daysInState++;
                } else {
                    consolidated.push({
                        workItemId: current.workItemId,
                        state: current.state,
                        stateCategory: current.stateCategory,
                        stateType: current.stateType,
                        daysInState: 1,
                        flomatikaWorkItemTypeName:
                            current.flomatikaWorkItemTypeName,
                        flomatikaWorkItemTypeId:
                            current.flomatikaWorkItemTypeId,
                    });
                }

                return consolidated;
            },
            new Array<TimeInStateInDays>(),
        );

        return timeInStateInDays;
    }

    async getStateAnalysisData(
        proposed: boolean,
        inProgress: boolean,
    ): Promise<Array<{ state: string; totalDays: number }>> {
        this.logger.debug('getStateAnalysisData');
        this.filters!.filterByStateCategory = false;

        const rawSnapshots = await this.getRawSnapshots();

        let inProgressItems: Array<SnapshotItem> = [];

        if (inProgress) {
            inProgressItems = rawSnapshots.filter(
                (workItem) =>
                    workItem.stateCategory?.toLowerCase() ===
                    StateCategory[StateCategory.INPROGRESS].toLowerCase(),
            );
        }

        let proposedItems: Array<SnapshotItem> = [];

        if (proposed) {
            proposedItems = rawSnapshots.filter(
                (workItem) =>
                    workItem.stateCategory?.toLowerCase() ===
                    StateCategory[StateCategory.PROPOSED].toLowerCase(),
            );
        }

        const finalItems = inProgressItems.concat(proposedItems);

        return this.calculateTimeInStateInDays(finalItems)
            .sort((itemA, itemB) => (itemA.state < itemB.state ? -1 : 1))
            .reduce((stateCounts, currentItem) => {
                const lastItem = stateCounts[stateCounts.length - 1];

                if (lastItem && lastItem.state === currentItem.state) {
                    lastItem.totalDays =
                        lastItem.totalDays + currentItem.daysInState;
                } else {
                    stateCounts.push({
                        state: currentItem.state,
                        totalDays: currentItem.daysInState,
                    });
                }

                return stateCounts;
            }, new Array<{ state: string; totalDays: number }>());
    }
}
