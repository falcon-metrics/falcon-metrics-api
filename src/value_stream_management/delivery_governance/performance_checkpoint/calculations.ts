import {
    chain,
    groupBy,
    uniq,
    uniqBy,
} from 'lodash';
import { Logger } from 'log4js';
import {
    DateTime,
    Interval,
} from 'luxon';
import {
    mean,
    median,
    round,
    std,
} from 'mathjs';

import {
    AggregationKey,
    generateDateArray,
    getWorkItemDateAdjuster,
    isDateTimeValid,
} from '../../../common/aggregation';
import {
    IQueryFilters,
    PredefinedFilterTags,
} from '../../../common/filters_v2';
import { SecurityContext } from '../../../common/security';
import {
    IWorkItemType,
    WorkItemTypeItem,
} from '../../../data_v2/work_item_type_aurora';
import {
    Calculations as ThroughputCalculations,
    ThroughputRunChartDataV2,
} from '../../../throughput/calculations';
import { getThroughputVariability } from '../../../throughput/utils';
import {
    getPercentile,
    roundToDecimalPlaces,
} from '../../../utils/statistics';
import {
    getTrendAnalysisContent,
    TrendAnalysisStructure,
} from '../../../utils/trend_analysis';
import {
    FlowEfficiencyAverageItem,
    StateItem,
} from '../../../workitem/interfaces';
import { ISnapshotQueries } from '../../../workitem/snapshot_queries';
import {
    IState,
    StateCategory,
} from '../../../workitem/state_aurora';
import {
    Calculations as ContinuousImprovementsCalculations,
} from '../../continuous_improvements/flow_analysis/calculations';
type WorkitemTypeWithServiceLevelPercent = {
    itemTypeName: string;
    itemTypeId: string;
    serviceLevelExpectationDays: number;
    serviceLevelPercent: number;
};

type LeadTimeWeek = {
    week: number;
    leadtime: number;
};

export type RawCompletedItemByWeek = {
    weekEndingOn: DateTime;
    workItems: Array<{ id: string }>;
};

export type ProductivityRawData = Array<RawCompletedItemByWeek>;

export type StandardDefaultValue = {
    value: number;
    label: string;
};

export type StandardDeviationValues = {
    bellowStd3: StandardDefaultValue;
    bellowStd2: StandardDefaultValue;
    bellowStd1: StandardDefaultValue;
    medianValue: StandardDefaultValue;
    aboveMedian1: StandardDefaultValue;
    aboveMedian2: StandardDefaultValue;
    aboveMedian3: StandardDefaultValue;
};

export type ThroughputCountPerWeek = {
    weekEndingOn: DateTime;
    throughput: number;
};

export type CompletedItemByWeekWithCount = {
    [index: number]: any;
    weekEndingOn: DateTime;
    throughput: number;
};

export type StateItemWithLeadTime = {
    workItemId?: string;
    leadTimeInWholeDays?: number;
    departureDate?: string;
};

export type FlowEfficiencyItem = {
    workItemId?: string;
    leadTimeInWholeDays?: number;
    activeTime?: number;
    waitingTime?: number;
    activeTimePercent?: number;
    waitingTimePercent?: number;
    sumOfActiveAndWaiting?: number;
    departureDate?: string;
};

export class Calculations {
    readonly orgId?: string;
    readonly logger: Logger;
    readonly state: IState;
    readonly filters?: IQueryFilters;
    private workItemType: IWorkItemType;
    private allSLEConfigItems?: WorkItemTypeItem[];
    readonly throughputCalculations: ThroughputCalculations;
    private normalisedQualityWorkItems?: StateItem[];
    private throughPutWorkItemsByWeek?: RawCompletedItemByWeek[];
    readonly continuousImprovementsCalculations: ContinuousImprovementsCalculations;
    private snapshotQueries: ISnapshotQueries;
    
    constructor(opts: {
        security: SecurityContext;
        logger: Logger;
        state: IState;
        filters?: IQueryFilters;
        workItemType: IWorkItemType;
        throughputCalculations: ThroughputCalculations;
        snapshotQueries: ISnapshotQueries;
        continuousImprovementsCalculations: ContinuousImprovementsCalculations;
    }) {
        this.orgId = opts.security.organisation!;
        this.logger = opts.logger;
        this.state = opts?.state;
        this.filters = opts.filters;
        this.workItemType = opts.workItemType;
        this.throughputCalculations = opts.throughputCalculations;
        this.continuousImprovementsCalculations = opts.continuousImprovementsCalculations;
        this.snapshotQueries = opts.snapshotQueries;
        
        this.allSLEConfigItems = undefined;
        this.normalisedQualityWorkItems = undefined;
        this.throughPutWorkItemsByWeek = undefined;
    }

    getCompletedWorkItems() {
        return this.state.getWorkItems(
            this.orgId!,
            StateCategory.COMPLETED,
            this.filters,
        );
    }
    
    getLeadTimes(completedWorkItems: StateItem[]): Array<number> {
        return completedWorkItems
            .filter((item) => item.leadTimeInWholeDays != undefined)
            .map((item) => item.leadTimeInWholeDays!);
    }

    calculateLeadTime(completedWorkItems: StateItem[]): number {
        const leadTimes = this.getLeadTimes(completedWorkItems);
        return Math.round(getPercentile(85, leadTimes));
    }

    getPercentile85thTeamLevel(completedWorkItems: StateItem[]): number {
        const completedTeamLevelWorkItems = completedWorkItems.filter(
            (w) => w?.flomatikaWorkItemTypeLevel === 'Team',
        );
        const percentile85thTeam = this.calculateLeadTime(
            completedTeamLevelWorkItems,
        );
        return percentile85thTeam;
    }

