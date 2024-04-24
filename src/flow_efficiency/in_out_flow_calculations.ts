import { groupBy } from 'lodash';
import { Interval } from 'luxon';
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { IQueryFilters, PredefinedFilterTags } from '../common/filters_v2';
import { Logger } from 'log4js';
import { IContextFilter } from '../context/context_filter';
import { DateTime } from 'luxon';
import { StateItem, DemandVsCapacityItem } from '../workitem/interfaces';
import { IState, StateCategory } from '../workitem/state_aurora';

type WeeklyItemCount = { weekStartingOn: DateTime; count: number };

export type InOutFlowData = {
    weeklyCumulativeFlow?: {
        inflowItems: Array<WeeklyItemCount>;
        outflowItems: Array<WeeklyItemCount>;
    };

    weeklyFlow?: {
        inflowItems: Array<WeeklyItemCount>;
        outflowItems: Array<WeeklyItemCount>;
    };
};

export type DemandVsCapcity = {
    inflowItems: Array<any>;
    outflowItems: Array<any>;
};

type DemandVsCapacity = {
    demandVsCapacity: string;
    itemTypeName: string;
};

export class InOutFlowCalculations {
    private orgId: string;
    private state: IState;
    private filters?: IQueryFilters;
    private inFlowWorkItems?: Array<StateItem>;
    private outFlowWorkItems?: Array<StateItem>;

    constructor(opts: {
        orgId: string;
        state: IState;
        filters?: IQueryFilters;
        contextFilter: IContextFilter;
    }) {
        this.orgId = opts.orgId;
        this.state = opts.state;
        this.filters = opts.filters;
    }

    private async getStateItems(
        stateCategory: StateCategory,
    ): Promise<StateItem[]> {
        const stateItems = await this.state.getWorkItems(
            this.orgId,
            stateCategory,
            this.filters,
            undefined,
            undefined,
            undefined,
            false,
        );
        return stateItems;
    }

    private async getInFlowWorkItems(): Promise<StateItem[]> {
        if (!this.inFlowWorkItems) {
            const currentData = await this.getStateItems(
                StateCategory.INPROGRESS,
            );

            //Get all InFlow work
            const inflowItems = currentData.sort(function (a, b) {
                return (
                    DateTime.fromISO(a.commitmentDate!).valueOf() -
                    DateTime.fromISO(b.commitmentDate!).valueOf()
                );
            });

            this.inFlowWorkItems = inflowItems;
        }

        return this.inFlowWorkItems;
    }

    private async getOutFlowWorkItems(): Promise<StateItem[]> {
        if (!this.outFlowWorkItems) {
            const currentData = await this.getStateItems(
                StateCategory.COMPLETED,
            );

            //Get all OutFlow work
            const outflowItems = currentData.sort(function (a, b) {
                return (
                    DateTime.fromISO(a.departureDate!).valueOf() -
                    DateTime.fromISO(b.departureDate!).valueOf()
                );
            });

            this.outFlowWorkItems = outflowItems;
        }

        return this.outFlowWorkItems;
    }

    async getDemandVsCapacity(
        parsedQuery?: string,
    ): Promise<Array<DemandVsCapacity>> {
        const period: Interval = await this.filters?.datePeriod()!;

        const result: Array<DemandVsCapacity> = [];
        const demandCapacityItems: Array<DemandVsCapacityItem> = await this.state.getDemandVsCapacity(
            this.orgId,
            period.start,
            period.end,
            this.filters,
            parsedQuery ? undefined : PredefinedFilterTags.DEMAND,
            parsedQuery,
        );

        const groupedByTypeName: any = groupBy(
            demandCapacityItems,
            parsedQuery ? 'flomatikaWorkItemTypeName' : 'normalisedDisplayName',
        );

        Object.keys(groupedByTypeName).forEach((itemTypeName) => {
            const [commitmentItem, departureItem] = groupedByTypeName[
                itemTypeName
            ].sort((a: DemandVsCapacityItem, b: DemandVsCapacityItem) => {
                return a?.workflowEvent.localeCompare(b?.workflowEvent);
            });

            const commitmentStateCount = Number(
                commitmentItem?.stateCount || 0,
            );
            const departureItemStateCount = Number(
                departureItem?.stateCount || 0,
            );
            const demandVsCapacity =
                !commitmentStateCount || !departureItemStateCount
                    ? 0
                    : departureItemStateCount / commitmentStateCount;

            let response;
            if (demandVsCapacity === 0) {
                response = 'Balanced demand and capacity';
            } else if (demandVsCapacity < 1) {
                response = `${Math.round(
                    (1 - demandVsCapacity) * 100,
                )}% more demand than capacity`;
            } else {
                response = `${Math.round(
                    (demandVsCapacity - 1) * 100,
                )}% more capacity than demand`;
            }

            result.push({
                itemTypeName,
                demandVsCapacity: demandVsCapacity ? response : '-',
            });
        });
        return result;
    }

    async getCapacityVsDemand(): Promise<InOutFlowData> {
        this.filters!.filterByStateCategory = false;
        const weeklyCumulativeInflowItems = await this.getWeeklyCumulativeInflowData();
        const weeklyCumulativeOutflowItems = await this.getWeeklyCumulativeOutflowData();

        const weeklyInflowItems = await this.getWeeklyInflowData();
        const weeklyOutflowItems = await this.getWeeklyOutflowData();

        return {
            weeklyCumulativeFlow: {
                inflowItems: weeklyCumulativeInflowItems,
                outflowItems: weeklyCumulativeOutflowItems,
            },
            weeklyFlow: {
                inflowItems: weeklyInflowItems,
                outflowItems: weeklyOutflowItems,
            },
        };
    }

