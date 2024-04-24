import { groupBy } from 'lodash';
import { DateTime } from 'luxon';
/* eslint-disable @typescript-eslint/no-non-null-assertion */
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
import { extractAssignmentDataFromWorkItems } from '../utils/assigned_to';
import { getNormalisedWorkItems } from '../utils/getNormalisedWorkItems';
import {
    getDistributionShape,
    getPercentile,
    getVariabilityClassification,
    roundToDecimalPlaces,
} from '../utils/statistics';
import {
    getTrendAnalysisResponse,
    reverseDefaultColours,
    TrendAnalysis,
} from '../utils/trend_analysis';
import { HistogramDatum } from '../wip/calculations';
import {
    StateItem,
    TimeToCommit,
} from '../workitem/interfaces';
import {
    IState,
    StateCategory,
} from '../workitem/state_aurora';
import getWorkItemListService from '../workitem/WorkItemList';

export type InventoryData = {
    count: number;
    countInDate: number;
    fromDate: DateTime;
    untilDate: DateTime;
    numDays: number;
};

export type ScatterplotDatum = {
    workItemId: string;
    title: string;
    workItemType: string;
    arrivalDateNoTime: string;
    inventoryAgeInWholeDays: number;
};

export type CommitmentRate = {
    itemTypeName: string;
    commitmentRate: string;
    commitmentRateValue: number;
};

export type TimeToCommitItem = {
    itemTypeName: string;
    timeToCommitPercentile85th: string;
    timeToCommitPercentile85thValue: number;
};

export class Calculations {
    private orgId: string;
    private state: IState;
    private workItemType: IWorkItemType;
    private filters?: IQueryFilters;
    private inventory?: Array<StateItem>;
    private commitmentRate?: Array<any>;
    private timeToCommit?: Array<any>;
    private classOfService: IClassOfService;
    private valueArea: IValueArea;
    private natureOfWork: INatureOfWork;
    private normalisedProposedItems?: Array<any>;

    constructor(opts: {
        security: SecurityContext;
        state: IState;
        workItemType: IWorkItemType;
        filters?: IQueryFilters;
        contextFilter: IContextFilter;
        classOfService: IClassOfService;
        valueArea: IValueArea;
        natureOfWork: INatureOfWork;
    }) {
        this.orgId = opts.security.organisation ?? '';
        this.state = opts.state;
        this.filters = opts.filters;
        this.workItemType = opts.workItemType;
        this.classOfService = opts.classOfService;
        this.valueArea = opts.valueArea;
        this.natureOfWork = opts.natureOfWork;
    }

    private async getInventory() {
        if (!this.inventory) {
            this.inventory = await this.state.getWorkItems(
                this.orgId,
                StateCategory.PROPOSED,
                this.filters,
            );
        }

        return this.inventory!;
    }

    private async getNormalisedProposedItems(
        filterTags = PredefinedFilterTags.NORMALISATION,
        parsedQuery?: string,
    ) {
        if (!this.normalisedProposedItems?.length) {
            this.normalisedProposedItems = await this.state.getNormalisedWorkItems(
                this.orgId,
                StateCategory.PROPOSED,
                this.filters,
                parsedQuery ? undefined : filterTags,
                parsedQuery,
            );
        }
        return this.normalisedProposedItems;
    }


    public async getNormalisedWorkItemsCount() {
        const obj: Record<string, Record<string, StateItem[] | number>> = await getNormalisedWorkItems(
            this.getNormalisedProposedItems.bind(this)
        );
        for (let tag in obj) {
            for (let displayName in obj[tag]) {
                obj[tag][displayName] = (obj[tag][displayName] as StateItem[]).length;
            }
        }
        return obj as Record<string, Record<string, number>>;
    }