    getPercentile85thPortfolioLevel(completedWorkItems: StateItem[]): number {
        const completedPortfolioLevelWorkItems = completedWorkItems.filter(
            (w) => w?.flomatikaWorkItemTypeLevel === 'Portfolio',
        );
        const percentile85thPortfolioLevel = this.calculateLeadTime(
            completedPortfolioLevelWorkItems,
        );
        return percentile85thPortfolioLevel;
    }

    async getSLEConfigItems(): Promise<WorkItemTypeItem[]> {
        if (!this.allSLEConfigItems) {
            const allSLEConfigItems = await this.workItemType.getTypes(
                this.orgId!,
            );
            this.allSLEConfigItems = allSLEConfigItems;
        }
        return this.allSLEConfigItems;
    }

    async calculateTargetMet(completedWorkItems: StateItem[]): Promise<number> {
        const allSLEConfigItems: WorkItemTypeItem[] = await this.getSLEConfigItems();

        const workItemsWithServiceLevelPercent: WorkitemTypeWithServiceLevelPercent[] = this.getLeadtimeByWorkItemTypeWithSLE(
            completedWorkItems,
            allSLEConfigItems,
        );

        const targetMetValue = sumTargetMetOfAllWorkItemTypes(
            workItemsWithServiceLevelPercent,
        );
        const flomatikaWorkItemTypeIdLength = Object.keys(
            groupBy(completedWorkItems, 'flomatikaWorkItemTypeId'),
        );

        const average =
            targetMetValue === 0 || flomatikaWorkItemTypeIdLength?.length === 0
                ? 0
                : (targetMetValue * 100) / flomatikaWorkItemTypeIdLength.length;
        return Math.round(average);
    }

    /**
     * getLeadtimeByWorkItemTypeWithSLE:
     *   should calculate target met and leadTime for all composed workItemTypes values
     *   will be showed in fitness criteria widget
     *
     * 1. compose all raw lead time data
     *
     * 2. calculate how many work items types that had achieved the expectation in SLE
     **/
    getLeadtimeByWorkItemTypeWithSLE(
        completedItems: StateItem[],
        allSLEConfigItems: WorkItemTypeItem[],
    ): WorkitemTypeWithServiceLevelPercent[] {
        if (this.filters && this.filters.workItemTypes) {
            allSLEConfigItems = getSleFilteredByWorkItem(
                allSLEConfigItems,
                this.filters!.workItemTypes as Array<string>,
            );
        }

        const {
            workItemsWithServiceLevelPercent,
            itemTypeReturned,
        } = calculateSLEPerWorkItem(allSLEConfigItems, completedItems);

        const getValidSLES = (
            workItemWithSLE: WorkitemTypeWithServiceLevelPercent,
        ) => {
            return itemTypeReturned.includes(workItemWithSLE.itemTypeId);
        };
        return workItemsWithServiceLevelPercent.filter(getValidSLES);
    }

    async isValidRangeDate(dateRange?: Interval) {
        const beginDate = dateRange?.start;
        const endDate = dateRange?.end;
        const areValidDates = beginDate?.isValid && endDate?.isValid;

        return dateRange === undefined || !dateRange.isValid || !areValidDates;
    }

    async calculateHistoricalViewToTargetMetAndSLE(
        aggregation: AggregationKey,
        completedWorkItems: StateItem[],
    ): Promise<{
        percentile85thChart: any[];
        targetMetChart: any[];
    }> {
        const percentile85thChart: any[] = [];
        // Determine and Validate Rolling Window
        const dateRange = await this.filters?.datePeriod();
        const isValidRangeDate = await this.isValidRangeDate(dateRange);

        if (isValidRangeDate) {
            return {
                percentile85thChart: [],
                targetMetChart: [],
            };
        }

        // Get all data with SLE calculated
        const rawLeadtimeData: StateItem[] = getRawCompletedItemsWithWholeDays(
            completedWorkItems,
        );

        // Create a array of time points that depends of the current aggregation
        const dates: DateTime[] = generateDateArray(dateRange!, aggregation);

        // Adjusts Work Item Dates by Aggregation
        const aggregationDateAdjuster = getWorkItemDateAdjuster(aggregation);
        const uniqueWorkItems: StateItem[] = chain(rawLeadtimeData)
            .uniqBy('workItemId')
            .value();

        const workItems = chain(uniqueWorkItems.map(aggregationDateAdjuster))
            .sortBy('departureDate')
            .value();

        // Go through specific time point that depends of the current aggregation (day, week, month, quarter, year) 
        // Find work items within that time point
        // Sum all SLE on that time point (day, week, month, quarter, year)
        const allSLEConfigItems = await this.getSLEConfigItems();

        // Establish Count for Each Date
        const buildRecordForDate = (date: DateTime): [string, number] => {
            // check the days that matches with the workItem depatureDays
            const filteredWorkItemsWithinTimePoint = workItems.filter(
                filterWorkItemsInSpecificTimePoint(date),
            );

            // calculate each SLE by each workItemType
            const calculatedWorkItemsWithSLE = this.getLeadtimeByWorkItemTypeWithSLE(
                filteredWorkItemsWithinTimePoint,
                allSLEConfigItems,
            );

            // calculate SLE of them and composing all workItemTypes by each day
            const composedSLEValuesByEachSpecificDay = sumTargetMetOfAllWorkItemTypes(
                calculatedWorkItemsWithSLE,
            );

            percentile85thChart.push([
                date.toISODate(),
                getPercentile(
                    85,
                    filteredWorkItemsWithinTimePoint.map(
                        (w: StateItem) => w?.leadTimeInWholeDays || 0,
                    ),
                ) || 0,
            ]);
            return [date.toISODate(), composedSLEValuesByEachSpecificDay * 10];
        };

        const targetMetResult = dates.map(buildRecordForDate);

        return {
            percentile85thChart,
            targetMetChart: targetMetResult,
        };
    }

