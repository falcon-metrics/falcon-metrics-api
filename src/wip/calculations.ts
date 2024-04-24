import {
    cloneDeep,
    groupBy,
} from 'lodash';
import { DateTime } from 'luxon';
import {
    mean,
    mode,
    round,
} from 'mathjs';

import { IBoxPlot } from '../common/box_plot';
import {
    IQueryFilters,
    PredefinedFilterTags,
} from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import { IContextFilter } from '../context/context_filter';
import { IClassOfService } from '../data_v2/class_of_service';
import { INatureOfWork } from '../data_v2/nature_of_work';
import { IValueArea } from '../data_v2/value_area';
import { IWorkItemType } from '../data_v2/work_item_type_aurora';
import { FQLFilterModel } from '../models/FilterModel';
import {
    AssignedToDatum,
    extractAssignmentDataFromWorkItems,
} from '../utils/assigned_to';
import { getNormalisedWorkItems } from '../utils/getNormalisedWorkItems';
import {
    getDistributionShape,
    getPercentile,
    getVariabilityClassification,
    roundToDecimalPlaces,
} from '../utils/statistics';
import {
    ArrowColours,
    getTrendAnalysisResponse,
    TrendAnalysis,
} from '../utils/trend_analysis';
import {
    RetrievalScenario,
    SnapshotItem,
    StateItem,
} from '../workitem/interfaces';
import { ISnapshotQueries } from '../workitem/snapshot_queries';
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    IState,
    StateCategory,
} from '../workitem/state_aurora';
import getWorkItemListService from '../workitem/WorkItemList';
import { IWorkItemQueries } from '../workitem/workitem_queries';

export type WIPData = {
    count: number;
    countInDate: number;
    fromDate: DateTime;
    untilDate: DateTime;
    numDays: number;
};

export type WIPRunChartData = [string, number][];

export type HistogramDatum = {
    ageInDays: number;
    workItems: Array<{ id: string; }>;
};

export type WipSummaryTableItem = {
    itemTypeName: string;
    wipAge85Percentile: number;
    wipCount: number;
    wipAgeAverage: number;
    wipVariability: string;
    flowDebt: string;
};

export type WipVariabilityItem = {
    // date: DateTime;
    values: number;
    itemTypeName: string;
};

export class Calculations {
    private orgId: string;
    private state: IState;
    private workItemType: IWorkItemType;
    private filters?: IQueryFilters;
    private contextFilter: IContextFilter;
    private workItemCache: Map<string, Array<StateItem>> = new Map();
    private snapShots?: Array<SnapshotItem>;
    private classOfService: IClassOfService;
    private valueArea: IValueArea;
    private natureOfWork: INatureOfWork;
    private snapshotQueries: ISnapshotQueries;
    private workItemQueries: IWorkItemQueries;
    private normalisedCompletedItems?: Array<any>;
    private normalisedInProgressItems?: Array<any>;

    constructor(opts: {
        security: SecurityContext;
        state: IState;
        workItemType: IWorkItemType;
        filters?: IQueryFilters;
        contextFilter: IContextFilter;
        classOfService: IClassOfService;
        valueArea: IValueArea;
        natureOfWork: INatureOfWork;
        snapshotQueries: ISnapshotQueries;
        workItemQueries: IWorkItemQueries;
    }) {
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
        this.filters = opts.filters;
        this.contextFilter = opts.contextFilter;
        this.workItemType = opts.workItemType;
        this.classOfService = opts.classOfService;
        this.valueArea = opts.valueArea;
        this.natureOfWork = opts.natureOfWork;
        this.snapshotQueries = opts.snapshotQueries;
        this.workItemQueries = opts.workItemQueries;
    }

    private async getSnapshots(columnNames?: Array<string>) {
        if (!this.snapShots) {
            this.snapShots = await this.workItemQueries.getSnapshotsTz({
                orgId: this.orgId,
                stateCategory: StateCategory.INPROGRESS,
                uiFilters: this.filters,
                columnNames,
            });
        }
        return this.snapShots!;
    }