    async getCommitmentRate(
        filterTags?: string,
        parsedQuery?: string,
    ): Promise<Array<CommitmentRate>> {
        if (!this.commitmentRate) {
            const commitmentItems = await this.state.getCommitmentRate(
                this.orgId,
                this.filters,
                parsedQuery ? undefined : filterTags,
                parsedQuery,
            );

            const groupedCommitment = groupBy(
                commitmentItems,
                parsedQuery
                    ? 'flomatikaWorkItemTypeName'
                    : 'normalisedDisplayName',
            );
            const result: Array<CommitmentRate> = [];

            Object.keys(groupedCommitment).forEach((itemTypeName: string) => {
                const [commitmentItem, totalItem] = groupedCommitment[
                    itemTypeName
                ].sort((a: any, b: any) =>
                    a.countType.localeCompare(b.countType),
                );

                const commitmentCount = commitmentItem?.stateCount || 0;
                const totalCount = totalItem?.stateCount || 0;

                const commitmentRate =
                    !commitmentCount || !totalCount
                        ? 0
                        : Math.round((commitmentCount / totalCount) * 100);

                const formatedCommitmentRate = commitmentRate
                    ? `${commitmentRate}%`
                    : '-';

                result.push({
                    itemTypeName,
                    commitmentRate: formatedCommitmentRate,
                    commitmentRateValue: commitmentRate || 0,
                });
            });
            this.commitmentRate = result;
        }
        return this.commitmentRate!;
    }

    // get the difference between (commitmentDate - arrivalDate) + 1 = lead time to commit
    // should return the percentile85th of a collection from the result below
    async getTimeToCommit(
        filterTags?: string,
        parsedQuery?: string,
    ): Promise<Array<TimeToCommitItem>> {
        if (!this.timeToCommit) {
            const commitmentItems = await this.state.getTimeToCommit(
                this.orgId,
                this.filters,
                parsedQuery ? undefined : filterTags,
                parsedQuery,
            );

            const groupedCommitment = groupBy(
                commitmentItems,
                parsedQuery
                    ? 'flomatikaWorkItemTypeName'
                    : 'normalisedDisplayName',
            );

            const result: Array<TimeToCommitItem> = [];

            Object.keys(groupedCommitment).forEach((itemTypeName: any) => {
                const timeToCommitItems: Array<TimeToCommit> =
                    groupedCommitment[itemTypeName];

                const timeToCommit85Values = timeToCommitItems.map((item) => {
                    const startTimeToCommitment = DateTime.fromJSDate(
                        item.arrivalDate,
                    )
                        .toUTC()
                        .startOf('day');
                    const endTimeToCommitment = DateTime.fromJSDate(
                        item.commitmentDate,
                    )
                        .toUTC()
                        .startOf('day');
                    const diffInDays = Math.round(
                        endTimeToCommitment
                            .diff(startTimeToCommitment, 'days')
                            .toObject().days || 0,
                    );
                    return diffInDays + 1;
                });

                const timeToCommit85Percentile = Math.round(
                    getPercentile(85, timeToCommit85Values),
                );
                let timeToCommitPercentile85th = '-';

                if (timeToCommit85Percentile && timeToCommit85Percentile > 1) {
                    timeToCommitPercentile85th = `${timeToCommit85Percentile} days`;
                } else if (timeToCommit85Percentile === 1) {
                    timeToCommitPercentile85th = `${timeToCommit85Percentile} day`;
                }

                result.push({
                    itemTypeName,
                    timeToCommitPercentile85th,
                    timeToCommitPercentile85thValue: timeToCommit85Percentile,
                });
            });

            this.timeToCommit = result;
        }
        return this.timeToCommit!;
    }