    async getThroughputDataByWeek(
        completedItems: StateItem[],
    ): Promise<RawCompletedItemByWeek[]> {
        // should return throughput data chuncked by week numbers
        if (!this.throughPutWorkItemsByWeek) {
            const {
                throughputSeries,
            }: ThroughputRunChartDataV2 = await this.throughputCalculations.getThroughputRunChartDataV2(
                completedItems,
            );
            this.throughPutWorkItemsByWeek = throughputSeries;
        }
        return this.throughPutWorkItemsByWeek;
    }

    async getWeeklyThroughputData(
        completedItems: StateItem[],
    ): Promise<number[]> {
        const throughPutDataByWeek = await this.getThroughputDataByWeek(
            completedItems,
        );
        // format the data to get the througput peer week
        const throughputValuesPeerWeeks: number[] = throughPutDataByWeek.map(
            (throughputInfo: {
                weekEndingOn: DateTime;
                workItems: {
                    id: string;
                }[];
            }) => throughputInfo.workItems.length,
        );
        return throughputValuesPeerWeeks;
    }

    async calculateThroughputVariability(
        completedItems: StateItem[],
    ): Promise<string> {
        const throughputValuesPeerWeeks = await this.getWeeklyThroughputData(
            completedItems,
        );
        return getThroughputVariability(throughputValuesPeerWeeks);
    }

    private async getNormalisedQualityWorkItems(
        stateCategoryType: StateCategory,
        tag = PredefinedFilterTags.DEMAND,
    ): Promise<StateItem[]> {
        if (!this.normalisedQualityWorkItems) {
            const qualityWorkItems: StateItem[] = await this.state.getNormalisedWorkItems(
                this.orgId!,
                stateCategoryType,
                this.filters,
                tag,
                undefined,
                undefined,
            );
            this.normalisedQualityWorkItems = qualityWorkItems;
        }
        return this.normalisedQualityWorkItems;
    }

    async getValueDemand(completedWorkItems: StateItem[]): Promise<number> {
        const uniqWorkItemIds = getWorkItemIds(completedWorkItems);

        const valueDemandNormalisedItems: StateItem[] = await this.getNormalisedQualityWorkItems(
            StateCategory.COMPLETED,
            PredefinedFilterTags.QUALITY,
        );

        const uniqNormalisedWorkItems: StateItem[] = uniqBy(
            valueDemandNormalisedItems,
            'workItemId',
        );

        const amountByNormalised = getAmountOfQualityNormalisedWorkItems(
            uniqNormalisedWorkItems,
        );

        return calculatePercentOfValueDemand(
            amountByNormalised?.['Value Demand'] || 0,
            uniqWorkItemIds.length,
        );
    }

    async getValueDemandByAggregation(
        completedWorkItems: StateItem[],
        aggregation: AggregationKey,
    ): Promise<[string, number][]> {
        const qualityNormalisedWorkItems: StateItem[] = await this.getNormalisedQualityWorkItems(
            StateCategory.COMPLETED,
            PredefinedFilterTags.QUALITY,
        );
        return await calculateValueDemandByAggregation(
            qualityNormalisedWorkItems,
            aggregation,
            this.filters,
        );
    }

    async getCompletedWorkItemsByWeek(
        completedWorkItems: StateItem[],
    ): Promise<RawCompletedItemByWeek[]> {
        // Determine and Validate Rolling Window
        const dateRange:
            | Interval
            | undefined = await this.filters?.datePeriod();

        return getCompletedWorkItemsByWeek(
            'week',
            completedWorkItems,
            dateRange,
            this.filters?.clientTimezone,
        );
    }

