import { groupBy } from 'lodash';
import { DateTime } from 'luxon';

import {
    IQueryFilters,
    PredefinedFilterTags,
} from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import { IContextFilter } from '../context/context_filter';
import { IWorkItemType } from '../data_v2/work_item_type_aurora';
import { FQLFilterModel } from '../models/FilterModel';
import { getWeekStartFromISO } from '../utils/date_utils';
import { getPercentile } from '../utils/statistics';
import {
    SnapshotItem,
    StateItem,
} from '../workitem/interfaces';
import { ISnapshotQueries } from '../workitem/snapshot_queries';
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    IState,
    StateCategory,
} from '../workitem/state_aurora';
import {
    LeadTimeMonths,
    LeadTimeQuarters,
    LeadTimeWeeks,
    LeadTimeWidget,
    Productivity,
    Quality,
    WorkflowItem,
    WorkflowTrendWidget,
} from './handler';

export type workItemTypeValue = {
    [key: string]: any;
    itemTypeName: string;
    count: number;
};

export type ProductivityItem = Array<{
    year: string;
    month: string;
    item: Array<{
        itemTypeName: string;
        values: number;
    }>;
}>;

export type Year = {
    year: number;
    values: Array<{
        itemTypeName: string;
        count: number;
    }>;
};

export type Years = Array<Year>;

export type StateCategoryByPeriod = {
    past: number;
    present: number;
    future: number;
    [index: string]: any;
};

// PROPOSED    future   arrivalDate
// COMPLETED   past     departureDate
// INPROGRESS  present  commitmentDate
export const stateCategoryMapByPeriod: StateCategoryByPeriod = {
    past: StateCategory.COMPLETED,
    present: StateCategory.INPROGRESS,
    future: StateCategory.PROPOSED,
};

export type PeriodFieldType = {
    past: string;
    present: string;
    future: string;
    [index: string]: any;
};

export type PeriodsTypes = 'past' | 'present' | 'future';

export enum FieldByPeriodTypeKeys {
    departureDate = 'departureDate',
    commitmentDate = 'commitmentDate',
    arrivalDate = 'arrivalDate',
}

export type FieldByPeriodType =
    | 'departureDate'
    | 'commitmentDate'
    | 'arrivalDate';

export const periodMap: Record<PeriodsTypes, FieldByPeriodType> & {
    [key: string]: string;
} = {
    past: 'departureDate',
    present: 'commitmentDate',
    future: 'arrivalDate',
};

export const leadTimeFieldsByPeriod: PeriodFieldType = {
    past: 'leadTimeInWholeDays',
    present: 'wipAgeInWholeDays',
    future: 'inventoryAgeInWholeDays',
};

export type StaleWorkItem = {
    itemTypeName: string;
    percentageOfStaleWorkItem: string;
};

export class Calculations {
    private orgId: string;
    private state: IState;
    private workItemType: IWorkItemType;
    private filters?: any;
    private contextFilter: IContextFilter;
    private completedItems?: Array<StateItem>;
    private normalisedCompletedItems?: Array<any>;
    private allItems?: Array<StateItem>;
    private completedItemsSortedByLeadTime?: Array<StateItem>;
    private snapShotItems?: Array<SnapshotItem>;
    private snapshotQueries: ISnapshotQueries;
    private currentStateCategory: number;

    constructor(opts: {
        security: SecurityContext;
        state: IState;
        workItemType: IWorkItemType;
        filters?: IQueryFilters;
        contextFilter: IContextFilter;
        snapshotQueries: ISnapshotQueries;
    }) {
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
        this.filters = opts.filters;
        this.contextFilter = opts.contextFilter;
        this.workItemType = opts.workItemType;
        this.snapshotQueries = opts.snapshotQueries;

        this.currentStateCategory =
            stateCategoryMapByPeriod[this.getCurrentPeriod()];
    }

    private getCurrentPeriod(): string {
        return (
            (this.filters?.queryParameters &&
                this.filters?.queryParameters?.summaryPeriodType) ||
            'past'
        );
    }