    async getCompletedItems(
        columnNames = ['flomatikaWorkItemTypeName'],
    ): Promise<StateItem[]> {
        const cacheKey = `${this.orgId}#${StateCategory[StateCategory.COMPLETED]
            }#${this.filters?.filterByDate}#${this.filters?.filterByStateCategory
            }#${columnNames.join('#')}`;

        if (this.workItemCache.has(cacheKey)) {
            return this.workItemCache.get(cacheKey)!;
        } else {
            const NO_FQL_FILTER: FQLFilterModel | undefined = undefined;
            const completedItems = await this.state.getWorkItems(
                this.orgId,
                StateCategory.COMPLETED,
                this.filters,
                NO_FQL_FILTER,
                columnNames,
            );

            this.workItemCache.set(cacheKey, completedItems);
            return completedItems;
        }
    }

    async getWorkInProgress(): Promise<StateItem[]> {
        const cacheKey = `${this.orgId}#${StateCategory[StateCategory.INPROGRESS]
            }#${this.filters?.filterByDate}#${this.filters?.filterByStateCategory}`;

        if (this.workItemCache.has(cacheKey)) {
            return this.workItemCache.get(cacheKey)!;
        } else {
            const workInProgress = await this.state.getWorkItems(
                this.orgId,
                StateCategory.INPROGRESS,
                this.filters,
            );

            this.workItemCache.set(cacheKey, workInProgress);
            return workInProgress;
        }
    }
    async getCurrentWorkInProgress(): Promise<StateItem[]> {
        const scenario = RetrievalScenario.CURRENT_WIP_ONLY;
        const cacheKey = `${this.orgId}#${scenario}#${this.filters?.filterByDate}#${this.filters?.filterByStateCategory}`;

        if (this.workItemCache.has(cacheKey)) {
            return this.workItemCache.get(cacheKey)!;
        } else {
            const workInProgress = await this.state.getExtendedWorkItemsWithScenarios(
                this.orgId,
                [scenario],
                this.filters,
            );

            this.workItemCache.set(cacheKey, workInProgress);
            return workInProgress;
        }
    }

    public async getNormalisedWorkItemsCount() {
        const getWorkItemFromTag = this.getNormalisedInProgressItems.bind(this);
        const obj: Record<string, Record<string, StateItem[] | number>> = await getNormalisedWorkItems(
            getWorkItemFromTag
        );
        for (let tag in obj) {
            for (let displayName in obj[tag]) {
                obj[tag][displayName] = (obj[tag][displayName] as StateItem[]).length;
            }
        }
        return obj as Record<string, Record<string, number>>;
    }

    private async getNormalisedCompletedItems(
        stateCategory = StateCategory.COMPLETED,
        filterTags: string = PredefinedFilterTags.NORMALISATION,
        parsedQuery?: string,
    ) {
        if (!this.normalisedCompletedItems?.length) {
            this.normalisedCompletedItems = await this.state.getNormalisedWorkItems(
                this.orgId,
                stateCategory,
                this.filters,
                parsedQuery ? undefined : filterTags,
                parsedQuery,
            );
        }
        return this.normalisedCompletedItems;
    }

    private async getNormalisedInProgressItems(
        filterTags: string = PredefinedFilterTags.NORMALISATION,
        parsedQuery?: string,
    ): Promise<Array<StateItem>> {
        if (!this.normalisedInProgressItems?.length) {
            this.normalisedInProgressItems = await this.state.getNormalisedWorkItems(
                this.orgId,
                StateCategory.INPROGRESS,
                this.filters,
                parsedQuery ? undefined : filterTags,
                parsedQuery,
            );
        }
        return this.normalisedInProgressItems;
    }