    calculateProductivity(
        completedWorkItemsWeekly: ProductivityRawData,
    ): {
        median: number;
        current: number;
        trendAnalysis: TrendAnalysisStructure;
        productivityLabel: string;
    } {
        // Early exit for empty completed work list
        if (completedWorkItemsWeekly.length === 0) {
            return {
                productivityLabel: 'Unknown',
                median: 0,
                current: 0,
                trendAnalysis: {
                    percentage: 0,
                    text: '',
                    arrowDirection: '',
                    arrowColour: '',
                },
            };
        }
        // Unrefactored code below:

        // get total of workitems completed per week
        const countOfWorkitemsByWeek: number[] = completedWorkItemsWeekly.map(
            (workItemsPeerWeek: RawCompletedItemByWeek) =>
                workItemsPeerWeek?.workItems?.length || 0,
        ) || [0];

        // get the (current), should be the count of last completed week
        // when today is a completed day of the week we can get the current week
        // otherwise we need to get the current value of the previous completed week

        const now = DateTime.now();
        const currentYear = now.year;
        const currentWeek = now.weekNumber;

        const theLastWeek = completedWorkItemsWeekly?.slice(-1)?.[0];

        const isAnCompletedWeek = 
            currentWeek > theLastWeek.weekEndingOn.weekNumber &&
            currentYear >= theLastWeek.weekEndingOn.year;

        const previousWeekCurrentValue =
            completedWorkItemsWeekly?.slice(-2)?.[0]?.workItems?.length ||
            completedWorkItemsWeekly?.slice(-3)?.[0]?.workItems?.length ||
            completedWorkItemsWeekly?.slice(-4)?.[0]?.workItems?.length ||
            0;

        const current: number = isAnCompletedWeek
            ? completedWorkItemsWeekly?.slice(-1)?.[0].workItems?.length
            : previousWeekCurrentValue;

        // calculate (trend) using penultimate and antepenultimate weeks as we did in throughput
        const trendAnalysis: TrendAnalysisStructure = calculateTrendAnalysesForProductivity(
            completedWorkItemsWeekly,
            isAnCompletedWeek,
        );

        // get standard deviation of all completed workitems
        const standardDeviation: number = Math.ceil(
            std(
                countOfWorkitemsByWeek.length === 0
                    ? [0]
                    : countOfWorkitemsByWeek,
            ),
        );

        // calculate rolling average of each week
        // TODO remove this comment to to use on the area chart
        // const rollingAverageValuesByWeek: ThroughputCountPerWeek[] = calculateRollingAverageByWeek(
        //     completedWorkItemsWeekly.map((w: RawCompletedItemByWeek) => ({
        //         weekEndingOn: w.weekEndingOn,
        //         throughput: w.workItems.length || 0,
        //     })),
        // );

        // get mean
        const averageValue: number = countOfWorkitemsByWeek.length
            ? mean(countOfWorkitemsByWeek)
            : 0;
        // calculated values of standard deviation of each section bellow and above median
        // -stdv3 -stdv2 -stdv1  median  stdv1  sdtv2  stdv3
        const sectionsOfEachStandardDeviation: StandardDeviationValues = getEachStandardDeviationValue(
            standardDeviation,
            averageValue,
        );

        // get the last completed week
        // should classify this checking values of standards deviations sections
        const lastCompletedWeek: RawCompletedItemByWeek = isAnCompletedWeek
            ? completedWorkItemsWeekly?.slice(-1)?.[0]
            : completedWorkItemsWeekly?.slice(-2)?.[0];

        // get the label of this stdv section ()
        // Bad | Poor | Slightly Under | Median | Good | Great | Excellent
        const productivityLabel: string = checkAndClassifyProductivityOfTheLastWeek(
            lastCompletedWeek,
            sectionsOfEachStandardDeviation,
        );

        return {
            productivityLabel,
            median: Math.round(
                countOfWorkitemsByWeek.length
                    ? median(countOfWorkitemsByWeek)
                    : 0,
            ),
            current,
            trendAnalysis,
        };
    }

    // This method will return a payload to feed the KPI value that is the average of Flow efficiency
    // and also will return the values to feed the historical view within Fitness Criteria/FlowEfficiency
    async getFlowEfficiencyForFitnessCriteria(
    ): Promise<{
        averageOfWaitingTimeByAggregation: [string, number][];
        averageOfWaitingTime: number;
        averageOfActiveTime: number;
    }> {
        const {
            activeTime,
            waitingTime,
        } = await this.continuousImprovementsCalculations.getFlowEfficiencyDonutData(
            'exclude',
            'completed',
        );

        const amount = activeTime + waitingTime;
        const averageOfWaitingTime = !amount
            ? 0
            : Number(
                  ((activeTime / (activeTime + waitingTime)) * 100).toFixed(1),
              );

        return {
            averageOfWaitingTime: `${averageOfWaitingTime}`.includes('.')
                ? Math.round(Number(averageOfWaitingTime.toFixed(1)))
                : averageOfWaitingTime,
            averageOfActiveTime: 0,
            averageOfWaitingTimeByAggregation: [],
        };
    }

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
    private async getFlowEfficiencyInfo(
        workItemsIds: string[],
    ): Promise<FlowEfficiencyAverageItem[]> {
        return await this.snapshotQueries.getActiveAndQueueTime(
            workItemsIds,
            this.orgId!,
        );
    }
}

function getMeanAndRound(value: number[]): number {
    if (!value || !value.length) {
        return 0;
    }
    return round(mean(value));
}

function getWorkItemsWithleadTime(
    completedWorkItems: StateItem[],
): StateItemWithLeadTime[] {
    return completedWorkItems.map((w: StateItem) => ({
        workItemId: w?.workItemId,
        leadTimeInWholeDays: w?.leadTimeInWholeDays || 0,
        departureDate: w?.departureDate,
    }));
}