    /*
     * Function: getStaleWorkItems
     * Description: receives the :"count", "type" (active | total) of all staled
     *              work items types grouped by "flomatikaWorkItemTypeName".
     *              The purpose of this function is to get the percentage per
     *              itemTypeName of all staled work item couting all items
     *              from (now() - 30 last days).
     **/
    async getStaleWorkItems(
        parsedQuery?: string,
    ): Promise<Array<StaleWorkItem>> {
        const staledItems = await this.state.getStaleWorkItems(
            this.orgId,
            this.filters,
            parsedQuery ? undefined : PredefinedFilterTags.DEMAND,
            parsedQuery,
        );
        const groupedByItemTypeName = groupBy(
            staledItems,
            parsedQuery ? 'flomatikaWorkItemTypeName' : 'normalisedDisplayName',
        );

        const response: Array<StaleWorkItem> = [];
        Object.keys(groupedByItemTypeName).forEach(
            (flomatikaWorkItemTypeName) => {
                // sum all active and total per normalisedDisplayName before to calculate
                const [active, total] = groupedByItemTypeName[
                    flomatikaWorkItemTypeName
                ].reduce(
                    (acc, item) => {
                        if (item.type === 'active') {
                            acc[0].count = acc[0].count + Number(item.count);
                        } else {
                            acc[1].count = acc[1].count + Number(item.count);
                        }
                        return acc;
                    },
                    [
                        {
                            normalisedDisplayName: flomatikaWorkItemTypeName,
                            count: 0,
                            type: 'active',
                        },
                        {
                            normalisedDisplayName: flomatikaWorkItemTypeName,
                            count: 0,
                            type: 'total',
                        },
                    ],
                );

                const totalValue = Number(total.count);
                const activeValue = Number(active.count);
                const percentageOfStaleValue =
                    totalValue === 0 || activeValue === 0
                        ? 0
                        : ((totalValue - activeValue) / totalValue) * 100;
                const formattedValue = percentageOfStaleValue
                    ? `${percentageOfStaleValue.toFixed()}%`
                    : '-';

                response.push({
                    itemTypeName: flomatikaWorkItemTypeName,
                    percentageOfStaleWorkItem: formattedValue,
                });
            },
        );

        return response;
    }

    async agregateLeadTimeByQuarters(
        completedItems: StateItem[],
        aggregateByKey: string,
        dateField: string,
        currentPeriodFilter: string,
    ): Promise<LeadTimeQuarters> {
        const groupedByYears = groupedByPeriod(
            completedItems,
            'year',
            dateField,
        );
        const workItemTypeNamesByYear: any = {};
        Object.keys(groupedByYears).forEach((year: any) => {
            workItemTypeNamesByYear[year] = groupedByPeriod(
                groupedByYears[year],
                'quarter',
                dateField,
            );
        }, []);

        const workItemsByQuarters: any = [];
        const allYears = Object.keys(workItemTypeNamesByYear);

        allYears.forEach((year: any) => {
            const currentQuarters = Object.keys(workItemTypeNamesByYear[year]);
            currentQuarters.forEach((quarter: any) => {
                let currentQuarter = workItemTypeNamesByYear[year][quarter];
                currentQuarter = groupBy(currentQuarter, aggregateByKey);
                const values: any = [];
                Object.keys(currentQuarter).forEach((workItemType: string) => {
                    const currentWorkItemsType = currentQuarter[workItemType];
                    const allLeadTimeInWholeDays = currentWorkItemsType.map(
                        (workType: any) => {
                            return workType[
                                leadTimeFieldsByPeriod[currentPeriodFilter]
                            ];
                        },
                    );
                    const percentile85thLeadTime =
                        getPercentile(85, allLeadTimeInWholeDays) || 0;
                    values.push({
                        itemTypeName: workItemType,
                        percentile85thLeadTime,
                    });
                });
                workItemsByQuarters.push({
                    year,
                    quarter,
                    values,
                });
            });
        });

        return workItemsByQuarters;
    }

