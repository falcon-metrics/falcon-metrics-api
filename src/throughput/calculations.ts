import { groupBy, uniqBy } from 'lodash';
import { DateTime, Interval } from 'luxon';
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { mean, round } from 'mathjs';
import { generateDateArray } from '../common/aggregation';

import { IBoxPlot } from '../common/box_plot';
import { IQueryFilters, PredefinedFilterTags } from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import { IContextFilter } from '../context/context_filter';
import { IClassOfService } from '../data_v2/class_of_service';
import { INatureOfWork } from '../data_v2/nature_of_work';
import { IValueArea } from '../data_v2/value_area';
import { IWorkItemType } from '../data_v2/work_item_type_aurora';
import { consolidateDeliveryRateByContext } from '../obeya/predictive_analysis/utils/summary_utils';
import { periodMap, stateCategoryMapByPeriod } from '../summary/calculations';
import {
    AssignedToDatum,
    extractAssignmentDataFromWorkItems,
} from '../utils/assigned_to';
import { isDateLastDayOfWeek } from '../utils/date_utils';
import { getNormalisedWorkItems } from '../utils/getNormalisedWorkItems';
import { getPercentile, roundToDecimalPlaces } from '../utils/statistics';
import {
    getTrendAnalysisContent,
    getTrendAnalysisResponse,
    TrendAnalysis,
    TrendAnalysisStructure,
} from '../utils/trend_analysis';
import { StateItem } from '../workitem/interfaces';
import { IState, StateCategory } from '../workitem/state_aurora';
import getWorkItemListService from '../workitem/WorkItemList';
import { getThroughputVariability } from './utils';

export type ThroughputData = {
    count: number;
    fromDate: DateTime;
    untilDate: DateTime;
    numDays: number;
};

export type ThroughputRunChartDataV2 = {
    throughputSeries: Array<{
        weekEndingOn: DateTime;
        workItems: Array<{ id: string; }>;
    }>;
};

type TrendAnalysisType = Omit<TrendAnalysisStructure, 'percentage'>;

export type ThroughputSummaryTable = {
    itemTypeName: string;
    throughput: number;
    trendAnalysisThroughput: TrendAnalysisType;
    variabilityThroughput: string;
};