/**
* @deprecated Because this is dead code. 
* This function is not called at runtime. 
*/
// should calculate for each workItem the ratio of waiting time = (amountOfWaitingTime / leadTimeInWholeDays)
// should return the averare of the list of waiting time ration
// formula should be founded here: on completed work tab AS Column
// https://docs.google.com/spreadsheets/d/1El1MARKsuXPZn1zOHy64JOW64kihxM1dGnpDdiAZjAo/edit#gid=1162642398
function mergeActiveAndWaitingTimeWithFlowEfficienceItem(
    flowEffciencyItems: FlowEfficiencyItem[],
    activeAndWaitingTime: FlowEfficiencyAverageItem[],
): {
    averageOfActiveTime: number;
    averageOfWaitingTime: number;
    mergedItems: FlowEfficiencyItem[];
} {
    const mergedItems: FlowEfficiencyItem[] = [];
    const averageOfActiveTimeValues: number[] = [];
    const averageOfWaitingTimeValues: number[] = [];

    flowEffciencyItems.forEach((flowEfficiencyItem: FlowEfficiencyItem) => {
        const activeItems: StateItem[] | [] = findByWorkItemStateType(
            activeAndWaitingTime,
            flowEfficiencyItem?.workItemId,
            'active',
        );

        const waitingTimeItems: StateItem[] | [] = findByWorkItemStateType(
            activeAndWaitingTime,
            flowEfficiencyItem?.workItemId,
            'queue',
        );

        const activeTimePercent = getPercentValue(
            activeItems.length,
            flowEfficiencyItem.leadTimeInWholeDays,
        );

        const waitingTimePercent = getPercentValue(
            waitingTimeItems.length,
            flowEfficiencyItem.leadTimeInWholeDays,
        );

        mergedItems.push({
            workItemId: flowEfficiencyItem.workItemId,
            departureDate: flowEfficiencyItem?.departureDate,
            leadTimeInWholeDays: flowEfficiencyItem.leadTimeInWholeDays,
            activeTime: activeItems.length,
            waitingTime: waitingTimeItems.length,
            activeTimePercent: activeTimePercent,
            waitingTimePercent: waitingTimePercent,
        });
        averageOfActiveTimeValues.push(activeTimePercent || 0);
        averageOfWaitingTimeValues.push(waitingTimePercent || 0);
    });

    const averageOfActiveTime = Math.ceil(
        getMeanAndRound(averageOfActiveTimeValues),
    );
    const averageOfWaitingTime = Math.ceil(
        getMeanAndRound(averageOfWaitingTimeValues),
    );

    return {
        averageOfActiveTime,
        averageOfWaitingTime,
        mergedItems,
    };
}

function getPercentValue(value?: number, total?: number): number {
    return value && total ? (value / total) * 100 : 0;
}

// separate a list of work items by aggregation to feed fitnes criteria/flow efficiency/historical view
async function getWaitingTimeAverageByAggregation(
    aggregation: AggregationKey = 'week',
    activeAndWaitingWorkItems: FlowEfficiencyItem[],
    filters?: IQueryFilters,
): Promise<[string, number][]> {
    // Determine and Validate Rolling Window
    const dateRange = await filters?.datePeriod();

    const beginDate = dateRange?.start;
    const endDate = dateRange?.end;
    const areValidDates = beginDate?.isValid && endDate?.isValid;

    if (dateRange === undefined || !dateRange.isValid || !areValidDates) {
        return [];
    }

    // Create a array of time points that depends of the current aggregation
    const dates: DateTime[] = generateDateArray(dateRange, aggregation);

    // Adjusts Work Item Dates by Aggregation
    const aggregationDateAdjuster = getWorkItemDateAdjuster(
        aggregation,
        'departureDate',
    );

    const flowEfficiencyItemsByAggregation = chain(
        activeAndWaitingWorkItems.map(aggregationDateAdjuster),
    )
        .sortBy('departureDate')
        .value();

    type ItemFilter = (workItem: FlowEfficiencyItem) => boolean;

    // Establish Count for Each Date
    //number
    const buildRecordForDate = (date: DateTime): [string, any] => {
        // check the days that matches with the workItem depatureDays
        const filterWorkItemsInSpecificTimePoint: ItemFilter = (
            workItem: FlowEfficiencyItem,
        ) => {
            if (!workItem.departureDate) {
                return false;
            }

            const departureDay = DateTime.fromJSDate(
                new Date(workItem.departureDate),
            )?.startOf('day');
            const referenceDate = date?.startOf('day');

            const isValidWorkItemWithinTimePoint: boolean =
                isDateTimeValid(departureDay) &&
                departureDay?.hasSame(referenceDate, 'day');

            return isValidWorkItemWithinTimePoint;
        };

        const filteredWorkItemsWithinTimePoint: FlowEfficiencyItem[] = flowEfficiencyItemsByAggregation.filter(
            filterWorkItemsInSpecificTimePoint,
        );

        const averageOfWaitingTimePercentValues: number[] = filteredWorkItemsWithinTimePoint.reduce(
            (acc: number[], activeAndWaitingTime: FlowEfficiencyItem) => {
                if (activeAndWaitingTime.waitingTimePercent) {
                    acc.push(activeAndWaitingTime.waitingTimePercent);
                }
                return acc;
            },
            [],
        );

        const averageOfWaitingTime = averageOfWaitingTimePercentValues.length
            ? getMeanAndRound(averageOfWaitingTimePercentValues)
            : 0;

        return [date.toISODate(), averageOfWaitingTime];
    };

    const workitemsByAggregation = dates.map(buildRecordForDate);
    return workitemsByAggregation;
}

function findByWorkItemStateType(
    activeAndWaitingTimeItems: StateItem[],
    workItemId?: string,
    stateType?: string,
): StateItem[] | [] {
    return activeAndWaitingTimeItems.filter(
        (activeAndWaitingTimeItem: StateItem) => {
            return (
                activeAndWaitingTimeItem?.workItemId === workItemId &&
                activeAndWaitingTimeItem?.stateType === stateType
            );
        },
    );
}

/**
 *  sumTargetMetOfAllWorkItemTypes
 *  -sum all serviceLevelPercent by each workItemType and get the total
 *  -divide the total by 10 to tranform in a decimal, multiply by 100 to get percent
 *
 **/
function sumTargetMetOfAllWorkItemTypes(
    workItemsWithServiceLevelPercent: WorkitemTypeWithServiceLevelPercent[],
): number {
    const sumOfAllAchievedTargetMetByWorkitemType = workItemsWithServiceLevelPercent.reduce(
        (acc, workitemWithServiceLevelPercent) => {
            const serviceLevelPercent =
                workitemWithServiceLevelPercent.serviceLevelPercent || 0;
            acc = acc + serviceLevelPercent;
            return acc;
        },
        0,
    );

    return sumOfAllAchievedTargetMetByWorkitemType;
}