    async agregateLeadTimeByWeeks(
        completedItems: StateItem[],
        aggregateByKey: string,
        dateField: string,
        currentPeriodFilter: string,
    ): Promise<LeadTimeWeeks> {
        const groupedByYears = groupedByPeriod(
            completedItems,
            'year',
            dateField,
        );
        let groupedByWeekResult: any = [];
        Object.keys(groupedByYears).forEach((year: any) => {
            const weeksInYear = groupedByPeriod(
                groupedByYears[year],
                'weekNumber',
                dateField,
            );

            Object.keys(weeksInYear).forEach((week: any) => {
                const currentWeekItems = weeksInYear[week];
                const aggregateByKeyValues = groupBy(
                    currentWeekItems,
                    aggregateByKey,
                );
                const values: any = [];
                const keys = Object.keys(aggregateByKeyValues);
                keys.forEach((itemTypeName: any) => {
                    const currentWorkItems = aggregateByKeyValues[itemTypeName];
                    const allLeadTimeInWholeDays = currentWorkItems.map(
                        (workType: any) => {
                            return workType[
                                leadTimeFieldsByPeriod[currentPeriodFilter]
                            ];
                        },
                    );
                    const weekStarting = getWeekStartFromISO(
                        currentWorkItems[0][dateField],
                    );
                    const percentile85thLeadTime =
                        getPercentile(85, allLeadTimeInWholeDays) || 0;
                    values.push({
                        itemTypeName: itemTypeName,
                        percentile85thLeadTime,
                        weekStarting,
                    });
                });
                groupedByWeekResult = [
                    ...groupedByWeekResult,
                    {
                        year,
                        week,
                        values,
                    },
                ];
            });
        }, []);
        return groupedByWeekResult;
    }

    async agregateLeadTimeByMonths(
        completedItems: StateItem[],
        aggregateByKey: string,
        dateField: string,
        currentPeriodFilter: string,
    ): Promise<LeadTimeMonths> {
        const groupedByYears = groupedByPeriod(
            completedItems,
            'year',
            dateField,
        );
        const groupedByWorkItemTypeNamesByYear: any = {};

        Object.keys(groupedByYears).forEach((year: any) => {
            groupedByWorkItemTypeNamesByYear[year] = groupedByPeriod(
                groupedByYears[year],
                'month',
                dateField,
            );
        }, []);

        const workItemsByMonths: any[] = [];
        Object.keys(groupedByWorkItemTypeNamesByYear).forEach((year: any) => {
            const currentYear: any = groupedByWorkItemTypeNamesByYear[year];
            Object.keys(currentYear).forEach((month) => {
                currentYear[month] = groupBy(
                    groupedByWorkItemTypeNamesByYear[year][month],
                    aggregateByKey,
                );
                const values: any[] = [];
                Object.keys(currentYear[month]).forEach(
                    (workItemTypeKey: any) => {
                        const currentWorkItemsType =
                            currentYear[month][workItemTypeKey];
                        const allLeadTimeInWholeDays = currentWorkItemsType.map(
                            (workType: any) => {
                                return workType[
                                    leadTimeFieldsByPeriod[currentPeriodFilter]
                                ];
                            },
                        );
                        const percentile85thLeadTime =
                            getPercentile(85, allLeadTimeInWholeDays) || 0;
                        values.push({
                            itemTypeName: workItemTypeKey,
                            percentile85thLeadTime,
                        });
                    },
                );
                workItemsByMonths.push({
                    year,
                    month,
                    values,
                });
            });
        });
        return workItemsByMonths;
    }