    async getWIPForSummaryTable(
        leadTimeData: Array<{
            leadtimePercentile: number;
            itemTypeName: string;
        }>,
        parsedQuery?: string,
    ): Promise<Array<WipSummaryTableItem>> {
        const response: Array<WipSummaryTableItem> = [];
        this.filters!.filterByDate = false;

        const workInProgress = this.getNormalisedInProgressItems(
            PredefinedFilterTags.DEMAND,
            parsedQuery,
        );
        const completedItems = this.getNormalisedCompletedItems(
            StateCategory.COMPLETED,
            PredefinedFilterTags.DEMAND,
            parsedQuery,
        );
        const [workInProgressResult, completedItemsResult] = await Promise.all([
            workInProgress,
            completedItems,
        ]);

        if (!workInProgressResult.length) {
            return response;
        }

        const groupByKey = parsedQuery
            ? 'workItemType'
            : 'normalisedDisplayName';
        const completedWorkItemsByTypeName: any = groupBy(
            completedItemsResult,
            groupByKey,
        );

        const inProgressWorkItemsByTypeName: any = groupBy(
            workInProgressResult,
            groupByKey,
        );

        Object.keys(inProgressWorkItemsByTypeName).forEach(
            (workItemTypeName: string) => {
                const workItemList: Array<any> =
                    inProgressWorkItemsByTypeName[workItemTypeName];
                const wipData: Array<number> = workItemList.map(
                    (item: { [index: string]: any; }) => item.wipAgeInWholeDays,
                );

                // Caclulate wip 85percentile
                const wipAge85Percentile: number =
                    Math.round(getPercentile(85, wipData)) || 0;

                const wipAgeAverage = wipData.length ? Math.round(mean(wipData)) : 0;

                const itemTypeName = workItemList[0][groupByKey];

                // Calculate flowDebt
                let completedWorkItems = [];

                if (completedWorkItemsByTypeName[itemTypeName]) {
                    completedWorkItems =
                        completedWorkItemsByTypeName[itemTypeName];
                }

                const { leadtimePercentile }: any = leadTimeData.find(
                    (workItem) => workItem.itemTypeName === itemTypeName,
                ) || { leadtimePercentile: 0, itemTypeName: '-' };

                const flowDebt: number = leadtimePercentile
                    ? wipAge85Percentile / leadtimePercentile
                    : 0;
                const flowDebtFormatted: string = flowDebt
                    ? `${Math.round(flowDebt)}x`
                    : `${flowDebt}x`;
                response.push({
                    itemTypeName,
                    wipAge85Percentile,
                    wipCount: workItemList.length,
                    wipVariability: '-',
                    flowDebt: flowDebtFormatted,
                    wipAgeAverage,
                });
            },
        );

        return response;
    }