function sortLeadTimePerWeek(workItems: StateItem[]): StateItem[] {
    return workItems.sort(
        (a: { [index: string]: any }, b: { [index: string]: any }) => {
            return (
                DateTime.fromISO(b.departureDate!).valueOf() -
                DateTime.fromISO(a.departureDate!).valueOf()
            );
        },
    );
}

function getLeadTimeByFlomatikaWorkItemTypeId(
    rawLeadTimesPerWeek: StateItem[],
    itemTypeId: string,
): StateItem[] {
    return rawLeadTimesPerWeek.filter(
        (item: { flomatikaWorkItemTypeId?: string }) =>
            item?.flomatikaWorkItemTypeId === itemTypeId,
    );
}

function getFormattedLeadTimeWithWeek(
    workItems: StateItem[],
): { week: number; leadtime: number }[] {
    return workItems.map((item: StateItem) => {
        return {
            week: DateTime.fromISO(item.departureDate!)?.weekNumber,
            leadtime: item?.leadTimeInWholeDays || 0,
        };
    });
}

function getSleFilteredByWorkItem(
    sleConfigItems: WorkItemTypeItem[],
    workItemTypes: string[],
): WorkItemTypeItem[] {
    return sleConfigItems.filter((item: { id: string }) =>
        workItemTypes.includes(item.id),
    );
}

function getAchievedLeadtime(
    leadtimePerweekList: LeadTimeWeek[],
    sleConfigItem: WorkItemTypeItem,
) {
    return (leadtimePerweekList || [])
        .map((item: { leadtime: number }) => item.leadtime)
        .filter(
            (leadtime) =>
                leadtime <= sleConfigItem.serviceLevelExpectationInDays!,
        );
}

function getCalculatedTargetMet(
    formattedRawLeadtime: LeadTimeWeek[],
    itemType: WorkItemTypeItem,
): number {
    let targetMet = 0;
    if (formattedRawLeadtime.length > 0) {
        // count of all achieved
        const achievedLength: number = getAchievedLeadtime(
            formattedRawLeadtime,
            itemType,
        ).length;

        // calculate target ratio of (count of achieved / count of all weeks)
        targetMet = roundToDecimalPlaces(
            achievedLength / formattedRawLeadtime.length,
            2,
        );
    }
    return targetMet;
}

function calculateSLEPerWorkItem(
    allSLEConfigItems: WorkItemTypeItem[],
    completedItems: StateItem[],
): {
    workItemsWithServiceLevelPercent: WorkitemTypeWithServiceLevelPercent[];
    itemTypeReturned: string[];
} {
    const itemTypeReturned: string[] = [];
    const calculateSLE = (itemType: WorkItemTypeItem) => {
        // all sorted by departureDate
        const rawLeadTimesPerWeek: StateItem[] = sortLeadTimePerWeek(
            completedItems,
        );

        // get all by flomatikaWorkItemTypeId
        const filterRawLeadtime: StateItem[] = getLeadTimeByFlomatikaWorkItemTypeId(
            rawLeadTimesPerWeek,
            itemType.id,
        );

        // get leadtime peer week
        const formattedRawLeadtime: LeadTimeWeek[] = getFormattedLeadTimeWithWeek(
            filterRawLeadtime,
        );

        // should store the flomatikaWorkItemTypeIds to be returned
        itemTypeReturned.push(itemType.id);

        const targetMet = getCalculatedTargetMet(
            formattedRawLeadtime,
            itemType,
        );

        return {
            itemTypeName: itemType.displayName!,
            itemTypeId: itemType.id!,
            serviceLevelExpectationDays: itemType.serviceLevelExpectationInDays!,
            serviceLevelPercent: targetMet,
        };
    };
    return {
        workItemsWithServiceLevelPercent: allSLEConfigItems.map(calculateSLE),
        itemTypeReturned,
    };
}

function getRawCompletedItemsWithWholeDays(
    completedWorkItems: StateItem[],
): StateItem[] {
    return completedWorkItems.filter(
        (item: StateItem) => item?.leadTimeInWholeDays !== undefined,
    );
}

function filterWorkItemsInSpecificTimePoint(date: DateTime) {
    return (workItem: StateItem): boolean => {
        const departureDay = workItem.departureDate
            ? DateTime.fromISO(workItem.departureDate)?.startOf('day')
            : undefined;
        const referenceDate = date?.startOf('day');

        const isValidWorkItemWithinTimePoint: boolean =
            isDateTimeValid(departureDay) &&
            departureDay.hasSame(referenceDate, 'day');

        return isValidWorkItemWithinTimePoint;
    };
}

function calculateTrendAnalysesForProductivity(
    completedWorkItemsWeekly: ProductivityRawData,
    isAnCompletedWeek: boolean,
): TrendAnalysisStructure {
    const penultimateWeek: RawCompletedItemByWeek[] = completedWorkItemsWeekly.slice(
        isAnCompletedWeek ? -1 : -2,
    );
    const antepenultimateWeek: RawCompletedItemByWeek[] = completedWorkItemsWeekly.slice(
        isAnCompletedWeek ? -2 : 3,
    );

    const penultimateSum = penultimateWeek.reduce((p, a) => p + a.workItems.length, 0);
    const antepenultimateSum = antepenultimateWeek.reduce((p, a) => p + a.workItems.length, 0);

    return getTrendAnalysisContent(
        antepenultimateSum,
        penultimateSum,
        'week',
        {
            upColour: 'GREEN',
            downColour: 'RED',
            stableColour: 'YELLOW',
        },
    );
}

