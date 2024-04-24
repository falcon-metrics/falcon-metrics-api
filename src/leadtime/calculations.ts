import {
    groupBy,
    sortBy,
} from 'lodash';
import { DateTime } from 'luxon';
import {
    mean,
    mode,
} from 'mathjs';

import { IBoxPlot } from '../common/box_plot';
import {
    IQueryFilters,
    PredefinedFilterTags,
} from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import { IContextFilter } from '../context/context_filter';
import { IWorkItemType } from '../data_v2/work_item_type_aurora';
import {
    FQLFilterAttributes,
    FQLFilterModel,
} from '../models/FilterModel';
import {
    leadTimeFieldsByPeriod,
    periodMap,
    stateCategoryMapByPeriod,
} from '../summary/calculations';
import {
    getDistributionShape,
    getPercentile,
    getPercentRank,
    getVariabilityClassification,
    roundToDecimalPlaces,
} from '../utils/statistics';
import {
    getTrendAnalysisContent,
    TrendAnalysis,
    TrendAnalysisStructure,
} from '../utils/trend_analysis';
import { HistogramDatum } from '../wip/calculations';
import { StateItem } from '../workitem/interfaces';
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
    IState,
    StateCategory,
} from '../workitem/state_aurora';

export type ScatterplotDatum = {
    workItemId: string;
    title: string;
    workItemType: string;
    arrivalDateNoTime: string;
    commitmentDateNoTime: string;
    departureDateNoTime: string;
    leadTimeInWholeDays: number;
};

export type LeadtimePastTableItem = {
    itemTypeName: string;
    leadtimePercentile: number;
    trendAnalysisLeadTime: any;
    variabilityLeadTime: string;
};

export type SLEItem = {
    itemTypeName: string;
    serviceLevelExpectationDays: number;
    serviceLevelPercent: number;
    trendAnalysisSLE: TrendAnalysisStructure;
};

type LeadtimePercentileItem = {
    itemTypeName: string;
    leadtimePercentile: number;
};

type WorkItemTypeItem = {
    id: string;
    displayName: string;
    level: string;
    serviceLevelExpectationInDays: number;
};

type WorkItemWithSLE = {
    workItemType: string;
    itemTypeId: string;
    serviceLevelExpectationDays: number;
    week: number;
    leadtime: number;
    departureDate?: string;
    commitmentDate?: string;
    arrivalDate?: string;
};

type WorkItemsWithRawTimesPerWeek = {
    rawLeadTimesPerWeek: number[];
} & WorkItemWithSLE;

type WorkItemsWithSLEDictionary = {
    [workItemType: string]: WorkItemsWithRawTimesPerWeek;
};

type WorkitemTypeWithServiceLevelPercent = {
    itemTypeName: string;
    itemTypeId: string;
    serviceLevelExpectationDays: number;
    serviceLevelPercent?: number;
};

export class Calculations {
    private orgId: string;
    private state: IState;
    private workItemType: IWorkItemType;
    private filters?: IQueryFilters;
    private contextFilter: IContextFilter;
    private completedItems?: Array<StateItem>;
    private completedItemsSortedByLeadTime?: Array<StateItem>;
    private currentPeriodFilter: string;
    private normalisedCompletedItems: Array<any>;
    private filterItemsWithSLE: Array<any>;

    constructor(opts: {
        security: SecurityContext;
        state: IState;
        workItemType: IWorkItemType;
        filters?: IQueryFilters;
        contextFilter: IContextFilter;
    }) {
        this.currentPeriodFilter = 'past';
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
        this.filters = opts.filters;
        this.contextFilter = opts.contextFilter;
        this.workItemType = opts.workItemType;
        this.normalisedCompletedItems = [];
        this.filterItemsWithSLE = [];
    }

    private async getCompletedItems(stateCategory = StateCategory.COMPLETED): Promise<StateItem[]> {
        if (
            !this.completedItems ||
            this.currentPeriodFilter !== this.getCurrentPeriod()
        ) {
            const NO_FQL_FILTER = undefined;
            const completedItems: StateItem[] = await this.state.getWorkItems(
                this.orgId,
                stateCategory,
                this.filters,
                NO_FQL_FILTER,
                [
                    'id',
                    'flomatikaWorkItemTypeName',
                    'title',
                    'workItemId',
                    'arrivalDate',
                    'commitmentDate',
                    'departureDate',
                    'flomatikaWorkItemTypeId',
                    'flomatikaWorkItemTypeLevel'
                ],
            );

            this.completedItems = completedItems as Array<StateItem>;
            return this.completedItems;
        }

        return this.completedItems!;
    }