    async getWiVariabilityForSummaryTable(parsedQuery?: string) {
        this.filters!.filterByDate = false;

        // Get all in progress and completed
        // TODO get commited items function wich performs one database query
        const workInProgress = this.getNormalisedInProgressItems(
            PredefinedFilterTags.DEMAND,
            parsedQuery,
        );
        const completedItems = this.getNormalisedCompletedItems(
            StateCategory.COMPLETED,
            PredefinedFilterTags.DEMAND,
            parsedQuery,
        );

        const [workInProgressResult, completedItemsResult] = await Promise.all([
            workInProgress,
            completedItems,
        ]);

        // sort it by commitement
        const wipItems: Array<any> = [
            ...completedItemsResult,
            ...workInProgressResult,
        ];

        // get default period
        const period = await this.filters?.datePeriod();
        const startDate = period?.start!.startOf('day')!;
        const endDate = period?.end!;

        const result: any = {};

        const counts: Map<
            string,
            {
                countInProgress: number;
                countCompleted: number;
            }
        > = new Map();

        const displayNameKey = parsedQuery
            ? 'workItemType'
            : 'normalisedDisplayName';

        for (
            let currentDate = startDate;
            currentDate <= endDate;
            currentDate = currentDate.plus({ day: 1 })
        ) {
            const today = currentDate;
            const tomorrow: DateTime = today.plus({ day: 1 });

            for (const wipItem of wipItems) {
                const normalisedDisplayName = wipItem[displayNameKey];
                if (!counts.has(normalisedDisplayName)) {
                    counts.set(normalisedDisplayName, {
                        countCompleted: 0,
                        countInProgress: 0,
                    });
                }

                const normalisedCount = counts.get(normalisedDisplayName)!;
                let commitmentDate;
                if (wipItem.hasOwnProperty('commitmentDateObj')) {
                    commitmentDate = wipItem.commitmentDateObj;
                } else {
                    //this is very slow in a loop, so save and reuse the result
                    commitmentDate = DateTime.fromISO(
                        wipItem.commitmentDate,
                    ).startOf('day');
                    wipItem.commitmentDateObj = commitmentDate;
                }

                if (wipItem.departureDate) {
                    let departureDate;
                    if (wipItem.hasOwnProperty('departureDateObj')) {
                        departureDate = wipItem.departureDateObj;
                    } else {
                        //this is very slow in a loop, so save and reuse the result
                        departureDate = DateTime.fromISO(
                            wipItem.departureDate,
                        ).startOf('day');
                        wipItem.departureDateObj = departureDate;
                    }

                    if (
                        commitmentDate <= today &&
                        (departureDate === today || departureDate >= tomorrow)
                    ) {
                        normalisedCount.countCompleted =
                            normalisedCount.countCompleted + 1;
                    }
                } else if (!wipItem.departureDate && commitmentDate <= today) {
                    normalisedCount.countInProgress =
                        normalisedCount.countInProgress + 1;
                }
            }

            //COUNTIFs(item.commitmentDate,” <=" & today,item.departureDate, null)+;
            // The item has started and has not finish. Still in Progress
            // let countInProgress = currentWipItems.reduce((acc: number, item: any, ) => {
            //     const commitmentDate = DateTime.fromISO(item.commitmentDate).startOf('day');
            //     if (!item.departureDate && commitmentDate <= today) {
            //         acc = acc + 1;
            //     }
            //     return acc;
            // }, 0);

            // The item has started before today and finished before tomorrow.
            // commitmentDate: 04-10-2021    departureDate: 06-10-2021
            //
            // item started:
            //  03-10-2021    04-10-2021 -> False
            //  04-10-2021    05-10-2021 -> True
            //  05-10-2021    06-10-2021 -> True
            //  06-10-2021    07-10-2021 -> True
            //  07-10-2021    08-10-2021 -> False

            for (const [key, value] of counts.entries()) {
                const normalisedDisplayName = key;

                if (!Object.keys(result).includes(normalisedDisplayName)) {
                    result[normalisedDisplayName] = {
                        normalisedDisplayName,
                        values: [value.countInProgress + value.countCompleted],
                    };
                } else {
                    result[normalisedDisplayName].values.push(
                        value.countInProgress + value.countCompleted,
                    );
                }
            }

            counts.clear();
        }

        // calculate variability with whole values
        const response: Array<{
            itemTypeName: string;
            wipVariability: string;
        }> = [];
        Object.keys(result).forEach((itemTypeName) => {
            const { values } = result[itemTypeName];
            const wipVariability = this.getWipVariability(values) || '-';
            response.push({
                itemTypeName,
                wipVariability,
            });
        });

        return response;
    }

    getWipVariability(wipValues: Array<number>): string {
        const percentile98th = getPercentile(98, wipValues);
        const percentile50th = getPercentile(50, wipValues);
        return getVariabilityClassification(percentile50th, percentile98th);
    }

    async getModes(): Promise<Array<number>> {
        const wipAges = await this.getWipAges();
        if (!wipAges || wipAges.length < 1) {
            return [];
        }

        const returnedModes = mode(...wipAges);

        return Array.isArray(returnedModes) ? returnedModes : [returnedModes];
    }

    async getTrendAnalysis(): Promise<TrendAnalysis> {
        this.filters!.filterByDate = true;
        //Get dataset, sort it desc and map it to get a collection of week numbers
        const allItems = await this.getSnapshots([
            `"flomatikaSnapshotDate"`,
            `"workItemId"`,
        ]);

        const weekNumbers = allItems.map(
            (snapshot) =>
                DateTime.fromJSDate(snapshot.flomatikaSnapshotDate!).weekNumber,
        );

        const colours: ArrowColours = {
            upColour: 'yellow',
            downColour: 'yellow',
            stableColour: 'yellow',
        };
        const period = await this.filters!.datePeriod();

        const response = getTrendAnalysisResponse(weekNumbers, period, colours);

        return response;
    }