function calculateStdvBySection(
    median: number,
    standardDeviation: number,
    sectionNumber: number,
): number {
    return round(median + standardDeviation * sectionNumber);
}

function getEachStandardDeviationValue(
    standardDeviation: number,
    median: number,
): StandardDeviationValues {
    const standardDeviationValues: StandardDeviationValues = {
        bellowStd3: {
            value: calculateStdvBySection(median, standardDeviation, -3),
            label: 'Bad',
        },
        bellowStd2: {
            value: calculateStdvBySection(median, standardDeviation, -2),
            label: 'Poor',
        },
        bellowStd1: {
            value: calculateStdvBySection(median, standardDeviation, -1),
            label: 'Slightly Under',
        },
        medianValue: { value: median, label: 'Median' },
        aboveMedian1: {
            value: calculateStdvBySection(median, standardDeviation, 1),
            label: 'Good',
        },
        aboveMedian2: {
            value: calculateStdvBySection(median, standardDeviation, 2),
            label: 'Great',
        },
        aboveMedian3: {
            value: calculateStdvBySection(median, standardDeviation, 3),
            label: 'Excellent Performance',
        },
    };
    return standardDeviationValues;
}

function checkAndClassifyProductivityOfTheLastWeek(
    lastCompletedWeekRollingAverage: RawCompletedItemByWeek,
    sectionsOfEachStandardDeviation: StandardDeviationValues,
): string {
    const stvdValues = sectionsOfEachStandardDeviation;
    const currentRollingAverage =
        lastCompletedWeekRollingAverage?.workItems.length || 0;

    if (!lastCompletedWeekRollingAverage) {
        return '-';
    }

    if (currentRollingAverage >= stvdValues.medianValue.value) {
        if (currentRollingAverage <= stvdValues.aboveMedian1.value) {
            return stvdValues.aboveMedian1.label;
        }
        if (currentRollingAverage <= stvdValues.aboveMedian2.value) {
            return stvdValues.aboveMedian2.label;
        }
        if (currentRollingAverage <= stvdValues.aboveMedian3.value) {
            return stvdValues.aboveMedian3.label;
        }
    } else if (currentRollingAverage < stvdValues?.medianValue?.value) {
        if (currentRollingAverage >= stvdValues.bellowStd1.value) {
            return stvdValues.bellowStd1.label;
        }
        if (currentRollingAverage >= stvdValues.bellowStd2.value) {
            return stvdValues.bellowStd2.label;
        }
        if (currentRollingAverage >= stvdValues.bellowStd3.value) {
            return stvdValues.bellowStd3.label;
        }
    } else if (currentRollingAverage === stvdValues?.medianValue?.value) {
        return stvdValues?.medianValue?.label;
    }
    return '-';
}

function calculatePercentOfValueDemand(
    valueDemandLength: number,
    total: number,
): number {
    const valueDemandPercent =
        valueDemandLength && total ? (valueDemandLength / total) * 100 : 0;
    return round(valueDemandPercent);
}

// Should calculate the rolling average of each week:
// Is the Median of count of completed on the last 4 weeks
// or if there are no 4 weeks before should consider the length of weeks to be calculated
// For more info you can see on this spreadsheet the logic
// Source: https://docs.google.com/spreadsheets/d/1aI_Sry4kAxdP6I8zp_Wtt2T9Wyu1f4WPEDPbcn9P3jQ/edit#gid=0
function calculateRollingAverageByWeek(
    completedWorkItemsByWeek: CompletedItemByWeekWithCount[],
): ThroughputCountPerWeek[] {
    const rollingAverageResult: ThroughputCountPerWeek[] = [];
    completedWorkItemsByWeek.forEach(
        (
            completeItemsInfoByWeek: CompletedItemByWeekWithCount,
            index: number,
        ) => {
            const currentCompletedLength =
                completeItemsInfoByWeek?.throughput || 0;
            const onePreviousLastCompleted =
                completedWorkItemsByWeek?.[index - 1]?.throughput || 0;
            const twoPreviousWeekCompletedWorkitems =
                completedWorkItemsByWeek?.[index - 2]?.throughput || 0;
            const threePreviousWeekCompletedWorkitems =
                completedWorkItemsByWeek?.[index - 3]?.throughput || 0;

            const throughput = median([
                currentCompletedLength,
                onePreviousLastCompleted,
                twoPreviousWeekCompletedWorkitems,
                threePreviousWeekCompletedWorkitems,
            ]);
            rollingAverageResult.push({
                weekEndingOn: completeItemsInfoByWeek.weekEndingOn,
                throughput,
            });
        },
    );
    return rollingAverageResult;
}

function getAmountOfQualityNormalisedWorkItems(
    valueDemandItems: StateItem[],
): { [normalisedName: string]: number } {
    const amountOfNormalised: {
        [normalisedName: string]: StateItem[];
    } = groupBy(valueDemandItems, 'normalisedDisplayName');

    const amountByNormalised: { [normalisedName: string]: number } = {};
    for (const normalisedDisplayName in amountOfNormalised) {
        amountByNormalised[normalisedDisplayName] =
            amountOfNormalised?.[normalisedDisplayName]?.length || 0;
    }

    return amountByNormalised;
}