    private async getNormalisedCompletedItems(
        stateCategory = StateCategory.COMPLETED,
        normalisationTag?: string,
        parsedQuery?: string,
    ) {
        if (!this.normalisedCompletedItems?.length) {
            this.normalisedCompletedItems = await this.state.getNormalisedWorkItems(
                this.orgId,
                stateCategory,
                this.filters,
                parsedQuery
                    ? undefined
                    : normalisationTag || PredefinedFilterTags.NORMALISATION,
                parsedQuery,
            );
        }
        return this.normalisedCompletedItems;
    }

    private async getSleAndTargetFromFilters(
        filterTags: string = PredefinedFilterTags.NORMALISATION,
        obeyaOrg?: string,
    ) {
        this.filterItemsWithSLE = await this.state.getFQLFilters(
            obeyaOrg || this.orgId,
            filterTags,
        );

        this.filterItemsWithSLE = this.filterItemsWithSLE.map(
            (filterItem: FQLFilterAttributes) => {
                return {
                    serviceLevelExpectationDays: filterItem.SLE,
                    serviceLevelPercent: filterItem.target,
                    itemTypeName: filterItem.displayName,
                };
            },
        );
        return this.filterItemsWithSLE;
    }

    async getCompletedItemsSortedByLeadTime(): Promise<StateItem[]> {
        if (!this.completedItemsSortedByLeadTime) {
            this.completedItemsSortedByLeadTime = sortBy(
                await this.getCompletedItems(),
                ['leadTimeInWholeDays'],
            );
        }

        return this.completedItemsSortedByLeadTime;
    }

    async getLeadTimes(
        defaultCompletedWorkItems?: StateItem[],
    ): Promise<Array<number>> {
        const completedWorkItems = defaultCompletedWorkItems
            ? defaultCompletedWorkItems
            : await this.getCompletedItems();
        return completedWorkItems
            .filter((item) => item.leadTimeInWholeDays != undefined)
            .map((item) => item.leadTimeInWholeDays!);
    }


    private async getLeadTimesByWorkItemTypeLevel(workItemTypelevel: string): Promise<Array<number>> {
        const completedItems = (await this.getCompletedItems())
            .filter((item) =>
                item.leadTimeInWholeDays != undefined
                && item.flomatikaWorkItemTypeLevel?.toLowerCase() === workItemTypelevel.toLowerCase())
            .map((item) => item.leadTimeInWholeDays!);

        return completedItems;
    }

    async getMinimum(): Promise<number> {
        const leadTimes = await this.getLeadTimes();

        if (!leadTimes || leadTimes.length < 1) {
            return 0;
        }

        return Math.min(...leadTimes);
    }

    async getMaximum(): Promise<number> {
        const leadTimeDays = await this.getLeadTimes();

        if (!leadTimeDays || leadTimeDays.length < 1) {
            return 0;
        }

        return Math.max(...leadTimeDays);
    }

    async getAverage(defaultCompletedWorkItems?: StateItem[]): Promise<number> {
        const leadTimeDays = await this.getLeadTimes(defaultCompletedWorkItems);
        if (!leadTimeDays || leadTimeDays.length < 1) {
            return 0;
        }

        return leadTimeDays.length ? Math.round(mean(...leadTimeDays)) : 0;
    }