    async getWIPCount(
        defaultInProgressWorkItems?: StateItem[],
    ): Promise<WIPData> {
        this.filters!.filterByDate = false;

        const workInProgress = defaultInProgressWorkItems
            ? defaultInProgressWorkItems
            : await this.getWorkInProgress();

        const response: WIPData = {
            count: 0,
            countInDate: 0,
            fromDate: DateTime.utc(),
            untilDate: DateTime.utc(),
            numDays: 0,
        };

        if (!workInProgress.length) return response;

        const dateWindow = await this.filters?.datePeriod();
        const windowStart = dateWindow?.start.startOf('day');
        const windowEnd = dateWindow?.end.endOf('day');

        let itemsInDateWindow = workInProgress.filter((item) => {
            let isInWindow = true;

            if (windowStart) {
                if (item.commitmentDateTime! < windowStart) {
                    isInWindow = false;
                    return isInWindow;
                }
            }

            if (windowEnd) {
                if (item.commitmentDateTime! > windowEnd) {
                    isInWindow = false;
                    return isInWindow;
                }
            }

            return isInWindow;
        });

        response.count = workInProgress.length;

        if (itemsInDateWindow.length === 0) {
            return response;
        }

        response.countInDate = itemsInDateWindow.length;

        itemsInDateWindow = itemsInDateWindow.sort((a, b) => {
            return (
                DateTime.fromISO(a.commitmentDate!).valueOf() -
                DateTime.fromISO(b.commitmentDate!).valueOf()
            );
        });

        response.fromDate = DateTime.fromISO(
            itemsInDateWindow[0].commitmentDate!,
        ).toUTC();
        //.startOf('day'); We need to know exactly the UTC datetime, so we can convert to user's timezone on the FrontEnd

        response.untilDate = DateTime.fromISO(
            itemsInDateWindow[itemsInDateWindow.length - 1].commitmentDate!,
        ).toUTC();
        //.endOf('day'); We need to know exactly the UTC datetime, so we can convert to user's timezone on the FrontEnd

        response.numDays = round(
            response.untilDate.diff(response.fromDate, 'days').days,
        );

        return response;
    }

    /*
        "WIPRunChartData": [
        ["2021-04-12", 14],
        ["2021-04-13", 15],
        ["2021-04-14", 15],
    */
    async getWipRunChart() {
        this.filters!.filterByDate = false;
        const workInProgress = this.getWorkInProgress();
        const completedItems = this.getCompletedItems([
            'workItemId',
            'arrivalDate',
            'commitmentDate',
            'departureDate',
        ]);
        const [workInProgressResult, completedItemsResult] = await Promise.all([
            workInProgress,
            completedItems,
        ]);

        const workItemIds = new Set(
            workInProgressResult.map((i) => i.workItemId),
        );
        const allItems = [
            ...workInProgressResult,
            ...completedItemsResult.filter(
                (i) => !workItemIds.has(i.workItemId),
            ),
        ];

        const period = await this.filters?.datePeriod();
        const startDate = period?.start!.startOf('day')!;
        const endDate = period?.end!.endOf('day')!;

        const runChartResults: Map<string, number> = new Map();

        for (
            let currentDate = startDate;
            currentDate <= endDate;
            currentDate = currentDate.plus({ day: 1 })
        ) {
            const today = currentDate;

            const todayKey = today.toISODate();

            runChartResults.set(todayKey, 0);
            for (const item of allItems) {
                const commitmentDate = item.commitmentDateTime?.startOf('day');

                if (!commitmentDate) {
                    continue;
                }

                let departureDate;
                if (item.departureDate) {
                    departureDate = item.departureDateTime!.startOf('day');
                }
                if (departureDate) {
                    if (commitmentDate <= today && departureDate >= today) {
                        const currentCount: number =
                            runChartResults.get(todayKey) ?? 0;
                        runChartResults.set(todayKey, currentCount + 1);
                    }
                } else if (!departureDate && commitmentDate <= today) {
                    const currentCount: number =
                        runChartResults.get(todayKey) ?? 0;
                    runChartResults.set(todayKey, currentCount + 1);
                }
            }
        }

        const result = new Map([...runChartResults.entries()]
            .sort((a, b) => {
                return a[0].localeCompare(b[0]);
            }));

        return cloneDeep([...result]);
    }