    async getInventoryForSummaryTable(
        filterTags?: PredefinedFilterTags,
        parsedQuery?: string,
    ): Promise<Array<any>> {
        const inventoryItems = await this.getNormalisedProposedItems(
            filterTags,
            parsedQuery,
        );
        const datePeriod = await this.filters!.datePeriod()!;

        const result: Array<any> = [];

        const groupedByTypeName = groupBy(
            inventoryItems,
            parsedQuery ? 'workItemType' : 'normalisedDisplayName',
        );

        Object.keys(groupedByTypeName).forEach((itemTypeName) => {
            const rawItems = groupedByTypeName[itemTypeName];

            const inventoryAgeInWholeDays: Array<number> = rawItems
                .filter((item) => item.inventoryAgeInWholeDays != undefined)
                .map((item) => item.inventoryAgeInWholeDays!);

            const inventoryAgePercentile85th =
                Math.round(getPercentile(85, inventoryAgeInWholeDays)) || 0;

            const proposedItems = rawItems
                .sort(this.sortByArrivalDate)
                .map(this.getWeekNumber);

            const trendAnalysisInventoryAge: any = getTrendAnalysisResponse(
                proposedItems,
                datePeriod,
                reverseDefaultColours,
            );

            const inventoryVariability = this.getInventoryVariabilityByItemTypeName(
                inventoryAgeInWholeDays,
            );

            result.push({
                itemTypeName,
                inventoryCount: proposedItems.length,
                inventoryAgePercentile85th: inventoryAgePercentile85th
                    ? `${inventoryAgePercentile85th} days`
                    : '-',
                trendAnalysisInventoryAge:
                    trendAnalysisInventoryAge.lastTwoWeeks,
                inventoryVariability,
            });
        });
        return result;
    }

    getInventoryVariabilityByItemTypeName(
        inventoryAgeValues: Array<number>,
    ): string {
        const percentile98th = getPercentile(98, inventoryAgeValues);
        const percentile50th = getPercentile(50, inventoryAgeValues);

        return getVariabilityClassification(percentile50th, percentile98th);
    }

    async getInventoryData(
        filterByDate?: boolean,
        proposedWorkItems?: StateItem[],
    ): Promise<InventoryData> {
        this.filters!.filterByDate = filterByDate || false;

        let inventory = proposedWorkItems
            ? proposedWorkItems
            : await this.getInventory();

        const response: InventoryData = {
            count: 0,
            countInDate: 0,
            fromDate: DateTime.utc(),
            untilDate: DateTime.utc(),
            numDays: 0,
        };

        inventory = inventory
            .filter((item, index, array) => array.indexOf(item) === index)
            .sort(function (a, b) {
                return (
                    DateTime.fromISO(a.arrivalDate!).toMillis() -
                    DateTime.fromISO(b.arrivalDate!).toMillis()
                );
            });

        if (inventory.length < 1) return response;

        response.count = inventory.length;

        const dateWindow = await this.filters?.datePeriod();
        const windowStart = dateWindow?.start.startOf('day');
        const windowEnd = dateWindow?.end.endOf('day');

        let itemsInDateWindow = inventory.filter((item) => {
            let isInWindow = true;

            if (windowStart) {
                if (item.arrivalDateTime! < windowStart) {
                    isInWindow = false;
                    return isInWindow;
                }
            }

            if (windowEnd) {
                if (item.arrivalDateTime! > windowEnd) {
                    isInWindow = false;
                    return isInWindow;
                }
            }

            return isInWindow;
        });

        response.count = inventory.length;

        if (itemsInDateWindow.length === 0) {
            return response;
        }

        response.countInDate = itemsInDateWindow.length;

        itemsInDateWindow = itemsInDateWindow.sort((a, b) => {
            return (
                DateTime.fromISO(a.arrivalDate!).valueOf() -
                DateTime.fromISO(b.arrivalDate!).valueOf()
            );
        });

        response.fromDate = DateTime.fromISO(
            itemsInDateWindow[0].arrivalDate!,
        ).toUTC();
        //.startOf('day'); We need to know exactly the UTC datetime, so we can convert to user's timezone on the FrontEnd
        response.untilDate = DateTime.fromISO(
            itemsInDateWindow[itemsInDateWindow.length - 1].arrivalDate!,
        ).toUTC();
        //.startOf('day'); We need to know exactly the UTC datetime, so we can convert to user's timezone on the FrontEnd
        response.numDays = round(
            response.untilDate.diff(response.fromDate, 'days').days,
        );

        return response;
    }