    async agregateLeadTimeByYears(
        completedItems: StateItem[],
        aggregateByKey: string,
        dateField: string,
        currentPeriodFilter: string,
    ) {
        /**
         * Should access each workItemType
         * and group all of them by year
         *
         * Output: { 2020: [] , { 2021: []  }
         */
        const groupedByYears = groupBy(completedItems, (item: any) => {
            return `${DateTime.fromISO(item[dateField]).year}`;
        });

        const groupedByWorkItemTypeNames: any = {};
        /**
         * Should access each year and group
         * the data by flomatikaWorkItemTypeName
         *
         * Output: { 2020: { bug: [], commit: [] } , { 2021: { feature: [], bug: [] }  }
         */
        Object.keys(groupedByYears).forEach((year: any) => {
            groupedByWorkItemTypeNames[year] = groupBy(
                groupedByYears[year],
                aggregateByKey,
            );
        }, []);

        /**
         * Should transform the grouped data to follow (ProductivityItem) type
         *
         * OUTPUT:
         * [
         *     {
         *         "year": "2020",
         *         "values": [
         *             {
         *                 "itemTypeName": "User Story",
         *                 "count": 97
         *             },
         *             {
         *                 "itemTypeName": "Feature",
         *                 "count": 17
         *             },
         *         ]
         *     },
         *   {
         *         "year": "2021",
         *         "values": [
         *             {
         *                 "itemTypeName": "Bug",
         *                 "count": 10
         *             },
         *             {
         *                 "itemTypeName": "Feature",
         *                 "count": 17
         *             },
         *         ]
         *     }
         * ]
         */
        const leadTimeItems: Array<{
            year: number;
            values: any[];
        }> = [];
        Object.keys(groupedByWorkItemTypeNames).forEach((year: any) => {
            const workTypeItems: any[] = [];
            // access each year and get count by each element
            Object.keys(groupedByWorkItemTypeNames[year]).forEach(
                (workItemTypeKey) => {
                    const workTypes: any =
                        groupedByWorkItemTypeNames[year][workItemTypeKey];
                    const allLeadTimeInWholeDays = workTypes.map(
                        (workType: any) => {
                            return workType[
                                leadTimeFieldsByPeriod[currentPeriodFilter]
                            ];
                        },
                    );
                    const percentile85thLeadTime =
                        getPercentile(85, allLeadTimeInWholeDays) || 0;
                    workTypeItems.push({
                        itemTypeName: workItemTypeKey,
                        percentile85thLeadTime,
                    });
                },
            );
            leadTimeItems.push({
                year: year,
                values: workTypeItems,
            });
        });
        return leadTimeItems;
    }