    async getWorkItemTypeAnalysisData() {
        this.filters!.filterByDate = false;

        const workItemTypesMap = new Map(
            (await this.workItemType.getTypes(this.orgId)).map((wit) => [
                wit.id,
                wit.displayName,
            ]),
        );

        return (await this.getWorkInProgress())
            .map((workItem) =>
                workItemTypesMap.get(workItem.flomatikaWorkItemTypeId!),
            )
            .sort((a, b) => {
                if (a === undefined)
                    a = '';
                if (b === undefined)
                    b = '';
                return a.localeCompare(b);
            })
            .reduce((counts, currType) => {
                const lastEntry = counts[counts.length - 1];

                if (lastEntry && lastEntry.type === currType) {
                    lastEntry.count++;
                } else {
                    counts.push({ type: currType!, count: 1 });
                }

                return counts;
            }, new Array<{ type: string; count: number; }>());
    }

    async getDemandAnalysisData() {
        this.filters!.filterByDate = false;

        const result: Map<string, number> = new Map();

        (await this.getWorkInProgress()).forEach((wip) => {
            let typeOfWork: string = 'N/A';

            if (wip.flomatikaWorkItemTypeLevel === 'Requirement') {
                if (wip.flomatikaWorkItemTypeId === '4')
                    typeOfWork = 'Failure Demand';
                else if (wip.flomatikaWorkItemTypeId === '3') {
                    if (wip.valueAreaId === '1')
                        typeOfWork = 'Non-value Demand';
                    else typeOfWork = 'Value Demand';
                }

                const currentCount = result.get(typeOfWork);
                const newCount = currentCount ? currentCount + 1 : 1;
                result.set(typeOfWork, newCount);
            }
        });

        return Array.from(result).map((item) => ({
            type: item[0],
            count: item[1],
        }));
    }

    async getClassOfServiceAnalysisData() {
        this.filters!.filterByDate = false;

        const classesOfService = new Map(
            (
                await this.classOfService.getEverything(this.orgId)
            ).map((item) => [item.id, item.displayName]),
        );

        return (await this.getWorkInProgress())
            .map((workItem) =>
                workItem.classOfServiceId
                    ? classesOfService.get(workItem.classOfServiceId)
                    : 'Not classified',
            )
            .sort((a, b) => {
                if (a === undefined)
                    a = '';
                if (b === undefined)
                    b = '';
                return a.localeCompare(b);
            })
            .reduce((counts, currClassName) => {
                const lastEntry = counts[counts.length - 1];

                if (lastEntry && lastEntry.serviceClassName === currClassName) {
                    lastEntry.count++;
                } else {
                    counts.push({ serviceClassName: currClassName!, count: 1 });
                }

                return counts;
            }, new Array<{ serviceClassName: string; count: number; }>());
    }

    async getStateAnalysisData() {
        this.filters!.filterByDate = false;

        return (await this.getWorkInProgress())
            .map((workItem) =>
                workItem.state ? workItem.state : 'Unknown state',
            )
            .sort((a, b) => {
                return a.localeCompare(b);
            })
            .reduce((counts, currStateName) => {
                const lastEntry = counts[counts.length - 1];

                if (lastEntry && lastEntry.stateName === currStateName) {
                    lastEntry.count++;
                } else {
                    counts.push({ stateName: currStateName!, count: 1 });
                }

                return counts;
            }, new Array<{ stateName: string; count: number; }>());
    }

    async getPlannedUnplannedAnalysisData() {
        this.filters!.filterByDate = false;

        const naturesOfWork = new Map(
            (await this.natureOfWork.getEverything(this.orgId)).map((item) => [
                item.id,
                item.displayName,
            ]),
        );

        return (await this.getWorkInProgress())
            .map((workItem) =>
                workItem.natureOfWorkId
                    ? naturesOfWork.get(workItem.natureOfWorkId)
                    : 'Not classified',
            )
            .sort((a, b) => {
                if (a === undefined)
                    a = '';
                if (b === undefined)
                    b = '';
                return a.localeCompare(b);
            })
            .reduce((counts, currNatureOfWork) => {
                const lastEntry = counts[counts.length - 1];

                if (lastEntry && lastEntry.type === currNatureOfWork) {
                    lastEntry.count++;
                } else {
                    counts.push({ type: currNatureOfWork!, count: 1 });
                }

                return counts;
            }, new Array<{ type: string; count: number; }>());
    }