    private async getWeeklyCumulativeInflowData(): Promise<
        Array<WeeklyItemCount>
    > {
        const inflowWorkItems = await this.getInFlowWorkItems();

        if (!inflowWorkItems || inflowWorkItems.length < 1) return [];

        const firstCommitmentDate = DateTime.fromISO(
            inflowWorkItems[0].commitmentDate!,
        )
            .startOf('week')
            .startOf('day');

        const result = inflowWorkItems.reduce(
            (theArray, stateItem) => {
                if (!stateItem.commitmentDate) return theArray;

                const commitmentDate = DateTime.fromISO(
                    stateItem.commitmentDate,
                )
                    .startOf('week')
                    .startOf('day');

                const indexOfItemCurrentWeek = theArray.findIndex(
                    (a) =>
                        a.weekStartingOn.valueOf() === commitmentDate.valueOf(),
                );

                if (indexOfItemCurrentWeek > -1) {
                    theArray[indexOfItemCurrentWeek].count += 1;
                } else {
                    const maxCountSoFar = Math.max(
                        ...theArray.map((a) => a.count),
                    );
                    const accumulate = maxCountSoFar + 1;

                    theArray.push({
                        weekStartingOn: commitmentDate,
                        count: accumulate,
                    });
                }

                return theArray;
            },
            new Array<WeeklyItemCount>({
                weekStartingOn: firstCommitmentDate,
                count: 0,
            }),
        );
        return result;
    }

    private async getWeeklyInflowData(): Promise<Array<WeeklyItemCount>> {
        const inflowWorkItems = await this.getInFlowWorkItems();

        if (!inflowWorkItems || inflowWorkItems.length < 1) return [];

        const firstCommitmentDate = DateTime.fromISO(
            inflowWorkItems[0].commitmentDate!,
        )
            .startOf('week')
            .startOf('day');

        const result = inflowWorkItems.reduce(
            (theArray, stateItem) => {
                if (!stateItem.commitmentDate) return theArray;

                const commitmentDate = DateTime.fromISO(
                    stateItem.commitmentDate!,
                )
                    .startOf('week')
                    .startOf('day');

                const indexOfItem = theArray.findIndex(
                    (a) =>
                        a.weekStartingOn.valueOf() === commitmentDate.valueOf(),
                );

                if (indexOfItem > -1) {
                    theArray[indexOfItem].count += 1;
                } else {
                    theArray.push({
                        weekStartingOn: commitmentDate,
                        count: 1,
                    });
                }

                return theArray;
            },
            new Array<WeeklyItemCount>({
                weekStartingOn: firstCommitmentDate,
                count: 0,
            }),
        );
        return result;
    }

    private async getWeeklyOutflowData(): Promise<Array<WeeklyItemCount>> {
        const outflowWorkItems = await this.getOutFlowWorkItems();

        if (!outflowWorkItems || outflowWorkItems.length < 1) return [];

        const firstDepartureDate = DateTime.fromISO(
            outflowWorkItems[0].departureDate!,
        )
            .startOf('week')
            .startOf('day');

        const result = outflowWorkItems.reduce(
            (theArray, stateItem) => {
                if (!stateItem.departureDate) return theArray;

                const departureDate = DateTime.fromISO(stateItem.departureDate)
                    .startOf('week')
                    .startOf('day');

                const indexOfItem = theArray.findIndex(
                    (a) =>
                        a.weekStartingOn.valueOf() === departureDate.valueOf(),
                );

                if (indexOfItem > -1) {
                    theArray[indexOfItem].count += 1;
                } else {
                    theArray.push({
                        weekStartingOn: departureDate,
                        count: 1,
                    });
                }

                return theArray;
            },
            new Array<WeeklyItemCount>({
                weekStartingOn: firstDepartureDate,
                count: 0,
            }),
        );
        return result;
    }

    private async getWeeklyCumulativeOutflowData(): Promise<
        Array<WeeklyItemCount>
    > {
        const outflowWorkItems = await this.getOutFlowWorkItems();

        if (!outflowWorkItems || outflowWorkItems.length < 1) return [];

        const firstDepartureDate = DateTime.fromISO(
            outflowWorkItems[0].departureDate!,
        )
            .startOf('week')
            .startOf('day');

        const result = outflowWorkItems.reduce(
            (theArray, stateItem) => {
                if (!stateItem.departureDate) return theArray;

                const departureDate = DateTime.fromISO(stateItem.departureDate)
                    .startOf('week')
                    .startOf('day');

                const indexOfItemCurrentWeek = theArray.findIndex(
                    (a) =>
                        a.weekStartingOn.valueOf() === departureDate.valueOf(),
                );

                if (indexOfItemCurrentWeek > -1) {
                    theArray[indexOfItemCurrentWeek].count += 1;
                } else {
                    const maxCountSoFar = Math.max(
                        ...theArray.map((a) => a.count),
                    );
                    const accumulate = maxCountSoFar + 1;

                    theArray.push({
                        weekStartingOn: departureDate,
                        count: accumulate,
                    });
                }

                return theArray;
            },
            new Array<WeeklyItemCount>({
                weekStartingOn: firstDepartureDate,
                count: 0,
            }),
        );
        return result;
    }
}