    async getWorkflowTrend() {
        // console.time('getWorkflowTrend');

        const NO_FQL_FILTER: FQLFilterModel | undefined = undefined;
        const stateColumns = [
            'workItemId',
            'stateCategory',
            'arrivalDate',
            'commitmentDate',
            'departureDate',
        ];
        const proposedItemsPromise = this.state.getWorkItems(
            this.orgId,
            StateCategory.PROPOSED,
            this.filters,
            NO_FQL_FILTER,
            stateColumns,
        );

        const inprogressItemsPromise = this.state.getWorkItems(
            this.orgId,
            StateCategory.INPROGRESS,
            this.filters,
            NO_FQL_FILTER,
            stateColumns,
        );
        const completedItemsPromise = this.state.getWorkItems(
            this.orgId,
            StateCategory.COMPLETED,
            this.filters,
            NO_FQL_FILTER,
            stateColumns,
        );

        const period = await this.filters?.datePeriod();
        const startDate = period?.start!.startOf('day')!;
        const endDate = period?.end!.endOf('day')!;

        const [
            proposedItems,
            inprogressItems,
            completedItems,
        ] = await Promise.all([
            proposedItemsPromise,
            inprogressItemsPromise,
            completedItemsPromise,
        ]);
        const allItems = [
            ...proposedItems,
            ...inprogressItems,
            ...completedItems,
        ];
        const counts: Map<
            string,
            {
                count: number;
                stateCategory: string;
                date: DateTime;
            }
        > = new Map();
        //might have duplicate items if the change of state category happen in the date period
        const allItemsNoDuplicates = allItems.filter(
            (item, index, array) =>
                array.findIndex(
                    (element) => item.workItemId === element.workItemId,
                ) === index,
        );
        const key = (
            stateCategory: string,
            year: number,
            month: number,
            day: number,
        ) => `${stateCategory}#${year}#${month}#${day}`;

        const incrementCounter = (stateCategory: string, date: DateTime) => {
            const keyStr = key(stateCategory, date.year, date.month, date.day);
            counts.set(keyStr, {
                count: (counts.get(keyStr)?.count ?? 0) + 1,
                stateCategory,
                date,
            });
        };
        for (
            let currentDate = startDate;
            currentDate <= endDate;
            currentDate = currentDate.plus({ day: 1 })
        ) {
            for (const item of allItemsNoDuplicates) {
                const arrivalDate = item.arrivalDateTime?.startOf('day');
                if (arrivalDate) {
                    if (arrivalDate.toMillis() === currentDate.toMillis()) {
                        incrementCounter(
                            StateCategory[StateCategory.PROPOSED],
                            currentDate,
                        );
                    }
                }

                const commitmentDate = item.commitmentDateTime?.startOf('day');
                if (commitmentDate) {
                    if (commitmentDate.toMillis() === currentDate.toMillis()) {
                        incrementCounter(
                            StateCategory[StateCategory.INPROGRESS],
                            currentDate,
                        );
                    }
                }

                const departureDate = item.departureDateTime?.startOf('day');
                if (departureDate) {
                    if (departureDate.toMillis() === currentDate.toMillis()) {
                        incrementCounter(
                            StateCategory[StateCategory.COMPLETED],
                            currentDate,
                        );
                    }
                }
            }
        }
        // console.log('completed items ids are =====>%o', completedItemIds); //seems there are duplicated items
        // console.table(counts);

        const results: any[] = [];

        counts.forEach(
            (
                value: {
                    count: number;
                    stateCategory: string;
                    date: DateTime;
                },
                key: string,
            ) => {
                results.push({
                    count: value.count,
                    itemTypeName: value.stateCategory,
                    flomatikaSnapshotDate: value.date.toUTC().toISO(),
                });
            },
        );

        // console.table(results);
        // console.timeEnd('getWorkflowTrend');

        return results;
    }

    async getWorkflowTrendWidget(): Promise<WorkflowTrendWidget> {
        const workflowItems = await this.getWorkflowTrend();

        const dateField = 'flomatikaSnapshotDate';
        const years = formatterWorkflowToAddValues(
            groupedByPeriod(workflowItems, 'year', dateField),
            'year',
        );

        const months = formatterWorkflowToAddValues(
            groupedByPeriod(workflowItems, 'month', dateField),
            'month',
        );
        const weeks = formatterWorkflowToAddValues(
            groupedByPeriod(workflowItems, 'weekNumber', dateField),
            'week',
        );

        const quarters = formatterWorkflowToAddValues(
            groupedByPeriod(workflowItems, 'quarter', dateField),
            'quarter',
        );

        return { years, quarters, months, weeks };
    }

    private async getNormalisedCompletedItems() {
        if (!this.normalisedCompletedItems?.length) {
            this.normalisedCompletedItems = await this.state.getNormalisedWorkItems(
                this.orgId,
                this.currentStateCategory,
                this.filters,
                'demand',
            );
        }
        return this.normalisedCompletedItems;
    }

    async getProductivity(): Promise<Productivity> {
        const normalisedWorkItems = await this.getNormalisedCompletedItems();
        const dateField = periodMap[this.getCurrentPeriod()];

        return agregateBy(
            normalisedWorkItems,
            dateField,
            'normalisedDisplayName',
        );
    }

    async getLeadTimeWidget(): Promise<LeadTimeWidget> {
        const currentPeriodFilter = this.getCurrentPeriod();
        const dateField = periodMap[currentPeriodFilter];
        const normalisedWorkItems = await this.getNormalisedCompletedItems();
        return agregateBy(
            normalisedWorkItems,
            dateField,
            'normalisedDisplayName',
        );
    }