    async getValueAreaAnalysisData() {
        this.filters!.filterByDate = false;

        const valueAreas = new Map(
            (await this.valueArea.getEverything(this.orgId)).map((item) => [
                item.id,
                item.displayName,
            ]),
        );

        return (await this.getWorkInProgress())
            .filter((item) => item.valueAreaId)
            .map((workItem) => valueAreas.get(workItem.valueAreaId!))
            .sort((a, b) => {
                if (a === undefined)
                    a = '';
                if (b === undefined)
                    b = '';
                return a.localeCompare(b);
            })
            .reduce((counts, currValueArea) => {
                const lastEntry = counts[counts.length - 1];

                if (lastEntry && lastEntry.areaName === currValueArea) {
                    lastEntry.count++;
                } else {
                    counts.push({ areaName: currValueArea!, count: 1 });
                }

                return counts;
            }, new Array<{ areaName: string; count: number; }>());
    }

    async getAssignedToAnalysisData() {
        this.filters!.filterByDate = false;

        const result: Map<string, number> = new Map();

        (await this.getWorkInProgress()).forEach((wip) => {
            const currentCount = result.get(wip.assignedTo!);
            const newCount = currentCount ? currentCount + 1 : 1;
            result.set(wip.assignedTo!, newCount);
        });

        return cloneDeep([...result]);
    }

    async getAssignedToAnalysisDataV2(): Promise<Array<AssignedToDatum>> {
        this.filters!.filterByDate = false;

        return extractAssignmentDataFromWorkItems(
            await this.getWorkInProgress(),
        );
    }

    private async getWipAges(): Promise<Array<number>> {
        return (await this.getWorkInProgress())
            .filter((item) => item.wipAgeInWholeDays != undefined)
            .map((item) => item.wipAgeInWholeDays!);
    }

    private async getWipAgesByWorkItemTypeLevel(workItemTypelevel: string): Promise<Array<number>> {
        return (await this.getCurrentWorkInProgress())
            .filter((item) =>
                item.wipAgeInWholeDays != undefined
                && item.flomatikaWorkItemTypeLevel?.toLowerCase() === workItemTypelevel.toLowerCase())
            .map((item) => item.wipAgeInWholeDays!);
    }

    async getMinimum(): Promise<number> {
        this.filters!.filterByDate = false;

        const wipAges = await this.getWipAges();

        if (!wipAges || wipAges.length < 1) {
            return 0;
        }

        return Math.min(...wipAges);
    }

    async getMaximum(): Promise<number> {
        this.filters!.filterByDate = false;
        const wipAges = await this.getWipAges();

        if (!wipAges || wipAges.length < 1) {
            return 0;
        }

        return Math.max(...wipAges);
    }

    async getAverage(): Promise<number> {
        const wipAges = await this.getWipAges();
        if (!wipAges || wipAges.length < 1) {
            return 0;
        }

        return Math.round(mean(...wipAges));
    }