async function calculateValueDemandByAggregation(
    normalisedQualityWorkItems: StateItem[],
    aggregation: AggregationKey = 'week',
    filters?: IQueryFilters,
): Promise<[string, number][]> {
    // Determine and Validate Rolling Window
    const dateRange = await filters?.datePeriod();

    const beginDate = dateRange?.start;
    const endDate = dateRange?.end;
    const areValidDates = beginDate?.isValid && endDate?.isValid;

    if (dateRange === undefined || !dateRange.isValid || !areValidDates) {
        return [];
    }

    // Create a array of time points that depends of the current aggregation
    const dates: DateTime[] = generateDateArray(dateRange, aggregation);

    // Adjusts Work Item Dates by Aggregation
    const aggregationDateAdjuster = getWorkItemDateAdjuster(aggregation);
    const uniqueWorkItems: StateItem[] = chain(normalisedQualityWorkItems || [])
        .uniqBy('workItemId')
        .value();

    const valueDemandByActiveAggregation = chain(
        uniqueWorkItems.map(aggregationDateAdjuster),
    )
        .sortBy('departureDate')
        .value();

    type ItemFilter = (workItem: StateItem) => boolean;

    // Establish Count for Each Date
    const buildRecordForDate = (date: DateTime): [string, StateItem[]] => {
        // check the days that matches with the workItem depatureDays
        const filterWorkItemsInSpecificTimePoint: ItemFilter = (
            workItem: StateItem,
        ) => {
            if (!workItem.departureDate) {
                return false;
            }
            const departureDay = DateTime.fromISO(
                workItem.departureDate,
            )?.startOf('day');
            const referenceDate = date?.startOf('day');

            const isValidWorkItemWithinTimePoint: boolean =
                isDateTimeValid(departureDay) &&
                departureDay.hasSame(referenceDate, 'day');

            return isValidWorkItemWithinTimePoint;
        };

        const filteredWorkItemsWithinTimePoint = valueDemandByActiveAggregation.filter(
            filterWorkItemsInSpecificTimePoint,
        );
        return [date.toISODate(), filteredWorkItemsWithinTimePoint];
    };

    const workitemsByAggregation = dates.map(buildRecordForDate);

    const calculatedPercentOfValueDemand: [
        string,
        number,
    ][] = workitemsByAggregation.map(
        (itemsPerAggregation: [string, StateItem[]]): [string, number] => {
            const [aggregationDateTime, workItems] = itemsPerAggregation;

            const amountOfQualityNormalised: {
                [normalisedName: string]: number;
            } = getAmountOfQualityNormalisedWorkItems(workItems);

            const percentOfValueDemand =
                calculatePercentOfValueDemand(
                    amountOfQualityNormalised?.['Value Demand'] || 0,
                    normalisedQualityWorkItems.length,
                ) || 0;

            return [aggregationDateTime, percentOfValueDemand];
        },
    );
    return calculatedPercentOfValueDemand;
}

function getWorkItemIds(workItems: StateItem[]): string[] {
    // get normalized work items within a dataset of completed work items
    const boundaryIds: string[] = workItems.reduce(
        (acc: string[], workItem: StateItem) => {
            if (workItem?.workItemId) {
                acc.push(workItem?.workItemId);
            }
            return acc;
        },
        [],
    );
    return uniq(boundaryIds);
}

// separate a list of work items by aggregation to calculate productivity within fitness criteria
export function getCompletedWorkItemsByWeek(
    aggregation: AggregationKey = 'week',
    completedWorkitems: StateItem[],
    dateRange?: Interval,
    clientTimezone?: string,
): RawCompletedItemByWeek[] {

    let beginDate = dateRange?.start;
    if (clientTimezone) {
        beginDate?.setZone(clientTimezone);
    }

    let endDate = dateRange?.end;
    if (clientTimezone) {
        endDate?.setZone(clientTimezone);
    }

    const areValidDates = beginDate?.isValid && endDate?.isValid;

    if (dateRange === undefined || !dateRange.isValid || !areValidDates) {
        return [];
    }

    //if the date range day is last day of week
    let useInterval = dateRange;


    if (dateRange.end.endOf('week').day !== dateRange.end.day) {
        useInterval = Interval.fromDateTimes(dateRange.start, dateRange.end.minus({days: 7}).endOf('week'));
    }

    // Create a array of time points that depends of the current aggregation
    const weekStartDatesInRange: DateTime[] = generateDateArray(useInterval, aggregation);
    
    const completedWorkItemsSortedByDepartureDate = chain(
        completedWorkitems.map((w: StateItem) => w),
    )
        .sortBy('departureDate')
        .value();

    type ItemFilter = (workItem: StateItem) => boolean;

    const buildRecordForWeek = (date: DateTime): RawCompletedItemByWeek => {
        date.setZone(clientTimezone!);

        // check the days that matches with the workItem depatureDays
        const filterIsSameWeek: ItemFilter = (
            workItem: StateItem,
        ) => {
            if (!workItem.departureDate) {
                return false;
            }

            const departureDay = DateTime.fromISO(workItem?.departureDate).setZone(clientTimezone!);
            const endOfWeekDate = date?.endOf('week');

            const isSameWeek = isDateTimeValid(departureDay) && departureDay?.hasSame(endOfWeekDate, 'week');

            return isSameWeek;
        };

        const itemsCompletedInSameWeek: StateItem[] = completedWorkItemsSortedByDepartureDate.filter(
            filterIsSameWeek,
        );

        const workItemsIds: { id: string }[] = [];
        itemsCompletedInSameWeek.forEach((w: StateItem) => {
            if (w?.workItemId) {
                workItemsIds.push({ id: w?.workItemId });
            }
        });

        return {
            weekEndingOn: date,
            workItems: workItemsIds,
        };
    };

    const recordsForDates = weekStartDatesInRange.map(buildRecordForWeek);

    const filtered = recordsForDates.filter(
        (weekInfo: RawCompletedItemByWeek) => weekInfo?.workItems?.length,
    );

    return filtered;
}