    async getQualityWidget(): Promise<Quality> {
        const normalisedWorkItems = await this.state.getNormalisedWorkItems(
            this.orgId,
            this.currentStateCategory,
            this.filters,
            'quality',
        );
        const dateField = periodMap[this.getCurrentPeriod()];

        return agregateBy(
            normalisedWorkItems,
            dateField,
            'normalisedDisplayName',
        );
    }
}

function formatterWorkflowToAddValues(
    workflowWidgeItems: any,
    currentPeriodKey: string,
) {
    const itemsByPeriod: Array<any> = [];
    Object.keys(workflowWidgeItems).forEach((period: any) => {
        const currentItems: Array<WorkflowItem> = workflowWidgeItems[period];
        const values: Array<WorkflowItem> = getUniqueWorkItemsAndSumCount(
            currentItems,
            currentPeriodKey,
        );

        itemsByPeriod.push({
            [currentPeriodKey]: period,
            year: `${
                DateTime.fromISO(currentItems[0].flomatikaSnapshotDate).year
            }`,
            values,
        });
    });
    return itemsByPeriod;
}

function getUniqueWorkItemsAndSumCount(
    currentItems: Array<WorkflowItem>,
    currentPeriodKey: string,
): Array<WorkflowItem> {
    const values = currentItems.reduce((acc: any, item: WorkflowItem) => {
        const weekStarting =
            currentPeriodKey === 'week'
                ? {
                      weekStarting: getWeekStartFromISO(
                          currentItems[0].flomatikaSnapshotDate,
                      ),
                  }
                : {};
        if (!Object.keys(acc).includes(item.itemTypeName)) {
            acc[item.itemTypeName] = {
                itemTypeName: item.itemTypeName,
                count: Number(item.count),
                ...weekStarting,
            };
        } else {
            acc[item.itemTypeName] = {
                itemTypeName: item.itemTypeName,
                count: acc[item.itemTypeName].count + Number(item.count),
                ...weekStarting,
            };
        }
        return acc;
    }, {});
    return Object.values(values);
}

function groupedByPeriod(
    items: any,
    periodType: keyof DateTime,
    dateField?: string,
) {
    return groupBy(items, (item: any) => {
        if (!item || typeof item !== 'object') return;
        // console.log('item -->%o', item)

        const dateObj = item[dateField ? dateField : 'departureDate'];

        if (typeof dateObj === 'string') {
            return DateTime.fromISO(dateObj).get(periodType);
        } else {
            return DateTime.fromJSDate(dateObj).get(periodType);
        }
    });
}

async function agregateByYears(
    completedItems: StateItem[] | SnapshotItem[],
    aggregateByKey: string,
    dateField?: string,
) {
    const groupedByYears = groupedByPeriod(completedItems, 'year', dateField);

    const groupedByWorkItemTypeNames: any = {};
    Object.keys(groupedByYears).forEach((year: any) => {
        groupedByWorkItemTypeNames[year] = groupBy(
            groupedByYears[year],
            aggregateByKey,
        );
    }, []);

    const productivityItem: Array<{
        year: number;
        values: any[];
    }> = [];
    Object.keys(groupedByWorkItemTypeNames).forEach((year: any) => {
        const workTypeItems: any[] = [];
        // access each year and get count by each element
        Object.keys(groupedByWorkItemTypeNames[year]).forEach(
            (workItemTypeKey) => {
                const countByWorkType =
                    groupedByWorkItemTypeNames[year][workItemTypeKey].length;
                workTypeItems.push({
                    itemTypeName: workItemTypeKey,
                    count: countByWorkType,
                });
            },
        );

        productivityItem.push({
            year: year,
            values: workTypeItems,
        });
    });
    return productivityItem;
}