    async getWipAgeBoxPlot(): Promise<IBoxPlot> {
        this.filters!.filterByDate = false;
        const wipAges = await this.getWipAges();
        const comparator = (a: number, b: number) => a - b;
        const orderedWipAges = wipAges.sort(comparator);

        const boxPlot: IBoxPlot = {
            median: Number.MIN_VALUE,
            quartile1st: Number.MIN_VALUE,
            quartile3rd: Number.MIN_VALUE,
            interQuartileRange: Number.MIN_VALUE,
            lowerWhisker: Number.MIN_VALUE,
            upperWhisker: Number.MIN_VALUE,
            lowerOutliers: [],
            upperOutliers: [],
        };

        const median: number = getPercentile(50, wipAges);
        boxPlot.median = roundToDecimalPlaces(median, 2);

        const quartile1st: number = getPercentile(25, wipAges);
        boxPlot.quartile1st = roundToDecimalPlaces(quartile1st, 2);

        const quartile3rd: number = getPercentile(75, wipAges);
        boxPlot.quartile3rd = roundToDecimalPlaces(quartile3rd, 2);

        const interQuartileRange: number = quartile3rd - quartile1st;
        boxPlot.interQuartileRange = roundToDecimalPlaces(
            interQuartileRange,
            2,
        );

        const lowerWhisker: number = quartile1st - 1.5 * interQuartileRange;
        boxPlot.lowerWhisker = roundToDecimalPlaces(lowerWhisker, 2);

        const upperWhisker: number = quartile3rd + 1.5 * interQuartileRange;
        boxPlot.upperWhisker = roundToDecimalPlaces(upperWhisker, 2);

        const lowerOutliers: Array<number> = orderedWipAges.filter(
            (wipAge) => wipAge < lowerWhisker,
        );
        boxPlot.lowerOutliers = lowerOutliers
            .filter((item, index, array) => array.indexOf(item) === index)
            .sort(function (a, b) {
                return a - b;
            });

        const upperOutliers: Array<number> = orderedWipAges.filter(
            (wipAge) => wipAge > upperWhisker,
        );
        boxPlot.upperOutliers = upperOutliers
            .filter((item, index, array) => array.indexOf(item) === index)
            .sort(function (a, b) {
                return a - b;
            });

        return boxPlot;
    }

    async getShapeOfWipAgeDistribution(): Promise<string> {
        this.filters!.filterByDate = false;
        const percentile98th = await this.getPercentile(98);
        const percentile50th = await this.getPercentile(50);
        return getDistributionShape(percentile50th, percentile98th);
    }

    async getPercentile(percent: number): Promise<number> {
        this.filters!.filterByDate = false;
        return getPercentile(percent, await this.getWipAges());
    }

    async getPercentileByWorkItemTypeLevel(percent: number, workItemTypeLevel: string): Promise<number> {
        const wipAges = await this.getWipAgesByWorkItemTypeLevel(workItemTypeLevel);

        if (wipAges.length == 1) return wipAges[0]; //if WIP ages count === 1

        return roundToDecimalPlaces(getPercentile(percent, wipAges), 2);
    }

    async getHistogramDataV2(): Promise<Array<HistogramDatum>> {
        this.filters!.filterByDate = false;
        return (await this.getWorkInProgress())
            .filter((item) => item.wipAgeInWholeDays != undefined)
            .sort((a, b) => a.wipAgeInWholeDays! - b.wipAgeInWholeDays!)
            .reduce((histogramData, currItem) => {
                const lastDatum = histogramData[histogramData.length - 1];

                if (
                    lastDatum &&
                    lastDatum.ageInDays === currItem.wipAgeInWholeDays
                ) {
                    lastDatum.workItems.push({ id: currItem.workItemId! });
                } else {
                    histogramData.push({
                        ageInDays: currItem.wipAgeInWholeDays!,
                        workItems: [{ id: currItem.workItemId! }],
                    });
                }

                return histogramData;
            }, new Array<HistogramDatum>());
    }

    async getScatterplotDataV2(): Promise<
        Array<{
            wipAgeInWholeDays: number;
            workItemId: string;
            title: string;
            state: string;
            workItemType: string;
            arrivalDateNoTime: string;
            commitmentDateNoTime: string;
        }>
    > {
        this.filters!.filterByDate = false;
        this.filters!.filterByStateCategory = true;
        const workitems = await this.getWorkInProgress();
        return workitems.map((workItem) => {
            return {
                wipAgeInWholeDays: workItem.wipAgeInWholeDays!,
                workItemId: workItem.workItemId!,
                title: workItem.title!,
                state: workItem.state!,
                workItemType: workItem.flomatikaWorkItemTypeName!,
                arrivalDateNoTime: workItem.arrivalDate!,
                commitmentDateNoTime: workItem.commitmentDate!,
            };
        });
    }

    async getWorkItemList() {
        this.filters!.filterByDate = false;
        const workItems = await this.getWorkInProgress();
        const workItemListService = await getWorkItemListService();
        return workItemListService.getWorkItemList(
            workItems,
            'wipAgeInWholeDays',
            this.orgId,
        );
    }
}