    async getLeadTimeBoxPlot(): Promise<IBoxPlot> {
        const leadTimeDays = await this.getLeadTimes();
        const orderedLeadTimes = leadTimeDays.sort(function (a, b) {
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

        const median: number = getPercentile(50, leadTimeDays);
        boxPlot.median = roundToDecimalPlaces(median, 2);

        const quartile1st: number = getPercentile(25, leadTimeDays);
        boxPlot.quartile1st = roundToDecimalPlaces(quartile1st, 2);

        const quartile3rd: number = getPercentile(75, leadTimeDays);
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

    async getShapeOfLeadTimeDistribution(): Promise<string> {
        const percentile98th = await this.getPercentile(98);
        const percentile50th = await this.getPercentile(50);
        return getDistributionShape(percentile50th, percentile98th);
    }

    getLeadTimeVariability(leadtimeValues: Array<number>): string {
        const percentile98th = getPercentile(98, leadtimeValues);
        const percentile50th = getPercentile(50, leadtimeValues);
        return getVariabilityClassification(percentile50th, percentile98th);
    }

    async getModes(): Promise<Array<number>> {
        const leadTimeDays = await this.getLeadTimes();
        if (!leadTimeDays || leadTimeDays.length < 1) {
            return [];
        }

        const returnedModes = mode(...leadTimeDays);

        return Array.isArray(returnedModes) ? returnedModes : [returnedModes];
    }

    async getPercentile(percent: number): Promise<number> {
        return getPercentile(percent, await this.getLeadTimes());
    }

    async getPercentileByWorkItemTypeLevel(percent: number, workItemTypeLevel: string): Promise<number> {
        const leadTimes = await this.getLeadTimesByWorkItemTypeLevel(workItemTypeLevel);

        if (leadTimes.length == 1) return leadTimes[0]; //if Lead Times count === 1

        return roundToDecimalPlaces(getPercentile(percent, leadTimes), 2);
    }

    async getHistogramDataV2(): Promise<Array<HistogramDatum>> {
        const completedItems = await this.getCompletedItemsSortedByLeadTime();

        const leadTimeGroups = groupBy(completedItems, 'leadTimeInWholeDays');
        const leadTimes = Object.keys(leadTimeGroups) as Array<
            keyof typeof leadTimeGroups
        >;
        return leadTimes.map((leadTime) => ({
            ageInDays: Number(leadTime),
            workItems: leadTimeGroups[leadTime].map(({ workItemId }) => ({
                id: workItemId ?? '',
            })),
        }));
    }

    async getCompletedItemCount(): Promise<number> {
        return (await this.getCompletedItems()).length;
    }

    async getScatterplot(): Promise<Array<ScatterplotDatum>> {
        const workitems = await this.getCompletedItems();

        return workitems.map((workItem) => {
            return {
                workItemId: workItem.workItemId!,
                title: workItem.title!,
                workItemType: workItem.flomatikaWorkItemTypeName!,
                arrivalDateNoTime: workItem.arrivalDate!,
                commitmentDateNoTime: workItem.commitmentDate!,
                departureDateNoTime: workItem.departureDate!,
                leadTimeInWholeDays: workItem.leadTimeInWholeDays!,
            };
        });
    }

    private getCurrentPeriod(): string {
        this.currentPeriodFilter =
            this.filters?.queryParameters?.summaryPeriodType || 'past';
        return this.currentPeriodFilter;
    }

    async getLeadTimeByItemTypeName(
        parsedQuery?: string,
    ): Promise<Array<LeadtimePercentileItem>> {
        const completedItems = await this.getNormalisedCompletedItems(
            StateCategory.COMPLETED,
            undefined,
            parsedQuery,
        );

        const groupedByWorkItemTypeNames: any = groupBy(
            completedItems,
            parsedQuery ? 'workItemType' : 'normalisedDisplayName',
        );

        // Calculate leadtime85percentile for all workitems to use in present table
        const leadtimePerItemWorkName: Array<LeadtimePercentileItem> = [];
        Object.keys(groupedByWorkItemTypeNames).forEach(
            (itemTypeName: string) => {
                const workItemList = groupedByWorkItemTypeNames[itemTypeName];
                const leadTimeData = workItemList.map(
                    (item: { [index: string]: any; }) =>
                        item.leadTimeInWholeDays,
                );

                const leadtimePercentile: number =
                    Math.round(getPercentile(85, leadTimeData)) || 0;

                leadtimePerItemWorkName.push({
                    itemTypeName,
                    leadtimePercentile,
                });
            },
        );
        return leadtimePerItemWorkName;
    }

    async getLeadTimeForSummaryTable(
        period?: string,
        parsedQuery?: string,
    ): Promise<Array<LeadtimePastTableItem>> {
        const currentPeriod = this.getCurrentPeriod();
        const currentStateCategory =
            stateCategoryMapByPeriod[period || currentPeriod];
        const periodField = periodMap[currentPeriod] || 'departureDate';
        const ledTimeField =
            leadTimeFieldsByPeriod[currentPeriod] || 'leadTimeInWholeDays';

        const response: Array<LeadtimePastTableItem> = [];
        const completedItems = await this.getNormalisedCompletedItems(
            currentStateCategory,
            parsedQuery ? undefined : PredefinedFilterTags.DEMAND,
            parsedQuery,
        );

        if (completedItems.length < 1) return response;

        // get all values separated by flomatikaWorkItemTypeName
        const groupedByWorkItemTypeNames: any = groupBy(
            completedItems,
            parsedQuery ? 'workItemType' : 'normalisedDisplayName',
        );

        Object.keys(groupedByWorkItemTypeNames).forEach(
            (workItemName: string) => {
                const workItemList = groupedByWorkItemTypeNames[workItemName];
                const leadTimeData = workItemList.map(
                    (item: { [index: string]: any; }) => item[ledTimeField],
                );

                // Caclulate leadtime for all workitems
                const leadtime85percentile: number =
                    Math.round(getPercentile(85, leadTimeData)) || 0;

                // Calculate variability Low | High
                const variabilityLeadTime: string = this.getLeadTimeVariability(
                    leadTimeData,
                );

                // Access penultimate and antepenultimate weeks count
                const itemsPerWeek = groupBy(
                    workItemList,
                    (workItem) =>
                        // TODO make it dynamicaly when receive period filter (past, present, future)
                        DateTime.fromISO(workItem[periodField]!).weekNumber,
                );

                const weeksNumbers = Object.keys(itemsPerWeek);
                const [penultimateWeek] = weeksNumbers.slice(-2);
                const [antepenultimateWeek] = weeksNumbers.slice(-3);

                // Access the values of penultimate and antepenultimate week
                const workItemsFromPenultimateWeek =
                    itemsPerWeek[penultimateWeek].map(
                        (item: any) => item[ledTimeField],
                    ) || [];
                const workItemsFromAntePenultimateWeek =
                    itemsPerWeek[antepenultimateWeek].map(
                        (item: any) => item[ledTimeField],
                    ) || [];

                // Calculate the percentile on the penultimate week
                const percentile85PenultimateWeek =
                    Math.round(
                        getPercentile(85, workItemsFromPenultimateWeek),
                    ) || 0;

                const percentile85AntePenultimateWeek =
                    Math.round(
                        getPercentile(85, workItemsFromAntePenultimateWeek),
                    ) || 0;

                // Calculate the trend analyses
                const trendAnalysisLeadTime = getTrendAnalysisContent(
                    percentile85AntePenultimateWeek,
                    percentile85PenultimateWeek,
                    'week',
                    undefined,
                    true,
                );

                response.push({
                    itemTypeName: workItemName,
                    leadtimePercentile: leadtime85percentile,
                    trendAnalysisLeadTime,
                    variabilityLeadTime,
                });
            },
        );

        return response;
    }

    async getFiltersFromParsedQueryOrTags(): Promise<
        Array<FQLFilterAttributes>
    > {
        const fqlFilters = await this.getSleAndTargetFromFilters(
            PredefinedFilterTags.DEMAND,
        );
        return fqlFilters;
    }

    /*
     * getServiceLevelDetailsForObeya()
     * Calculate sle for workItemType belongs the set of workItems defined in parsedQuery.
     * Should not calculate normalised or consider SLE from filter table,
     * Should get the SLE value from each workItemType.
     **/
    async getServiceLevelDetailsForObeya(parsedQuery?: string): Promise<any> {
        const currentPeriod = this.getCurrentPeriod();
        const periodField = periodMap[currentPeriod] || 'departureDate';
        const ledTimeField =
            leadTimeFieldsByPeriod[currentPeriod] || 'leadTimeInWholeDays';

        const allSLEConfigItems = (await this.workItemType.getTypes(
            this.orgId,
        )) as WorkItemTypeItem[];

        const completedItems = (
            await this.getNormalisedCompletedItems(
                StateCategory.COMPLETED,
                undefined,
                parsedQuery,
            )
        ).filter(
            (item: { [index: string]: any; }) =>
                item[ledTimeField] !== undefined,
        );

        const allWorkItemsWithSLE: WorkItemWithSLE[] = [];
        allSLEConfigItems.forEach((itemType: WorkItemTypeItem) => {
            completedItems
                .sort(
                    (
                        a: { [index: string]: any; },
                        b: { [index: string]: any; },
                    ) => {
                        return (
                            DateTime.fromISO(b[periodField]!).valueOf() -
                            DateTime.fromISO(a[periodField]!).valueOf()
                        );
                    },
                )
                .filter((item) => item.flomatikaWorkItemTypeId === itemType.id)
                .forEach((workItem: { [index: string]: any; }) => {
                    const workItemWithSLE: WorkItemWithSLE = {
                        [periodField]: workItem[periodField],
                        workItemType: workItem.workItemType,
                        itemTypeId: itemType.id,
                        serviceLevelExpectationDays:
                            itemType.serviceLevelExpectationInDays,
                        week: DateTime.fromISO(workItem[periodField]!)
                            .weekNumber,
                        leadtime: workItem[ledTimeField]!,
                    };
                    allWorkItemsWithSLE.push(workItemWithSLE);
                    return workItemWithSLE;
                });
        });

        const workItems: WorkItemsWithSLEDictionary = {};
        // get all leadtime weeks by
        allWorkItemsWithSLE.forEach((workItem: any) => {
            const { workItemType } = workItem;
            const currentRawLeadTimePerWeek = {
                week: DateTime.fromISO(workItem[periodField]!).weekNumber,
                leadtime: workItem.leadtime,
            };

            if (!Object.keys(workItems).includes(workItemType)) {
                workItems[workItemType] = {
                    ...workItem,
                    rawLeadTimesPerWeek: [currentRawLeadTimePerWeek],
                };
            } else {
                workItems[workItemType] = {
                    ...workItem,
                    rawLeadTimesPerWeek: [
                        ...workItems[workItemType].rawLeadTimesPerWeek,
                        currentRawLeadTimePerWeek,
                    ],
                };
            }
        });

        // Calculate Trend
        const workItemsWithTrend = this.calculateSLETrend(workItems);
        return workItemsWithTrend;
    }

    calculateSLETrend(workItems: WorkItemsWithSLEDictionary): SLEItem[] {
        const workItemsWithTrendValue: SLEItem[] = [];
        Object.keys(workItems).forEach((workItemType: any) => {
            const workItem = workItems[workItemType];
            const {
                trendAnalysisSLE,
                serviceLevelPercent,
                serviceLevelExpectationDays,
            } = this.calculateSLEPerLastWeek(
                workItem.rawLeadTimesPerWeek,
                workItem.serviceLevelExpectationDays,
            );
            workItemsWithTrendValue.push({
                serviceLevelExpectationDays: serviceLevelExpectationDays || 0,
                serviceLevelPercent: serviceLevelPercent || 0,
                itemTypeName: workItemType,
                trendAnalysisSLE: trendAnalysisSLE || {
                    percentage: 0,
                    text: '-',
                    arrowDirection: '-',
                    arrowColour: '-',
                },
            });
        });
        return workItemsWithTrendValue;
    }

    async getServiceLevelDetailsNormalised(): Promise<Array<SLEItem>> {
        const currentPeriod = this.getCurrentPeriod();
        const periodField = periodMap[currentPeriod] || 'departureDate';
        const ledTimeField =
            leadTimeFieldsByPeriod[currentPeriod] || 'leadTimeInWholeDays';

        const fqlFilters: Array<FQLFilterAttributes> = await this.getFiltersFromParsedQueryOrTags();

        const slePerWorkItemTypeName = groupBy(
            fqlFilters.map((filter) => ({
                ...filter,
                rawLeadTimesPerWeek: [],
            })),
            'itemTypeName',
        );

        const completedItems = (
            await this.getNormalisedCompletedItems(
                StateCategory.COMPLETED,
                PredefinedFilterTags.DEMAND,
            )
        ).filter(
            (item: { [index: string]: any; }) =>
                item[ledTimeField] !== undefined,
        );

        const groupedByNormalisedItems: any = {};
        // get all leadtime weeks by
        completedItems.forEach((completedWorkItem) => {
            const normalisedDisplayName =
                completedWorkItem.normalisedDisplayName;

            const currentSLEFilter =
                slePerWorkItemTypeName?.[normalisedDisplayName][0];

            const currentRawLeadTimePerWeek = {
                week: DateTime.fromISO(completedWorkItem[periodField]!)
                    .weekNumber,
                leadtime: completedWorkItem[ledTimeField]!,
            };
            if (currentSLEFilter) {
                if (
                    !Object.keys(groupedByNormalisedItems).includes(
                        normalisedDisplayName,
                    )
                ) {
                    groupedByNormalisedItems[normalisedDisplayName] = {
                        ...currentSLEFilter,
                        itemTypeName: normalisedDisplayName,
                        rawLeadTimesPerWeek: [currentRawLeadTimePerWeek],
                    };
                } else {
                    groupedByNormalisedItems[normalisedDisplayName] = {
                        ...currentSLEFilter,
                        itemTypeName: normalisedDisplayName,
                        rawLeadTimesPerWeek: [
                            ...groupedByNormalisedItems[normalisedDisplayName]
                                .rawLeadTimesPerWeek,
                            currentRawLeadTimePerWeek,
                        ],
                    };
                }
            }
        });

        const workItemsWithTrend = this.calculateSLETrend(
            groupedByNormalisedItems,
        );
        return workItemsWithTrend;
    }

    calculateSLEPerLastWeek(
        rawLeadTimesPerWeek: Array<any>,
        serviceLevelExpectationDays: number,
    ) {
        //Initialise response object
        const response: TrendAnalysis = {
            lastWeek: {
                percentage: 0,
                text: '',
                arrowDirection: '',
                arrowColour: '',
            },
        };

        let currentWeek: number = 0;
        let lastWeek: number = 0;

        const leadTimePerWeek: Array<{
            week: number;
            leadtime: number;
        }> = [];
        const percentageRankPerWeek: Array<{
            week: number;
            percentageRank: number;
        }> = [];

        if (rawLeadTimesPerWeek.length > 0) {
            //Get a unique list of weeks
            const uniqueWeeks = Array.from(
                rawLeadTimesPerWeek.map((item) => item.week),
            ).filter((item, index, array) => array.indexOf(item) === index);

            //Create a list of lead time per week
            rawLeadTimesPerWeek.forEach((item) => {
                leadTimePerWeek.push({
                    week: item.week,
                    leadtime: item.leadtime,
                });
            });

            //GetPercentageRank per Week
            uniqueWeeks.forEach((weekNum) => {
                const leadTimesListPerWeek = leadTimePerWeek
                    .filter((item) => item.week === weekNum)
                    .map((item) => item.leadtime);

                percentageRankPerWeek.push({
                    week: weekNum,
                    percentageRank: roundToDecimalPlaces(
                        getPercentRank(
                            leadTimesListPerWeek,
                            serviceLevelExpectationDays!,
                        ),
                        2,
                    ),
                });
            });

            //Calculation and fill response object
            if (percentageRankPerWeek.length > 1) {
                const weekIndex = percentageRankPerWeek.length - 1;
                currentWeek = percentageRankPerWeek[weekIndex].percentageRank;

                if (percentageRankPerWeek.length >= 2) {
                    lastWeek =
                        percentageRankPerWeek[weekIndex - 1].percentageRank;
                    response.lastWeek! = getTrendAnalysisContent(
                        lastWeek,
                        currentWeek,
                        'week',
                    );
                }
            }
        }

        let targetMet = null;
        if (rawLeadTimesPerWeek.length > 0) {
            const achievedLength = rawLeadTimesPerWeek
                .map((item) => item.leadtime)
                .filter((item) => item <= serviceLevelExpectationDays).length;
            targetMet = roundToDecimalPlaces(
                achievedLength / rawLeadTimesPerWeek.length,
                2,
            );
        }
        const serviceLevelPercent = targetMet;

        return {
            trendAnalysisSLE: response.lastWeek,
            serviceLevelExpectationDays,
            serviceLevelPercent,
        };
    }

    async getPredictability(withTrendAnalyses = false): Promise<Array<any>> {
        const currentPeriod = this.getCurrentPeriod();
        const currentStateCategory = stateCategoryMapByPeriod[currentPeriod];
        const periodField = periodMap[currentPeriod] || 'departureDate';
        const leadTimeField =
            leadTimeFieldsByPeriod[currentPeriod] || 'leadTimeInWholeDays';

        let allSLEConfigItems = (await this.workItemType.getTypes(
            this.orgId,
        )) as WorkItemTypeItem[];
        const completedItems = (
            await this.getCompletedItems(currentStateCategory)
        ).filter(
            (item: { [index: string]: any; }) =>
                item[leadTimeField] !== undefined,
        );

        if (this.filters && this.filters.workItemTypes)
            allSLEConfigItems = allSLEConfigItems.filter((item: any) =>
                (this.filters!.workItemTypes as Array<string>).includes(
                    item.id,
                ),
            );
        const itemTypeReturned: Set<string> = new Set();
        const result = allSLEConfigItems.map((itemType: WorkItemTypeItem) => {
            const rawLeadTimesPerWeek = completedItems
                .sort(function (
                    a: { [index: string]: any; },
                    b: { [index: string]: any; },
                ) {
                    return (
                        DateTime.fromISO(b[periodField]!).valueOf() -
                        DateTime.fromISO(a[periodField]!).valueOf()
                    );
                })
                .filter((item) => item.flomatikaWorkItemTypeId === itemType.id)
                .map((item: { [index: string]: any; }) => {
                    itemTypeReturned.add(itemType.id);

                    return {
                        week: DateTime.fromISO(item[periodField]!).weekNumber,
                        leadtime: item[leadTimeField]!,
                    };
                });

            //Initialise response object
            const response: TrendAnalysis = {
                lastWeek: {
                    percentage: 0,
                    text: '',
                    arrowDirection: '',
                    arrowColour: '',
                },
                lastTwoWeeks: {
                    percentage: 0,
                    text: '',
                    arrowDirection: '',
                    arrowColour: '',
                },
                lastFourWeeks: {
                    percentage: 0,
                    text: '',
                    arrowDirection: '',
                    arrowColour: '',
                },
            };

            let currentWeek: number = 0;
            let lastWeek: number = 0;
            let currentTwoWeeks: number = 0;
            let previousTwoWeeks: number = 0;
            let currentFourWeeks: number = 0;
            let previousFourWeeks: number = 0;

            const leadTimePerWeek: Array<{
                week: number;
                leadtime: number;
            }> = [];
            const percentageRankPerWeek: Array<{
                week: number;
                percentageRank: number;
            }> = [];
            const percentageRankPerTwoWeeks: Array<{
                week: number;
                percentageRank: number;
            }> = [];
            const percentageRankPerFourWeeks: Array<{
                week: number;
                percentageRank: number;
            }> = [];

            if (rawLeadTimesPerWeek.length > 0) {
                //Get a unique list of weeks
                const uniqueWeeks = Array.from(
                    rawLeadTimesPerWeek.map((item) => item.week),
                ).filter((item, index, array) => array.indexOf(item) === index);

                //Create a list of lead time per week
                rawLeadTimesPerWeek.forEach((item) => {
                    leadTimePerWeek.push({
                        week: item.week,
                        leadtime: item.leadtime,
                    });
                });

                //GetPercentageRank per Week
                uniqueWeeks.forEach((weekNum) => {
                    const leadTimesListPerWeek = leadTimePerWeek
                        .filter((item) => item.week === weekNum)
                        .map((item) => item.leadtime);

                    percentageRankPerWeek.push({
                        week: weekNum,
                        percentageRank: roundToDecimalPlaces(
                            getPercentRank(
                                leadTimesListPerWeek,
                                itemType.serviceLevelExpectationInDays!,
                            ),
                            2,
                        ),
                    });
                });

                //Using 2 for fortnight, 4 for month
                let trendPeriodIndex = 0;
                let leadTimesListPerWeekTemp: Array<number> = [];

                //GetPercentageRank per two weeks
                uniqueWeeks.forEach((weekNum) => {
                    const leadTimesListPerWeek = leadTimePerWeek
                        .filter((item) => item.week === weekNum)
                        .map((item) => item.leadtime);

                    if (trendPeriodIndex < 2) {
                        leadTimesListPerWeekTemp = leadTimesListPerWeekTemp.concat(
                            leadTimesListPerWeek,
                        );
                        trendPeriodIndex++;
                    } else {
                        percentageRankPerTwoWeeks.push({
                            week: weekNum,
                            percentageRank: roundToDecimalPlaces(
                                getPercentRank(
                                    leadTimesListPerWeekTemp,
                                    itemType.serviceLevelExpectationInDays!,
                                ),
                                2,
                            ),
                        });
                        trendPeriodIndex = 0;
                        leadTimesListPerWeekTemp = [];
                    }
                });

                trendPeriodIndex = 0;
                leadTimesListPerWeekTemp = [];

                //GetPercentageRank per four weeks
                uniqueWeeks.forEach((weekNum) => {
                    const leadTimesListPerWeek = leadTimePerWeek
                        .filter((item) => item.week === weekNum)
                        .map((item) => item.leadtime);

                    if (trendPeriodIndex < 4) {
                        leadTimesListPerWeekTemp = leadTimesListPerWeekTemp.concat(
                            leadTimesListPerWeek,
                        );
                        trendPeriodIndex++;
                    } else {
                        percentageRankPerFourWeeks.push({
                            week: weekNum,
                            percentageRank: roundToDecimalPlaces(
                                getPercentRank(
                                    leadTimesListPerWeekTemp,
                                    itemType.serviceLevelExpectationInDays!,
                                ),
                                2,
                            ),
                        });
                        trendPeriodIndex = 0;
                        leadTimesListPerWeekTemp = [];
                    }
                });

                const arraySize = percentageRankPerWeek.length;
                const arrayIndex = percentageRankPerWeek.length - 1;

                const arraySizeTwoWeeks = percentageRankPerTwoWeeks.length;
                const arrayIndexTwoWeeks = percentageRankPerTwoWeeks.length - 1;

                const arraySizeFourWeeks = percentageRankPerFourWeeks.length;
                const arrayIndexFourWeeks =
                    percentageRankPerFourWeeks.length - 1;

                //Calculation and fill response object
                if (arraySize > 1) {
                    currentWeek =
                        percentageRankPerWeek[arrayIndex].percentageRank;

                    if (arraySize >= 2) {
                        lastWeek =
                            percentageRankPerWeek[arrayIndex - 1]
                                .percentageRank;
                        response.lastWeek! = getTrendAnalysisContent(
                            lastWeek!,
                            currentWeek!,
                            'week',
                        );
                    }
                    if (arraySizeTwoWeeks >= 2) {
                        currentTwoWeeks =
                            percentageRankPerTwoWeeks[arrayIndexTwoWeeks]
                                .percentageRank;

                        previousTwoWeeks =
                            percentageRankPerTwoWeeks[arrayIndexTwoWeeks - 1]
                                .percentageRank;

                        response.lastTwoWeeks! = getTrendAnalysisContent(
                            previousTwoWeeks!,
                            currentTwoWeeks!,
                            'week',
                        );
                    }
                    if (arraySizeFourWeeks >= 2) {
                        currentFourWeeks =
                            percentageRankPerFourWeeks[arrayIndexFourWeeks]
                                .percentageRank;
                        previousFourWeeks =
                            percentageRankPerFourWeeks[arrayIndexFourWeeks - 1]
                                .percentageRank;

                        response.lastFourWeeks! = getTrendAnalysisContent(
                            previousFourWeeks!,
                            currentFourWeeks!,
                            'week',
                        );
                    }
                }
            }

            // -------------- Percentile -----------
            const analysisResponse: {
                trendAnalysisSLE?: any;
            } = {};
            let trendAnalysis: any = { trendAnalysis: response };

            if (withTrendAnalyses) {
                analysisResponse.trendAnalysisSLE = response.lastWeek;
                trendAnalysis = {};
            }
            let targetMet;

            if (rawLeadTimesPerWeek.length > 0) {
                const achievedLength = rawLeadTimesPerWeek
                    .map((item) => item.leadtime)
                    .filter(
                        (item) =>
                            item <= itemType.serviceLevelExpectationInDays!,
                    ).length;
                // targetMet = roundToDecimalPlaces(achievedLength / rawLeadTimesPerWeek.length, 2);
                //target vs achieved
                targetMet = roundToDecimalPlaces(
                    achievedLength / rawLeadTimesPerWeek.length,
                    2,
                );
            }

            return {
                ...analysisResponse,
                ...trendAnalysis,
                itemTypeName: itemType.displayName!,
                itemTypeId: itemType.id!,
                serviceLevelExpectationDays: itemType.serviceLevelExpectationInDays!,
                serviceLevelPercent: targetMet,
            };
        });
        const rest = result.filter((response) =>
            itemTypeReturned.has(response.itemTypeId),
        );

        return rest;
    }
}