async function agregateByQuarters(
    completedItems: StateItem[] | SnapshotItem[],
    aggregateByKey: string,
    dateField?: string,
) {
    const groupedByYears = groupedByPeriod(completedItems, 'year', dateField);

    const workItemTypeNamesByYear: any = {};
    Object.keys(groupedByYears).forEach((year: any) => {
        workItemTypeNamesByYear[year] = groupedByPeriod(
            groupedByYears[year],
            'quarter',
            dateField,
        );
    }, []);

    const workItemsByQuarters: any = [];
    const allYears = Object.keys(workItemTypeNamesByYear);

    allYears.forEach((year: any) => {
        const currentQuarters = Object.keys(workItemTypeNamesByYear[year]);
        currentQuarters.forEach((quarter: any) => {
            let currentQuarter = workItemTypeNamesByYear[year][quarter];
            currentQuarter = groupBy(currentQuarter, aggregateByKey);
            const values: any = [];
            Object.keys(currentQuarter).forEach((workItemType: string) => {
                const count = currentQuarter[workItemType].length;
                values.push({
                    itemTypeName: workItemType,
                    count,
                });
            });
            workItemsByQuarters.push({
                year,
                quarter,
                values,
            });
        });
    });

    return workItemsByQuarters;
}

async function agregateByWeeks(
    completedItems: StateItem[] | SnapshotItem[],
    aggregateByKey: string,
    dateField: string,
) {
    const groupedByYears = groupedByPeriod(completedItems, 'year', dateField);

    let groupedByWeekResult: any = [];
    Object.keys(groupedByYears).forEach((year: any) => {
        const weeksInYear = groupedByPeriod(
            groupedByYears[year],
            'weekNumber',
            dateField,
        );

        Object.keys(weeksInYear).forEach((week: any) => {
            const currentWeekItems = weeksInYear[week];
            const aggregateByKeyValues = groupBy(
                currentWeekItems,
                aggregateByKey,
            );
            const values: any = [];
            const keys = Object.keys(aggregateByKeyValues);
            keys.forEach((itemTypeName: any) => {
                const currentWorkItems = aggregateByKeyValues[itemTypeName];
                const weekStarting = getWeekStartFromISO(
                    currentWorkItems[0][dateField],
                );
                values.push({
                    itemTypeName: itemTypeName,
                    count: currentWorkItems.length,
                    weekStarting,
                });
            });
            groupedByWeekResult = [
                ...groupedByWeekResult,
                {
                    year,
                    week,
                    values,
                },
            ];
        });
    }, []);

    return groupedByWeekResult;
}

async function agregateByMonths(
    completedItems: StateItem[] | SnapshotItem[],
    aggregateByKey: string,
    dateField?: string,
) {
    const groupedByYears = groupedByPeriod(completedItems, 'year', dateField);

    const groupedByWorkItemTypeNamesByYear: any = {};

    Object.keys(groupedByYears).forEach((year: any) => {
        groupedByWorkItemTypeNamesByYear[year] = groupedByPeriod(
            groupedByYears[year],
            'month',
            dateField,
        );
    }, []);

    const workItemsByMonths: any[] = [];
    Object.keys(groupedByWorkItemTypeNamesByYear).forEach((year: any) => {
        const currentYear: any = groupedByWorkItemTypeNamesByYear[year];
        Object.keys(currentYear).forEach((month) => {
            currentYear[month] = groupBy(
                groupedByWorkItemTypeNamesByYear[year][month],
                aggregateByKey,
            );
            const values: any[] = [];
            Object.keys(currentYear[month]).forEach((workItemTypeKey: any) => {
                const count = currentYear[month][workItemTypeKey].length;
                values.push({
                    itemTypeName: workItemTypeKey,
                    count: count,
                });
            });
            workItemsByMonths.push({
                year,
                month,
                values,
            });
        });
    });
    return workItemsByMonths;
}

export const agregateBy = async (
    dataset: any[],
    dateField: string,
    aggregateFieldName: string,
): Promise<{ years: any[]; quarters: any[]; months: any[]; weeks: any[] }> => {
    return Promise.all([
        agregateByYears(dataset, aggregateFieldName, dateField),
        agregateByQuarters(dataset, aggregateFieldName, dateField),
        agregateByMonths(dataset, aggregateFieldName, dateField),
        agregateByWeeks(dataset, aggregateFieldName, dateField),
    ]).then(([years, quarters, months, weeks]) => ({
        years,
        quarters,
        months,
        weeks,
    }));
};