    async getTrendAnalysis(): Promise<TrendAnalysis> {
        //Get dataset, sort it desc and map it to get a collection of week numbers
        const proposedItems = (await this.getInventory())
            .sort(this.sortByArrivalDate)
            .map(this.getWeekNumber);
        const response = getTrendAnalysisResponse(
            proposedItems,
            await this.filters!.datePeriod(),
            reverseDefaultColours,
        );

        return response;
    }

    async getWorkItemTypeAnalysisData() {
        const workItemTypesMap = new Map(
            (await this.workItemType.getTypes(this.orgId)).map((wit) => [
                wit.id,
                wit.displayName,
            ]),
        );

        return (await this.getInventory())
            .map((workItem) =>
                workItemTypesMap.get(workItem.flomatikaWorkItemTypeId!),
            )
            .sort((a, b) => {
                if (a == undefined) {
                    a = "";
                }
                if (b == undefined) {
                    b = "";
                }
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
        const result: Map<string, number> = new Map();

        (await this.getInventory()).forEach((workItem) => {
            let typeOfWork: string = 'N/A';

            if (workItem.flomatikaWorkItemTypeLevel === 'Requirement') {
                if (workItem.flomatikaWorkItemTypeId === '4')
                    typeOfWork = 'Failure Demand';
                else if (workItem.flomatikaWorkItemTypeId === '3') {
                    //TODO: valueAreaId doesn't exist
                    typeOfWork = 'Value Demand';
                    // if (workItem.valueAreaId === '1')
                    //     typeOfWork = 'Non-value Demand';
                    // else typeOfWork = 'Value Demand';
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
        const classesOfService = new Map(
            (
                await this.classOfService.getEverything(this.orgId)
            ).map((item) => [item.id, item.displayName]),
        );

        return (await this.getInventory())
            .map((workItem) =>
                workItem.classOfServiceId
                    ? classesOfService.get(workItem.classOfServiceId)
                    : 'Not classified',
            )
            .sort((a, b) => {
                if (a == undefined) {
                    a = "";
                }
                if (b == undefined) {
                    b = "";
                }
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
        return (await this.getInventory())
            .map((workItem) =>
                workItem.state ? workItem.state : 'Unknown state',
            )
            .sort((a, b) => a.localeCompare(b))
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
        const naturesOfWork = new Map(
            (await this.natureOfWork.getEverything(this.orgId)).map((item) => [
                item.id,
                item.displayName,
            ]),
        );

        return (await this.getInventory())
            .map((workItem) =>
                workItem.natureOfWorkId
                    ? naturesOfWork.get(workItem.natureOfWorkId!)
                    : 'Not classified',
            )
            .sort((a, b) => {
                if (a == undefined) {
                    a = "";
                }
                if (b == undefined) {
                    b = "";
                }
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
        const valueAreas = new Map(
            (await this.valueArea.getEverything(this.orgId)).map((item) => [
                item.id,
                item.displayName,
            ]),
        );

        return (await this.getInventory())
            .filter((item) => item.valueAreaId)
            .map((workItem) => valueAreas.get(workItem.valueAreaId!))
            .sort((a, b) => {
                if (a == undefined) {
                    a = "";
                }
                if (b == undefined) {
                    b = "";
                }
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
        return extractAssignmentDataFromWorkItems(await this.getInventory());
    }

    private async getInventoryAge(): Promise<Array<number>> {
        return (await this.getInventory())
            .filter((item) => item.inventoryAgeInWholeDays != undefined)
            .map((item) => item.inventoryAgeInWholeDays!);
    }

    async getMinimum(): Promise<number> {
        const wipAges = await this.getInventoryAge();

        if (!wipAges || wipAges.length < 1) {
            return 0;
        }

        return Math.min(...wipAges);
    }

    async getMaximum(): Promise<number> {
        const wipAges = await this.getInventoryAge();

        if (!wipAges || wipAges.length < 1) {
            return 0;
        }

        return Math.max(...wipAges);
    }

    async getAverage(): Promise<number> {
        const inventoryAge = await this.getInventoryAge();
        if (!inventoryAge || inventoryAge.length < 1) {
            return 0;
        }

        return inventoryAge.length ? Math.round(mean(...inventoryAge)) : 0;
    }

    async getWipAgeBoxPlot(): Promise<IBoxPlot> {
        const inventoryAges = await this.getInventoryAge();
        const orderedInventoryAges = inventoryAges.sort(function (a, b) {
            return a - b;
        });

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

        const median: number = getPercentile(50, inventoryAges);
        boxPlot.median = roundToDecimalPlaces(median, 2);

        const quartile1st: number = getPercentile(25, inventoryAges);
        boxPlot.quartile1st = roundToDecimalPlaces(quartile1st, 2);

        const quartile3rd: number = getPercentile(75, inventoryAges);
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

        const lowerOutliers: Array<number> = orderedInventoryAges.filter(
            (inventoryAge) => inventoryAge < lowerWhisker,
        );
        boxPlot.lowerOutliers = lowerOutliers
            .filter((item, index, array) => array.indexOf(item) === index)
            .sort(function (a, b) {
                return a - b;
            });

        const upperOutliers: Array<number> = orderedInventoryAges.filter(
            (inventoryAge) => inventoryAge > upperWhisker,
        );
        boxPlot.upperOutliers = upperOutliers
            .filter((item, index, array) => array.indexOf(item) === index)
            .sort(function (a, b) {
                return a - b;
            });

        return boxPlot;
    }

    async getShapeOfWipAgeDistribution(): Promise<string> {
        const percentile98th = await this.getPercentile(98);
        const percentile50th = await this.getPercentile(50);
        return getDistributionShape(percentile50th, percentile98th);
    }

    async getModes(): Promise<Array<number>> {
        const inventoryAge = await this.getInventoryAge();
        if (!inventoryAge || inventoryAge.length < 1) {
            return [];
        }

        const returnedModes = mode(...inventoryAge);

        return Array.isArray(returnedModes) ? returnedModes : [returnedModes];
    }

    async getPercentile(percent: number): Promise<number> {
        return getPercentile(percent, await this.getInventoryAge());
    }

    async getHistogramDataV2(): Promise<Array<HistogramDatum>> {
        const proposedItems = await this.getInventory();
        const inventoryAgeGroups = groupBy(
            proposedItems,
            'inventoryAgeInWholeDays',
        );
        const inventoryAge = Object.keys(inventoryAgeGroups) as Array<
            keyof typeof inventoryAgeGroups
        >;
        return inventoryAge.map((inventoryAge) => ({
            ageInDays: Number(inventoryAge),
            workItems: inventoryAgeGroups[inventoryAge].map(
                ({ workItemId }) => ({
                    id: workItemId ?? '',
                }),
            ),
        }));
    }

    async getScatterplotData(): Promise<Array<ScatterplotDatum>> {
        const workitems = await this.getInventory();
        return workitems.map((workItem) => {
            return {
                workItemId: workItem.workItemId!,
                title: workItem.title!,
                workItemType: workItem.flomatikaWorkItemTypeName!,
                arrivalDateNoTime: workItem.arrivalDate!,
                inventoryAgeInWholeDays: workItem.inventoryAgeInWholeDays!,
            };
        });
    }

    sortByArrivalDate(a: StateItem, b: StateItem): any {
        return (
            DateTime.fromISO(b.arrivalDate!).valueOf() -
            DateTime.fromISO(a.arrivalDate!).valueOf()
        );
    }

    getWeekNumber(stateItem: StateItem): any {
        return DateTime.fromISO(stateItem.arrivalDate!).weekNumber;
    }

    async getWorkItemList() {
        const workItems = await this.getInventory();
        const workItemListService = await getWorkItemListService();
        return workItemListService.getWorkItemList(
            workItems,
            'inventoryAgeInWholeDays',
            this.orgId,
        );
    }
}