export class Calculations {
    private orgId: string;
    private state: IState;
    private workItemType: IWorkItemType;
    private filters?: any; //IQueryFilters;
    private contextFilter: IContextFilter;
    private completedItems?: Array<StateItem>;
    private classOfService: IClassOfService;
    private valueArea: IValueArea;
    private natureOfWork: INatureOfWork;
    private currentPeriodFilter: string;
    private normalisedCompletedItems?: Array<any>;

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
        this.currentPeriodFilter = 'past';
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
        this.workItemType = opts.workItemType;
        this.filters = opts.filters;
        this.contextFilter = opts.contextFilter;
        this.classOfService = opts.classOfService;
        this.valueArea = opts.valueArea;
        this.natureOfWork = opts.natureOfWork;
    }

    private async getNormalisedCompletedItems(
        filterTags: string = PredefinedFilterTags.NORMALISATION,
        parsedQuery?: string,
    ): Promise<Array<StateItem>> {
        if (!this.normalisedCompletedItems?.length) {
            this.normalisedCompletedItems = await this.state.getNormalisedWorkItems(
                this.orgId,
                StateCategory.COMPLETED,
                this.filters,
                parsedQuery ? undefined : filterTags,
                parsedQuery,
            );
        }
        return this.normalisedCompletedItems;
    }

    async getValueDemandCompletedItems(
        filterTag: string = PredefinedFilterTags.QUALITY,
    ): Promise<StateItem[]> {
        const qualityItems = await this.getNormalisedCompletedItems(filterTag);
        return qualityItems;
    }

    async getNormalisedWorkItemsCount(
        specificTags?: PredefinedFilterTags[],
    ): Promise<Record<string, Record<string, number>>> {
        const obj: Record<
            string,
            Record<string, StateItem[] | number>
        > = await getNormalisedWorkItems(
            this.getNormalisedCompletedItems.bind(this),
            specificTags,
        );
        for (const tag in obj) {
            for (const displayName in obj[tag]) {
                obj[tag][displayName] = (obj[tag][
                    displayName
                ] as StateItem[]).length;
            }
        }
        return obj as Record<string, Record<string, number>>;
    }

    private async getCompletedItems(stateCategory = StateCategory.COMPLETED) {
        if (
            !this.completedItems ||
            this.currentPeriodFilter !== this.getCurrentPeriod()
        ) {
            const completedItems = await this.state.getWorkItems(
                this.orgId,
                stateCategory,
                this.filters,
            );
            this.contextFilter,
                this.filters,
                (this.completedItems = completedItems);
        }
        return this.completedItems!;
    }

    async getTrendAnalysis(): Promise<TrendAnalysis> {
        //Get dataset, sort it desc and map it to get a collection of week numbers
        const completedItems = (await this.getCompletedItems())
            .sort(function (a, b) {
                return (
                    DateTime.fromISO(b.departureDate!).valueOf() -
                    DateTime.fromISO(a.departureDate!).valueOf()
                );
            })
            .map(
                (stateItem) =>
                    DateTime.fromISO(stateItem.departureDate!).weekNumber,
            );
        const response = getTrendAnalysisResponse(
            completedItems,
            await this.filters!.datePeriod(),
        );

        return response;
    }

    async getThroughputData(
        defaultCompletedItems?: StateItem[],
    ): Promise<ThroughputData> {
        const completedItems = defaultCompletedItems
            ? defaultCompletedItems
            : await this.getCompletedItems();

        const uniqueCompletedWorkItemList = uniqBy(
            completedItems,
            'workItemId',
        );

        let startDepartureDate = null;
        let endDepartureDate = null;

        for (const workItem of uniqueCompletedWorkItemList) {
            if (!workItem.departureDateTime) {
                continue;
            }
            if (
                startDepartureDate === null ||
                startDepartureDate.valueOf() >
                workItem.departureDateTime.valueOf()
            ) {
                startDepartureDate = workItem.departureDateTime;
            }
            if (
                endDepartureDate === null ||
                endDepartureDate.valueOf() <
                workItem.departureDateTime.valueOf()
            ) {
                endDepartureDate = workItem.departureDateTime;
            }
        }

        if (startDepartureDate === null) {
            startDepartureDate = DateTime.utc();
        }

        if (endDepartureDate === null) {
            endDepartureDate = DateTime.utc();
        }

        return {
            count: uniqueCompletedWorkItemList.length,
            fromDate: startDepartureDate,
            untilDate: endDepartureDate,
            numDays: endDepartureDate
                .diff(startDepartureDate, 'days')
                .as('days'),
        };
    }

    private getCurrentPeriod(): string {
        this.currentPeriodFilter =
            (this.filters?.queryParameters &&
                this.filters?.queryParameters?.summaryPeriodType) ||
            'past';
        return this.currentPeriodFilter;
    }

    async getThroughputSummaryTable(
        parsedQuery?: string,
    ): Promise<Array<ThroughputSummaryTable>> {
        const currentPeriod = this.getCurrentPeriod();
        const currentStateCategory = stateCategoryMapByPeriod[currentPeriod];

        let completedItems = await this.state.getNormalisedWorkItems(
            this.orgId,
            currentStateCategory,
            this.filters,
            parsedQuery ? undefined : 'demand',
            parsedQuery,
        );

        const periodField = periodMap[currentPeriod] || 'departureDate';
        const response: Array<ThroughputSummaryTable> = [];

        completedItems = completedItems.sort(
            (a: { [index: string]: any; }, b: { [index: string]: any; }) => {
                return (
                    // TODO make it dynamicly to filter past, present, future
                    DateTime.fromISO(a[periodField]!).valueOf() -
                    DateTime.fromISO(b[periodField]!).valueOf()
                );
            },
        );

        if (completedItems.length < 1) return response;

        // get all values by flomatikaWorkItemTypeName
        const groupedByWorkItemTypeNames: any = groupBy(
            completedItems,
            parsedQuery ? 'flomatikaWorkItemTypeName' : 'normalisedDisplayName',
        );

        Object.keys(groupedByWorkItemTypeNames).forEach(
            (workItemName: string) => {
                const workItemList = groupedByWorkItemTypeNames[workItemName];

                // Access throughput count of a specific workItemType
                const throughput: number = workItemList.length;

                // Calculate variability Low | High
                const variabilityThroughput: string = getThroughputVariability([
                    throughput,
                ]);

                // Access penultimate and antepenultimate weeks count
                const itemsPerWeek = groupBy(
                    workItemList,
                    (workItem) =>
                        DateTime.fromISO(workItem[periodField]!).weekNumber,
                );
                const weeksNumbers = Object.keys(itemsPerWeek);
                const [penultimateWeek] = weeksNumbers.slice(-2);
                const [antepenultimateWeek] = weeksNumbers.slice(-3);

                const workItemsFromPenultimateWeek =
                    itemsPerWeek[penultimateWeek] || [];
                const workItemsFromAntePenultimateWeek =
                    itemsPerWeek[antepenultimateWeek] || [];
                const trendAnalysisThroughput = getTrendAnalysisContent(
                    workItemsFromAntePenultimateWeek.length,
                    workItemsFromPenultimateWeek.length,
                    'week',
                );

                response.push({
                    itemTypeName: workItemName,
                    throughput,
                    trendAnalysisThroughput,
                    variabilityThroughput,
                });
            },
        );

        return response;
    }

    async getThroughputRunChartDataV2(
        listOfCompletedWorkItems?: StateItem[],
    ): Promise<ThroughputRunChartDataV2> {
        const throughputRunChartData: ThroughputRunChartDataV2 = {
            throughputSeries: [],
        };

        const workItemList =
            listOfCompletedWorkItems || (await this.getCompletedItems());

        const completedWorkItems = workItemList
            .map((workItem) => ({
                departureDateEndOfDay: DateTime.fromISO(
                    workItem.departureDate!,
                ).endOf('day'),
                id: workItem.workItemId,
            }))
            .sort(
                (a, b) =>
                    a.departureDateEndOfDay.valueOf() -
                    b.departureDateEndOfDay.valueOf(),
            );

        if (!completedWorkItems.length) return throughputRunChartData;

        const allWeekEndingOnValues: Array<string> = [];
        throughputRunChartData.throughputSeries = completedWorkItems.reduce(
            (throughputSeries, currWorkItem) => {
                const lastEntry: any =
                    throughputSeries[throughputSeries.length - 1];

                if (
                    currWorkItem.departureDateEndOfDay.valueOf() <=
                    lastEntry.weekEndingOn.valueOf()
                ) {
                    lastEntry.workItems.push({ id: currWorkItem.id! });
                } else {
                    let nextWeekEnd = lastEntry.weekEndingOn.plus({ days: 7 });
                    while (
                        currWorkItem.departureDateEndOfDay.valueOf() >
                        nextWeekEnd.valueOf()
                    ) {
                        nextWeekEnd = nextWeekEnd.plus({ days: 7 });
                    }

                    allWeekEndingOnValues.push(nextWeekEnd.toISODate());
                    throughputSeries.push({
                        weekEndingOn: nextWeekEnd,
                        workItems: [{ id: currWorkItem.id! }],
                    });
                }

                return throughputSeries;
            },
            new Array<{
                weekEndingOn: DateTime;
                workItems: Array<{ id: string; }> | [];
            }>({
                weekEndingOn: completedWorkItems[0].departureDateEndOfDay.endOf(
                    'week',
                ),
                workItems: [],
            }),
        );

        const datePeriod = await this.filters!.datePeriod();

        // Should generate array with weekEndingOn of each week bettwen the filter range
        const weeksWithinFilterRange = Interval.fromDateTimes(
            datePeriod.start,
            datePeriod.end,
        )
            .splitBy({ weeks: 1 })
            .reduce((acc: any, dateValue: Interval) => {
                // get ISODate to compare it after and avoid difference bettwen hours or timezone
                const weekFromEnd = dateValue.end.toISODate();
                const weekFromStart = dateValue.end.toISODate();

                const weekEndingOn = DateTime.fromISO(weekFromEnd)
                    .endOf('week')
                    .toISODate();
                const weekEndOnFromStartingInterval = DateTime.fromISO(
                    weekFromStart,
                )
                    .endOf('week')
                    .toISODate();

                if (!acc.includes(weekEndingOn)) {
                    acc.push(weekEndingOn);
                }
                if (!acc.includes(weekEndOnFromStartingInterval)) {
                    acc.push(weekEndOnFromStartingInterval);
                }
                return acc;
            }, []);

        weeksWithinFilterRange.forEach((currentWeekDate: string) => {
            if (!allWeekEndingOnValues.includes(currentWeekDate)) {
                throughputRunChartData.throughputSeries.push({
                    weekEndingOn: DateTime.fromISO(currentWeekDate),
                    workItems: [],
                });
            }
        });

        return throughputRunChartData;
    }

    async getDeliveryRateBoxPlot(): Promise<IBoxPlot> {
        const deliveryRate: Array<any> = (
            await this.getThroughputRunChartDataV2()
        ).throughputSeries.map((value) => value.workItems.length);

        const orderedLeadTimes = deliveryRate.sort(function (a, b) {
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

        const median: number = getPercentile(50, deliveryRate);
        boxPlot.median = roundToDecimalPlaces(median, 2);

        const quartile1st: number = getPercentile(25, deliveryRate);
        boxPlot.quartile1st = roundToDecimalPlaces(quartile1st, 2);

        const quartile3rd: number = getPercentile(75, deliveryRate);
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

        const lowerOutliers: Array<number> = orderedLeadTimes.filter(
            (leadtime) => leadtime < lowerWhisker,
        );
        boxPlot.lowerOutliers = lowerOutliers
            .filter((item, index, array) => array.indexOf(item) === index)
            .sort(function (a, b) {
                return a - b;
            });

        const upperOutliers: Array<number> = orderedLeadTimes.filter(
            (leadtime) => leadtime > upperWhisker,
        );
        boxPlot.upperOutliers = upperOutliers
            .filter((item, index, array) => array.indexOf(item) === index)
            .sort(function (a, b) {
                return a - b;
            });

        return boxPlot;
    }

    async getPercentile(percent: number): Promise<number> {
        const deliveryRate: Array<any> = (
            await this.getThroughputRunChartDataV2()
        ).throughputSeries.map((value) => value.workItems.length);

        return getPercentile(percent, deliveryRate);
    }

    getPercentileByWorkItemType(
        percent: number,
        workItemCountValues: Array<any>,
    ): number {
        return getPercentile(percent, workItemCountValues);
    }

    async getMinimum(): Promise<number> {
        const deliveryRate: Array<any> = (
            await this.getThroughputRunChartDataV2()
        ).throughputSeries.map((value) => value.workItems.length);

        if (!deliveryRate || deliveryRate.length < 1) {
            return 0;
        }

        return Math.min(...deliveryRate);
    }

    async getMaximum(): Promise<number> {
        const deliveryRate: Array<any> = (
            await this.getThroughputRunChartDataV2()
        ).throughputSeries.map((value) => value.workItems.length);

        if (!deliveryRate || deliveryRate.length < 1) {
            return 0;
        }

        return Math.max(...deliveryRate);
    }

    async getWorkItemTypeAnalysisData() {
        const workItemTypesMap = new Map(
            (await this.workItemType.getTypes(this.orgId)).map((wit) => [
                wit.id,
                wit.displayName,
            ]),
        );

        return (await this.getCompletedItems())
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

    // TODO work out how we're going to drive some of the matches here
    // through config. Maybe this needs to be done at etl and map to an id
    async getDemandAnalysisData() {
        const result: Map<string, number> = new Map();

        (await this.getCompletedItems()).forEach((workItem) => {
            let typeOfWork: string = 'N/A';

            if (workItem.flomatikaWorkItemTypeLevel === 'Requirement') {
                if (workItem.flomatikaWorkItemTypeId === '4')
                    typeOfWork = 'Failure Demand';
                else if (workItem.flomatikaWorkItemTypeId === '3') {
                    if (workItem.valueAreaId === '1')
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
        const classesOfService = new Map(
            (
                await this.classOfService.getEverything(this.orgId)
            ).map((item) => [item.id, item.displayName]),
        );

        return (await this.getCompletedItems())
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

    async getPlannedUnplannedAnalysisData() {
        const naturesOfWork = new Map(
            (await this.natureOfWork.getEverything(this.orgId)).map((item) => [
                item.id,
                item.displayName,
            ]),
        );

        return (await this.getCompletedItems())
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

        return (await this.getCompletedItems())
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

    async getAssignedToAnalysisData(): Promise<Array<AssignedToDatum>> {
        return extractAssignmentDataFromWorkItems(
            await this.getCompletedItems(),
        );
    }

    async getWorkItemList() {
        const workItems = await this.getCompletedItems();
        const workItemListService = await getWorkItemListService();
        return workItemListService.getWorkItemList(
            workItems,
            'leadTimeInWholeDays',
            this.orgId,
        );
    }

    async getAverageThroughput(
        completedWorkItems: StateItem[],
    ): Promise<number> {
        let dateRange: Interval | undefined = await this.filters?.datePeriod();

        const areValidDates =
            dateRange?.start?.isValid && dateRange?.end?.isValid;

        if (dateRange === undefined || !dateRange.isValid || !areValidDates) {
            return 0; // todo: return invalid state
        }

        // Replace endDate to Sunday of last completed week
        let effectiveEndDate = dateRange?.end;
        if (!isDateLastDayOfWeek(effectiveEndDate)) {
            effectiveEndDate = dateRange?.end
                .minus({
                    weeks: 1,
                })
                .endOf('week');
        }

        // Remove items completed after effectiveEndDate
        completedWorkItems = completedWorkItems.filter(
            (workItem) =>
                workItem.departureDateTime!.valueOf() <
                effectiveEndDate.valueOf(),
        );

        // Replace dateRange value with startDate and effectiveEndDate
        dateRange = Interval.fromDateTimes(dateRange?.start, effectiveEndDate);

        // Group completed work per week
        const groupedWorkItemByAggregation = generateDateArray(
            dateRange,
            'week',
        ).map((startDate) => {
            const endDate = startDate.endOf('week');
            return {
                startDate,
                endDate,
                workItemList: completedWorkItems.filter(
                    (workItem) =>
                        startDate.valueOf() <
                        workItem.departureDateTime!.valueOf() &&
                        workItem.departureDateTime!.valueOf() <
                        endDate.valueOf(),
                ),
            };
        });

        if (!groupedWorkItemByAggregation.length) {
            return 0; // todo: return an invalid state
        }

        const throuputWeeklyValues = groupedWorkItemByAggregation.map(
            (group) => group.workItemList.length,
        );

        return Math.round(mean(throuputWeeklyValues));
    }
}
