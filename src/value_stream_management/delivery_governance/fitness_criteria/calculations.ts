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
} from '../../../throughput/calculations';
import { calculateRollingCoefficient, DEFAULT_ROLLING_VARIABILITY, getThroughputByCoefficient } from '../../../throughput/utils';
import { isDateLastDayOfWeek } from '../../../utils/date_utils';
import {
    getPercentile,
    getIsVariabilityHigh,
    roundToDecimalPlaces,
    HIGH_VARIABILITY_LIMIT,
} from '../../../utils/statistics';
import {
    ArrowColours,
    defaultColours,
    getTrendAnalysisContent,
    TrendAnalysisStructure,
    TrendDirection,
} from '../../../utils/trend_analysis';
import {
    ExtendedStateItem,
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
import {
    Calculations as FlowItemsCalculations,
} from '../../delivery_management/flow_items/calculations';
import { PredefinedWidgetTypes } from '../common/enum';
import { WidgetInformation, WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import _ from 'lodash';
import { ProjectStateItem } from '../../../workitem/WorkItemList';
import { ProductivityValue } from '../../../summary/handler';
import WorkItemTypeMapModel from '../../../models/WorkItemTypeMapModel';
import { momentBizDiff } from '../../../workitem/utils';
import {
    IndustryStandarCohorts,
    IndustryStandardPercentile,
    getIndustryStandardCustomerValue,
    getIndustryStandardFlowEfficiency,
    getIndustryStandardLeadTime,
    getIndustryStandardSLE
} from './industry_standard';

type WorkitemTypeWithServiceLevelPercent = {
    itemTypeName: string;
    itemTypeId: string;
    serviceLevelMetCount: number;
    serviceLevelCount: number;
};

type LeadTimeWeek = {
    week: number;
    leadtime: number;
};

export type RawCompletedItemByWeek = {
    weekEndingOn: DateTime;
    workItems: Array<{ id: string; }>;
};

export type ProductivityRawData = Array<RawCompletedItemByWeek>;

export type ValueDemandItemCount = {
    aggregationDateTime: string;
    valueDemandItems?: number;
    totalItems?: number;
};

export type StandardDefaultValue = {
    value: number;
    label: string;
    color: string;
};

export type ProductivityByAggregate = {
    aggregationDate: string;
    throughput: number;
    mean: number;
    stdev: number;
    productivityVal: number;
    productivityLabel: ProductivityLabels;
};

export type SpeedValues = {
    percentile85th: number;
    median: number;
    average: number;
    tail: number;
};

export type StandardDeviationValues = {
    bellowStd3: StandardDefaultValue;
    bellowStd2: StandardDefaultValue;
    bellowStd1: StandardDefaultValue;
    averageValue: StandardDefaultValue;
    aboveAverage1: StandardDefaultValue;
    aboveAverage2: StandardDefaultValue;
    aboveAverage3: StandardDefaultValue;
};

export const TrendColor = {
    upColour: 'GREEN',
    downColour: 'RED',
    stableColour: 'YELLOW',
    default: 'GRAY',
};

export enum ProductivityLabels {
    NO_WORK = "No work completed",
    TERRIBLE = "Terrible",
    BAD = "Bad",
    POOR = "Poor",
    SLIGHTLY_UNDER = "Slightly Under",
    AVERAGE = "Average",
    GOOD = "Good",
    GREAT = "Great",
    EXCELLENT = "Excellent",
    PHENOMENAL = "Phenomenal",
    INVALID = "Out of range"
}

type WorkItemTypeWithProjectId = WorkItemTypeItem & {
    projectId: string;
};

export class Calculations {
    readonly orgId: string;
    readonly logger: Logger;
    readonly state: IState;
    readonly filters: IQueryFilters;
    readonly aggregation: AggregationKey;
    private workItemType: IWorkItemType;
    readonly throughputCalculations: ThroughputCalculations;
    private normalisedQualityWorkItems?: StateItem[];
    readonly continuousImprovementsCalculations: ContinuousImprovementsCalculations;
    readonly flowItemsCalculations: FlowItemsCalculations;

    private completedWorkItemListCache: { [orgId: string]: Promise<StateItem[]> | StateItem[]; } = {};
    private SLEConfigItemsCache: { [orgId: string]: Promise<WorkItemTypeWithProjectId[]> | WorkItemTypeWithProjectId[]; } = {};

    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(opts: {
        security: SecurityContext;
        logger: Logger;
        state: IState;
        filters?: IQueryFilters;
        workItemType: IWorkItemType;
        throughputCalculations: ThroughputCalculations;
        snapshotQueries: ISnapshotQueries;
        continuousImprovementsCalculations: ContinuousImprovementsCalculations;
        flowItemsCalculations: FlowItemsCalculations;
        widgetInformationUtils: WidgetInformationUtils;
    }) {
        this.orgId = opts.security.organisation!;
        this.logger = opts.logger;
        this.state = opts.state;
        this.workItemType = opts.workItemType;
        this.throughputCalculations = opts.throughputCalculations;
        this.continuousImprovementsCalculations = opts.continuousImprovementsCalculations;
        this.flowItemsCalculations = opts.flowItemsCalculations;
        this.normalisedQualityWorkItems = undefined;
        this.widgetInformationUtils = opts.widgetInformationUtils;

        this.filters = opts.filters!;
        this.filters.setSafeAggregation();
        this.aggregation = this.filters.aggregation;
    }

    /**
     * Gets completed work items and also caches it for future calls
     */
    async getCachedCompletedWorkItemList() {
        if (this.completedWorkItemListCache[this.orgId] instanceof Promise) {
            return await this.completedWorkItemListCache[this.orgId];
        } else if (this.completedWorkItemListCache[this.orgId] instanceof Array) {
            return this.completedWorkItemListCache[this.orgId];
        }

        this.completedWorkItemListCache[this.orgId] = this.state.getWorkItems(
            this.orgId,
            StateCategory.COMPLETED,
            this.filters,
            undefined,//fql
            undefined,//column names
            undefined,//isDelayed
            undefined,//disabledDelayed
            undefined,//disabledDiscarded
        );

        this.completedWorkItemListCache[this.orgId] = await this.completedWorkItemListCache[this.orgId];

        return this.completedWorkItemListCache[this.orgId];
    }

    async getFormattedWorkItemTypes(): Promise<WorkItemTypeWithProjectId[]> {
        const workItemTypes = await this.workItemType.getTypes(this.orgId);
        const workItemTypeMapModel = await WorkItemTypeMapModel();
        const workItemTypeMaps = await workItemTypeMapModel.findAll({
            where: {
                orgId: this.orgId
            } as any
        });
        const array: WorkItemTypeWithProjectId[] = [];
        workItemTypeMaps.forEach(witm => {
            const wit = workItemTypes.find(wit => wit.id === witm.workItemTypeId);
            if (wit) {
                array.push({ ...wit, ...{ serviceLevelExpectationInDays: witm.serviceLevelExpectationInDays, projectId: witm.projectId } });
            }

        });
        return array;
    }

    /**
     * Gets all SLE config items and also caches it
     */
    async getSLEConfigItems(): Promise<WorkItemTypeWithProjectId[]> {
        if (this.SLEConfigItemsCache[this.orgId] instanceof Promise) {
            return await this.SLEConfigItemsCache[this.orgId];
        } else if (this.SLEConfigItemsCache[this.orgId]) {
            return this.SLEConfigItemsCache[this.orgId];
        }
        this.SLEConfigItemsCache[this.orgId] = this.getFormattedWorkItemTypes();
        this.SLEConfigItemsCache[this.orgId] = await this.SLEConfigItemsCache[this.orgId];
        return this.SLEConfigItemsCache[this.orgId];
    }

    getIndustryStandardMessage(value: number, industryStandardPercentileData: IndustryStandardPercentile[], metricLabel: string, invertPercentile: boolean = false) {
        let percentileValue = 0;
        for (let idx = 0; idx < industryStandardPercentileData.length; idx++) {
            const row = industryStandardPercentileData[idx];
            if (row.dataValue > value) {
                break;
            }
            percentileValue = row.percentileValue;
        }
        let percentileLabel = '';

        if (metricLabel === "Process Flow Efficiency") {
            return `You are <b>ahead of ${(100 - percentileValue).toString()}%</b> the industry for ${metricLabel}.`;
        }

        if (invertPercentile) {
            percentileLabel = percentileValue >= 50 ? `behind ${percentileValue.toString()}` : `ahead of ${(100 - percentileValue).toString()}`;
        } else {
            percentileLabel = percentileValue >= 50 ? `ahead of ${percentileValue.toString()}` : `behind ${(100 - percentileValue).toString()}`;
        }
        const message = `You are <b>${percentileLabel}%</b> the industry for ${metricLabel}.`;
        return message;
    }

    getIndustryCohortMessage(value: number, industryStandarCohortsData: IndustryStandarCohorts[], metricLabel: string, metricUnitLabel: string) {
        let label = '';
        for (let idx = 0; idx < industryStandarCohortsData.length; idx++) {
            const row = industryStandarCohortsData[idx];
            if (value <= row.endValue && value >= row.startValue) {
                label = row.label;
                break;
            }
        }
        const message = `Your ${metricLabel} of <b>${value}</b>${metricUnitLabel} matches with the industry's <b>${label}</b> cohort.`;
        return message;
    }

    /**
     * Get Delivery Speed for both Portfolio and Teams based on 85% for Fitness Criteria Accordion.
     * 
     * @example "Flow items are delivered in up to [...] days 85% of the time"
     * 
     * @returns Rounded number of the 85% percentile of the amount of days that the flow items are delivered.
     */
    async getSpeed() {
        const completedWorkItemList = await this.getCachedCompletedWorkItemList();

        const portfolio = await this.getSpeedLevelValues(
            completedWorkItemList.filter((item) => item?.flomatikaWorkItemTypeLevel === 'Portfolio')
        );

        const team = await this.getSpeedLevelValues(
            completedWorkItemList.filter((item) => item?.flomatikaWorkItemTypeLevel === 'Team')
        );

        const ic = await this.getSpeedLevelValues(
            completedWorkItemList.filter((item) => item?.flomatikaWorkItemTypeLevel === 'Individual Contributor')
        );

        // get historical chart view
        const historical = await this.get85thPercentileByAggregation(completedWorkItemList, this.aggregation);

        const {
            portfolioIndustryStandardPercentileData,
            portfolioIndustryStandarCohortsData,
            teamIndustryStandardPercetileData,
            teamIndustryStandardCohortsData,
        } = getIndustryStandardLeadTime();

        const teamMessage = team.percentile85th ? '<b>Team level items</b><br/>' + this.getIndustryCohortMessage(team.percentile85th, teamIndustryStandardCohortsData, "Lead Time", team.percentile85th > 1 ? " days" : " day")
            + "<br/><br/>" + this.getIndustryStandardMessage(team.percentile85th, teamIndustryStandardPercetileData, "Lead Time", true) : '';
        const portfolioMessage = portfolio.percentile85th ? '<b>Portfolio level items</b><br/>' + this.getIndustryCohortMessage(portfolio.percentile85th, portfolioIndustryStandarCohortsData, "Lead Time", portfolio.percentile85th > 1 ? " days" : " day")
            + "<br/><br/>" + this.getIndustryStandardMessage(portfolio.percentile85th, portfolioIndustryStandardPercentileData, "Lead Time", true) : '';

        return {
            portfolio,
            team,
            ic,

            portfolioPercentile85thChart: historical.portfolio85thPercentile,
            teamPercentile85thChart: historical.team85thPercentile,
            icPercentile85thChart: historical.ic85thPercentile,

            timeToCommit85thPercentileTeam: historical.timeToCommit85thPercentileTeam,
            timeToCommit85thPercentilePortfolio: historical.timeToCommit85thPercentilePortfolio,
            timeToCommit85thPercentileIC: historical.timeToCommit85thPercentileIC,

            industryStandardMessage: (portfolioMessage.length > 0 && teamMessage.length > 0) ? (portfolioMessage + '<br/><br/>' + teamMessage) : (portfolioMessage + teamMessage),
        };
    }
    /**
     * Get the service level expectation using the completed work items and SLE config items
     * 
     * @example Teams are meeting customer's service level expectation <service level> % of the time
     * @returns A percent number (up to 100) of how frequently are teams meeting customer service expectations
     */
    async getServiceLevelExpectation() {
        const [
            completedItemList,
            sleConfigItemList
        ] = await Promise.all([
            this.getCachedCompletedWorkItemList(),
            this.getSLEConfigItems()
        ]);

        // If there are no completed work items then there is no data to show
        if (completedItemList.length === 0) {
            return null;
        }

        const workItemsWithServiceLevelPercent: WorkitemTypeWithServiceLevelPercent[] = this.getLeadtimeByWorkItemTypeWithSLE(
            completedItemList,
            sleConfigItemList,
        );

        let targetMetValue = 0;
        for (const workItem of workItemsWithServiceLevelPercent) {
            targetMetValue += workItem.serviceLevelMetCount;
        }

        const average =
            targetMetValue === 0 || completedItemList.length === 0
                ? 0
                : (targetMetValue * 100) / completedItemList.length;

        const serviceLevelExpectation = Math.round(average);

        // get historical chart view
        const historical = await this.getTargetMetByAggregation(completedItemList, this.aggregation);

        let grade = 'F';
        if (serviceLevelExpectation >= 90) {
            grade = 'A +';
        }
        if (serviceLevelExpectation >= 85 && serviceLevelExpectation < 90) {
            grade = 'A';
        }
        if (serviceLevelExpectation >= 80 && serviceLevelExpectation < 85) {
            grade = 'A -';
        }
        if (serviceLevelExpectation >= 77 && serviceLevelExpectation < 80) {
            grade = 'B +';
        }
        if (serviceLevelExpectation >= 73 && serviceLevelExpectation < 77) {
            grade = 'B';
        }
        if (serviceLevelExpectation >= 70 && serviceLevelExpectation < 73) {
            grade = 'B -';
        }
        if (serviceLevelExpectation >= 65 && serviceLevelExpectation < 70) {
            grade = 'C +';
        }
        if (serviceLevelExpectation >= 60 && serviceLevelExpectation < 65) {
            grade = 'C';
        }
        if (serviceLevelExpectation >= 55 && serviceLevelExpectation < 60) {
            grade = 'C -';
        }
        if (serviceLevelExpectation >= 50 && serviceLevelExpectation < 55) {
            grade = 'D';
        }

        const {
            industryStandardPercentileData,
            industryStandarCohortsData
        } = getIndustryStandardSLE();

        const industryStandardMessage = serviceLevelExpectation ? this.getIndustryCohortMessage(serviceLevelExpectation, industryStandarCohortsData, "Fitness Level", "%")
            + "<br/><br/>" + this.getIndustryStandardMessage(serviceLevelExpectation, industryStandardPercentileData, "Fitness Level") : '';
        return {
            serviceLevelExpectation,
            grade,
            historical,
            industryStandardMessage
        };
    }

    async getPredictability() {
        const completedItemList = await this.getCachedCompletedWorkItemList();

        const leadTimeList = completedItemList.filter(
            item => item.leadTimeInWholeDays != undefined
        ).map(
            item => item.leadTimeInWholeDays as number
        );
        const percentile98th = getPercentile(98, leadTimeList);
        const percentile50th = getPercentile(50, leadTimeList);

        // This is inverted as getDistributionShape on src\utils\statistics.ts is also inverted
        const leadtime = getIsVariabilityHigh(percentile50th, percentile98th) ? 'Low' : 'High';

        // get throughput values per week (by default) for the KPI view
        const throughputValuesPerWeek = await this.getThroughputPerWeek(
            completedItemList,
            "week"
        );

        // get throughput variability by coefficient for KPI view
        const throughput = getThroughputByCoefficient(throughputValuesPerWeek.map((item) => item[1]));

        // get lead time historical chart view 
        const leadTimeHistorical = await this.getLeadTimePredictabilityByAggregation(
            completedItemList,
            this.aggregation
        );

        // get throughput historical chart view 
        const throughputHistorical = await this.getThroughputByAggregation(
            completedItemList,
            this.aggregation
        );

        return {
            leadtime,
            throughput,
            leadTimeHistorical,
            throughputHistorical
        };
    }

    async getProductivity(): Promise<{
        mean: number;
        current: number;
        lastWeek: number;
        trendAnalysis: TrendAnalysisStructure;
        productivityLabel: string;
        productivityColor: string;
        lastProductivityResult: ProductivityByAggregate[];
        historical: [string, number, string][];
    }> {
        const completedItemList = await this.getCachedCompletedWorkItemList();

        // get all items completed in the previous completed weeks
        // completedItemsByWeek result structure : [0] Aggregated Date, [1] Throughput values, [2] Productivity Label/Variability */
        const completedItemsByWeek: ProductivityByAggregate[] = await this.getProductivityByAggregation(
            completedItemList,
            "week"
        );

        // calculate the mean and stdv of the set and compare
        // discard items in the current week
        const productivityByWeek = calculateProductivityByMeanAndStdv(
            completedItemsByWeek.map((item) => [item.aggregationDate, item.throughput]));

        // get mean of all throughput in the set
        const mean = this.calculateMean(completedItemsByWeek.map((item) => item.throughput));

        // compare the last 4 completed weeks (last 2 completed weeks and the previous two weeks before that)
        const trendAnalysis = this.getTrendOfLastCompletedWeeks(completedItemsByWeek.map((item) => item.throughput));

        // get current and last throughput of  week
        const lastWeekThroughput = completedItemsByWeek?.slice(-1)?.[0].throughput;
        const currentThroughput = productivityByWeek.slice(-1)?.[0].throughput;

        // get last completed week's productivity and color
        const productivityLabel = productivityByWeek.slice(-1)?.[0].productivityLabel;
        const productivityColor = getProductivityColor(productivityLabel);

        // get productivity historical chart view 
        const historical = parseHistorical(await this.getProductivityByAggregation(
            completedItemList,
            this.aggregation
        ));

        // for testing purposes, show last result in the response
        const lastProductivityResult = productivityByWeek.slice(-1);

        return {
            productivityLabel,
            mean,
            current: currentThroughput,
            lastWeek: lastWeekThroughput,
            trendAnalysis,
            productivityColor,
            lastProductivityResult,
            historical,
        };
    }

    async getCustomerValue() {
        const completedItemList = await this.getCachedCompletedWorkItemList();

        // If there are no completed work items then there is no data to show
        if (completedItemList.length === 0) {
            return {
                customerValueWorkPercentage: null,
            };
        }

        const uniqWorkItemIds = getWorkItemIds(completedItemList);

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
        const customerValueWorkPercentageRaw = calculatePercentOfValueDemand(
            amountByNormalised?.['Value Demand'] || 0,
            valueDemandNormalisedItems.length,
        );

        const customerValueWorkPercentage = parseFloat(customerValueWorkPercentageRaw.toFixed(2));

        const historical = await this.getValueDemandByAggregation(
            completedItemList,
            valueDemandNormalisedItems,
            this.aggregation
        );
        const {
            industryStandardPercentileData,
            industryStandarCohortsData
        } = getIndustryStandardCustomerValue();

        const industryStandardMessage = customerValueWorkPercentage ? this.getIndustryCohortMessage(customerValueWorkPercentage, industryStandarCohortsData, "Process Value", "%")
            + "<br/><br/>" + this.getIndustryStandardMessage(customerValueWorkPercentage, industryStandardPercentileData, "Process Value") : '';
        return {
            customerValueWorkPercentage,
            historical,
            industryStandardMessage
        };
    }

    async getFlowEfficiency() {
        const {
            activeTime,
            waitingTime,
        } = await this.continuousImprovementsCalculations.getFlowEfficiencyDonutData(
            'exclude',
            'completed',
        );

        const averageOfWaitingTime = calculatePercentOfFlowEfficiency(activeTime, waitingTime);

        // get historical view
        const interval = await this.filters.datePeriod();

        const {
            industryStandardPercentileData,
            industryStandarCohortsData
        } = getIndustryStandardFlowEfficiency();

        const industryStandardMessage = averageOfWaitingTime ? this.getIndustryCohortMessage(averageOfWaitingTime, industryStandarCohortsData, "Process Flow Efficiency", "%")
            + "<br/><br/>" + this.getIndustryStandardMessage(averageOfWaitingTime, industryStandardPercentileData, "Process Flow Efficiency") : '';
        return {
            averageOfWaitingTime,
            industryStandardMessage
        };
    }
    async getFlowEfficiencyOverTime() {
        // get historical view
        const interval = await this.filters.datePeriod();
        const historicalResult = await this.continuousImprovementsCalculations.calculateFlowEfficiencyOverTime(
            'exclude',
            'completed',
            this.aggregation,
            interval
        );
        const historical = historicalResult.map(i => {
            return [formatDate(DateTime.fromISO(i.startDate), this.aggregation), calculatePercentOfFlowEfficiency(i.activeCount, i.waitingCount)];
        });

        return historical;
    }

    async getWidgetInformation(): Promise<{
        speed?: WidgetInformation[];
        serviceLevelExpectation?: WidgetInformation[];
        predictability?: WidgetInformation[];
        productivity?: WidgetInformation[];
        customerValue?: WidgetInformation[];
        flowEfficiency?: WidgetInformation[];
    }> {
        const speed = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.LEADTIME);
        const serviceLevelExpectation = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.SERVICELEVEL);
        const predictability = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.PREDICTABILITY);
        const productivity = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.DELIVERYRATE);
        const customerValue = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.VALUEDELIVERED);
        const flowEfficiency = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.FLOWEFFICIENCY);


        return {
            speed,
            serviceLevelExpectation,
            predictability,
            productivity,
            customerValue,
            flowEfficiency
        };
    }

    calculateLeadTimePercentile(completedWorkItems: StateItem[], percentile: number): number {
        const leadTimes = this.getLeadTimes(completedWorkItems);
        return Math.round(getPercentile(percentile, leadTimes));
    }

    calculateMean(values: number[]): number {
        return Math.round(mean(values));
    }

    getLeadTimes(completedWorkItems: StateItem[]): Array<number> {
        return completedWorkItems
            .filter((item) => item.leadTimeInWholeDays != undefined)
            .map((item) => item.leadTimeInWholeDays!);
    }

    getSpeedLevelValues(completedWorkItems: StateItem[]): SpeedValues {
        const leadTimes = this.getLeadTimes(completedWorkItems);

        if (leadTimes.length === 0 || leadTimes === undefined) {
            return {
                percentile85th: 0,
                median: 0,
                average: 0,
                tail: 0,
            };
        }

        const percentile85th = this.calculateLeadTimePercentile(
            completedWorkItems,
            85
        );

        const medianValue = Math.round(median(leadTimes)) || 0;

        const average = Math.round(mean(leadTimes)) || 0;

        const tail = this.calculateLeadTimePercentile(
            completedWorkItems,
            98
        ) || 0;

        return {
            percentile85th,
            median: medianValue,
            average,
            tail
        };
    }

    getTrendOfLastCompletedWeeks(
        throughputValues: number[]
    ): TrendAnalysisStructure {

        let colours: ArrowColours = defaultColours;

        // get last 4 weeks
        const lastFourThroughputs = throughputValues.slice(-4);

        // penultimate : last two throughput
        let penultimateSum = throughputValues.length >= 4 ?
            lastFourThroughputs.slice(-2).reduce((acc, val) => acc + val) || 0 :
            lastFourThroughputs.slice(-1).reduce((acc, val) => acc + val) || 0;

        // antepenultimate : two throughput values before the penultimate
        let antepenultimateSum = throughputValues.length >= 4 ?
            lastFourThroughputs.slice(0, 2).reduce((acc, val) => acc + val) || 0 :
            lastFourThroughputs.slice(0, 1).reduce((acc, val) => acc + val) || 0;

        const trendDirections = {
            increase: {
                text: 'more',
                arrowDirection: TrendDirection.UP,
                arrowColour: colours.upColour.toUpperCase(),
            },
            decrease: {
                text: 'less',
                arrowDirection: TrendDirection.DOWN,
                arrowColour: colours.downColour.toUpperCase(),
            },
            stable: {
                text: 'same',
                arrowDirection: TrendDirection.STABLE,
                arrowColour: colours.stableColour.toUpperCase(),
            },
        };

        const percentage = ((penultimateSum - antepenultimateSum) / antepenultimateSum) * 100;
        let selectedResultKey: keyof typeof trendDirections;
        if (penultimateSum > antepenultimateSum)
            selectedResultKey = 'increase';
        else if (penultimateSum < antepenultimateSum)
            selectedResultKey = 'decrease';
        else selectedResultKey = 'stable';

        const selectedTrend = trendDirections[selectedResultKey];

        return {
            percentage,
            ...selectedTrend
        };
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
        allSLEConfigItems: WorkItemTypeWithProjectId[],
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

    async get85thPercentileByAggregation(
        completedWorkItems: StateItem[],
        aggregation: AggregationKey,
    ) {
        return await this.calculate85thPercentileByAggregation(
            completedWorkItems,
            aggregation,
            this.filters,
        );
    }

    async getTargetMetByAggregation(
        completedWorkItems: StateItem[],
        aggregation: AggregationKey,
    ): Promise<[string, number][]> {
        return await this.calculateTargetMetByAggregation(
            completedWorkItems,
            aggregation,
            this.filters,
        );
    }

    async getLeadTimePredictabilityByAggregation(
        completedWorkItems: StateItem[],
        aggregation: AggregationKey,
    ): Promise<[string, string][]> {
        return await this.calculateLeadTimeByAggregation(
            completedWorkItems,
            aggregation,
            this.filters,
        );
    }

    async getThroughputPerWeek(
        completedWorkItems: StateItem[],
        aggregation: AggregationKey,
    ): Promise<[string, number][]> {
        return await this.calculateThroughputValues(
            completedWorkItems,
            aggregation,
            this.filters,
            false
        );
    }

    async getThroughputByAggregation(
        completedWorkItems: StateItem[],
        aggregation: AggregationKey,
    ): Promise<[string, string][]> {
        return await this.calculateThroughputByAggregation(
            completedWorkItems,
            aggregation,
            this.filters,
        );
    }

    async getProductivityByAggregation(
        completedWorkItems: StateItem[],
        aggregation: AggregationKey,
    ): Promise<ProductivityByAggregate[]> {
        return await this.calculateProductivityByAggregation(
            completedWorkItems,
            aggregation,
            this.filters,
        );
    }

    async getValueDemandByAggregation(
        completedWorkItems: StateItem[],
        normalisedQualityWorkItems: StateItem[],
        aggregation: AggregationKey,
    ): Promise<[string, number][]> {
        return await this.calculateValueDemandByAggregation(
            completedWorkItems,
            normalisedQualityWorkItems,
            aggregation,
            this.filters,
        );
    }

    async getActiveTimeByAggregation(
        aggregation: AggregationKey,
    ) {
        const completedWorkItems = await this.flowItemsCalculations.getWorkItemList("past");

        return await this.calculateActiveTimeByAggregation(
            completedWorkItems,
            aggregation,
            this.filters,
        );
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


    /**
     * The following section contains functions for getting
     * aggregations for fitness criteria - historical view chart
     */

    async getCompletedWorkItemByAggregation(
        workItems: ExtendedStateItem[],
        aggregation: AggregationKey = 'week',
        filters?: IQueryFilters,
        excludeLastWeekIfIncomplete: boolean = true
    ): Promise<[DateTime, StateItem[]][]> {

        const dateRange = await filters?.datePeriod();

        const beginDate = dateRange?.start;
        const endDate = dateRange?.end;
        const areValidDates = beginDate?.isValid && endDate?.isValid;

        if (dateRange === undefined || !dateRange.isValid || !areValidDates) {
            return [];
        }

        // Create an array of time points that depends of the current aggregation
        const dates: DateTime[] = generateDateArray(dateRange, aggregation);

        // Adjusts Work Item Dates by Aggregation
        const aggregationDateAdjuster = getWorkItemDateAdjuster(aggregation);
        const uniqueWorkItems: StateItem[] = chain(workItems || [])
            .uniqBy('workItemId')
            .value();

        const setAggregateByDepartureDate = chain(uniqueWorkItems.map(aggregationDateAdjuster))
            .sortBy('departureDate')
            .value();

        type ItemFilter = (workItem: StateItem) => boolean;

        // Establish Count for Each Date
        const buildRecordForDate = (date: DateTime): [DateTime, StateItem[]] => {
            // check the days that matches with the workItem depatureDays
            const filterWorkItemsInSpecificTimePoint: ItemFilter = (
                workItem: StateItem,
            ) => {
                if (!workItem.departureDate) {
                    return false;
                }
                const departureDay = workItem.departureDateTime;

                const referenceDate = date;

                const isValidWorkItemWithinTimePoint: boolean =
                    isDateTimeValid(departureDay) &&
                    departureDay.year === referenceDate.year
                    && departureDay.month === referenceDate.month
                    && departureDay.day === referenceDate.day;


                return isValidWorkItemWithinTimePoint;
            };

            const filteredWorkItemsWithinTimePoint = setAggregateByDepartureDate.filter(
                filterWorkItemsInSpecificTimePoint,
            );

            return [date, filteredWorkItemsWithinTimePoint];
        };

        const completedItemsGrouped = dates.map(buildRecordForDate);

        if (aggregation === "week" && excludeLastWeekIfIncomplete) {
            //only consider whole weeks
            const lastGroupedWeek = completedItemsGrouped?.slice(-1)?.[0];

            const isSelectedEndDateLastDayOfWeek = isDateLastDayOfWeek(lastGroupedWeek[0]);

            if (!isSelectedEndDateLastDayOfWeek) {
                //if this is not a complete whole week, exclude it
                completedItemsGrouped.pop();
            }
        }

        return completedItemsGrouped;
    }

    private computeTimeToCommit(w: StateItem, excludeWeekends: boolean) {
        let timeToCommit = 0;
        if (w.commitmentDateTime && w.arrivalDateTime) {
            if (excludeWeekends) {
                timeToCommit = momentBizDiff(w.arrivalDateTime, w.commitmentDateTime,);
            } else {
                timeToCommit = w.commitmentDateTime.diff(w.arrivalDateTime, 'hours').hours / 24;
            }
        }

        return Math.round(timeToCommit);
    }

    private calculate85thPercentileByAggregationForLevel(itemsPerAggregation: [DateTime, StateItem[]], aggregation: AggregationKey, level: string): [string, any] {
        const [aggregationDateTime, workItems] = itemsPerAggregation;

        const n = Math.round(getPercentile(
            85,
            workItems
                .filter((w) => w.flomatikaWorkItemTypeLevel === level)
                .map((w: StateItem) => w?.leadTimeInWholeDays || 0
                ),
        )) || null;

        return [formatDate(aggregationDateTime, aggregation), n];
    }

    private computeTTCForLevel(
        itemsPerAggregation: [DateTime, StateItem[]],
        aggregation: AggregationKey,
        level: "Portfolio" | "Team" | "Individual Contributor",
        excludeWeekends: boolean
    ): [string, any] {
        const [aggregationDateTime, workItems] = itemsPerAggregation;


        const timeToCommit = Math.round(getPercentile(
            85,
            workItems
                .filter((w) => w.flomatikaWorkItemTypeLevel === level)
                .map((w: StateItem) => this.computeTimeToCommit(w, !!excludeWeekends)),
        )) || null;

        return [formatDate(aggregationDateTime, aggregation), timeToCommit];
    };

    // Get historical view for Speed
    async calculate85thPercentileByAggregation(
        workItems: StateItem[],
        aggregation: AggregationKey = 'week',
        filters?: IQueryFilters,
    ): Promise<{
        portfolio85thPercentile: any[];
        team85thPercentile: any[];
        ic85thPercentile: any[];
        timeToCommit85thPercentileTeam: any[];
        timeToCommit85thPercentilePortfolio: any[];
        timeToCommit85thPercentileIC: any[];
    }> {

        const workItemsByAggregation = await this.getCompletedWorkItemByAggregation(workItems, aggregation, filters, false);
        const excludeWeekends = await filters?.getExcludeWeekendsSetting(this.orgId);

        const calculatedPortfolio85thPercentile = workItemsByAggregation.map(itemsPerAggregation =>
            this.calculate85thPercentileByAggregationForLevel(itemsPerAggregation, aggregation, 'Portfolio')
        );

        const calculatedTeam85thPercentile = workItemsByAggregation.map(itemsPerAggregation =>
            this.calculate85thPercentileByAggregationForLevel(itemsPerAggregation, aggregation, 'Team')
        );

        const calculatedIC85thPercentile = workItemsByAggregation
            .map(itemsPerAggregation =>
                this.calculate85thPercentileByAggregationForLevel(itemsPerAggregation, aggregation, 'Individual Contributor')
            );



        const timeToCommit85thPercentileTeam = workItemsByAggregation
            .map(itemsPerAggregation => this.computeTTCForLevel(
                itemsPerAggregation,
                aggregation,
                "Team",
                !!excludeWeekends
            ));

        const timeToCommit85thPercentilePortfolio = workItemsByAggregation
            .map(itemsPerAggregation => this.computeTTCForLevel(
                itemsPerAggregation,
                aggregation,
                "Portfolio",
                !!excludeWeekends
            ));

        const timeToCommit85thPercentileIC = workItemsByAggregation
            .map(itemsPerAggregation => this.computeTTCForLevel(
                itemsPerAggregation,
                aggregation,
                "Individual Contributor",
                !!excludeWeekends
            ));

        return {
            portfolio85thPercentile: calculatedPortfolio85thPercentile,
            team85thPercentile: calculatedTeam85thPercentile,
            ic85thPercentile: calculatedIC85thPercentile,
            timeToCommit85thPercentileTeam,
            timeToCommit85thPercentilePortfolio,
            timeToCommit85thPercentileIC,
        };
    }

    // Get historical view for Predictability
    async calculateTargetMetByAggregation(
        workItems: StateItem[],
        aggregation: AggregationKey = 'week',
        filters?: IQueryFilters,
    ): Promise<[string, number][]> {

        const workItemsByAggregation = await this.getCompletedWorkItemByAggregation(workItems, aggregation, filters, false);
        const allSLEConfigItems = await this.getSLEConfigItems();

        const calculatedTargetMetChart: [
            string,
            any,
        ][] = workItemsByAggregation.map(
            (itemsPerAggregation: [DateTime, StateItem[]]): [string, any] => {
                const [aggregationDateTime, workItems] = itemsPerAggregation;

                // calculate each SLE by each workItemType
                const calculatedWorkItemsWithSLE = this.getLeadtimeByWorkItemTypeWithSLE(
                    workItems,
                    allSLEConfigItems,
                );

                const targetMetChart = sumTargetMetOfAllWorkItemTypes(calculatedWorkItemsWithSLE);

                return [
                    formatDate(aggregationDateTime, aggregation),
                    targetMetChart
                ];
            },
        );

        return calculatedTargetMetChart;
    };

    // Get historical view for Lead Time Predictability
    async calculateLeadTimeByAggregation(
        workItems: StateItem[],
        aggregation: AggregationKey = 'week',
        filters?: IQueryFilters,
    ): Promise<[string, string][]> {

        const workItemsByAggregation = await this.getCompletedWorkItemByAggregation(workItems, aggregation, filters, false);

        const calculatedPredictability: [
            string,
            string,
        ][] = workItemsByAggregation.map(
            (itemsPerAggregation: [DateTime, StateItem[]]): [string, string] => {
                const [aggregationDateTime, workItems] = itemsPerAggregation;

                const percentile98th = getPercentile(
                    98,
                    workItems.map(
                        (w: StateItem) => w?.leadTimeInWholeDays || 0
                    ),
                ) || 0;

                const percentile50th = getPercentile(
                    50,
                    workItems.map(
                        (w: StateItem) => w?.leadTimeInWholeDays || 0
                    ),
                ) || 0;

                const leadTimeValue = (round(percentile98th) / round(percentile50th)) || 0;

                // If leadTimeValue <= 5.6 then HIGH else LOW
                let variability = "";
                if (leadTimeValue !== 0)
                    variability = leadTimeValue <= HIGH_VARIABILITY_LIMIT ? "High" : "Low";

                return [formatDate(aggregationDateTime, aggregation), variability];
            },
        );

        return calculatedPredictability;
    };

    // Get Throughput aggregate for KPI view
    async calculateThroughputValues(
        workItems: StateItem[],
        aggregation: AggregationKey = 'week',
        filters?: IQueryFilters,
        excludeLastWeekIfIncomplete: boolean = true
    ): Promise<[string, number][]> {

        const workItemsByAggregation = await this.getCompletedWorkItemByAggregation(workItems, aggregation, filters, excludeLastWeekIfIncomplete);

        const calculatedThroughput: [
            string,
            number
        ][] = workItemsByAggregation.map(
            (itemsPerAggregation: [DateTime, StateItem[]]): [string, number] => {
                const [aggregationDateTime, workItems] = itemsPerAggregation;

                const throughputCount = workItems.length || 0;

                return [formatDate(aggregationDateTime, aggregation), throughputCount];
            },
        );

        return calculatedThroughput;
    };

    // Get historical view for Throughput Predictability
    async calculateThroughputByAggregation(
        workItems: StateItem[],
        aggregation: AggregationKey = 'week',
        filters?: IQueryFilters,
    ): Promise<[string, string][]> {

        let variability = "";
        const calculatedThroughput = await this.calculateThroughputValues(workItems, aggregation, filters, false);

        // get rolling coefficient by mean and standard deviation
        const rollingCoefficient = calculateRollingCoefficient(calculatedThroughput);

        // if rolling coefficient <= 0.4 then HIGH else LOW
        const calculatedVariability: [
            string,
            string
        ][] = rollingCoefficient.map((item, index) => {
            variability = "";
            // The value for the first aggregation cannot be calculated since std variation cannot be calculated for one value.
            if (index === 0) return [item[0], variability];
            if (!isNaN(item[1]))
                variability = item[1] <= DEFAULT_ROLLING_VARIABILITY ? "High" : "Low";

            return [item[0], variability];
        });

        return calculatedVariability;
    };

    // Get historical view for Productivity
    async calculateProductivityByAggregation(
        workItems: StateItem[],
        aggregation: AggregationKey = 'week',
        filters?: IQueryFilters,
    ): Promise<ProductivityByAggregate[]> {

        const calculatedThroughput = await this.calculateThroughputValues(
            workItems, aggregation, filters, true
        );

        const calculatedVariability = calculateProductivityByMeanAndStdv(
            calculatedThroughput
        );

        return calculatedVariability;
    };

    // Get historical view for Customer Value
    async calculateValueDemandByAggregation(
        completedWorkItems: StateItem[],
        normalisedQualityWorkItems: StateItem[],
        aggregation: AggregationKey = 'week',
        filters?: IQueryFilters,
    ): Promise<[string, number][]> {
        const workItemsByAggregation = await this.getCompletedWorkItemByAggregation(completedWorkItems, aggregation, filters, true);
        const normalisedWorkItemsByAggregation = await this.getCompletedWorkItemByAggregation(normalisedQualityWorkItems, aggregation, filters, true);

        const prepCompletedWorkItems: ValueDemandItemCount[] = workItemsByAggregation.map(
            (itemsPerAggregation: [DateTime, StateItem[]]): ValueDemandItemCount => {

                const [aggregationDateTime, workItems] = itemsPerAggregation;
                return {
                    aggregationDateTime: formatDate(aggregationDateTime, aggregation),
                    totalItems: workItems.length
                };
            },
        );

        const prepNormalisedWorkItems: ValueDemandItemCount[] = normalisedWorkItemsByAggregation.map(
            (itemsPerAggregation: [DateTime, StateItem[]]): ValueDemandItemCount => {

                const [aggregationDateTime, normalised] = itemsPerAggregation;
                const amountOfQualityNormalised: {
                    [normalisedName: string]: number;
                } = getAmountOfQualityNormalisedWorkItems(normalised);

                return {
                    aggregationDateTime: formatDate(aggregationDateTime, aggregation),
                    valueDemandItems: amountOfQualityNormalised?.['Value Demand']
                };
            },
        );

        // Merge the two results
        const mergedWorkItemResult = _.merge(prepNormalisedWorkItems, prepCompletedWorkItems);

        const calculatedPercentOfValueDemand: [
            string,
            any,
        ][] = mergedWorkItemResult.map((item) => {
            let percentOfValueDemand: any = null;

            if (item.totalItems === 0)
                percentOfValueDemand = null;
            else {
                percentOfValueDemand =
                    calculatePercentOfValueDemand(
                        item.valueDemandItems || 0,
                        item.totalItems || 0,
                    ) || 0;
            }

            return [item.aggregationDateTime, percentOfValueDemand];
        });

        return calculatedPercentOfValueDemand;
    };

    // Get historical view for Flow Efficiency
    async calculateActiveTimeByAggregation(
        workItems: ProjectStateItem[],
        aggregation: AggregationKey = 'week',
        filters?: IQueryFilters,
    ) {

        const extendedWorkItems: ExtendedStateItem[] = [];
        workItems.forEach((item) => {
            extendedWorkItems.push({
                workItemId: item.workItemId,
                departureDate: item?.departureDate,
                activeTime: item?.activeTime || 0,
                waitingTime: item.waitingTime || 0,
                arrivalDateTime: item?.arrivalDateTime,
                departureDateTime: item?.departureDateTime,
                commitmentDateTime: item.commitmentDateTime,
            });
        });

        const workItemsByAggregation = await this.getCompletedWorkItemByAggregation(extendedWorkItems, aggregation, filters);

        const calculatedPercentOfFlowEfficiency: [
            string,
            number,
        ][] = workItemsByAggregation.map(
            (itemsPerAggregation: [DateTime, ExtendedStateItem[]]): [string, number] => {
                const [aggregationDateTime, workItems] = itemsPerAggregation;

                const active = workItems.map(
                    (w: ExtendedStateItem) => w?.activeTime || 0
                ) || 0;

                const waiting = workItems.map(
                    (w: ExtendedStateItem) => w?.waitingTime || 0
                ) || 0;

                const percentFlowEfficiency = Math.round(active[0] / (active[0] + waiting[0]) * 100);

                return [formatDate(aggregationDateTime, aggregation), percentFlowEfficiency];
            },
        );

        return calculatedPercentOfFlowEfficiency;
    }
    // End
}

function calculateProductivityByMeanAndStdv(
    throughputValues: [string, number][]
): ProductivityByAggregate[] {

    const calculatedMean = Math.round(mean(throughputValues.map((item) => item[1])));
    const calculatedStandardDeviation = Math.round(std(throughputValues.map((item) => item[1])));

    const calculatedProductivity: ProductivityByAggregate[] = throughputValues.map((item) => {
        let productivity;
        let throughput = item[1];

        productivity = getProductivityLabel(
            calculatedStandardDeviation || 0,
            calculatedMean || 0,
            throughput || 0
        ) || "";

        return {
            aggregationDate: item[0],
            throughput: item[1],
            mean: calculatedMean,
            stdev: calculatedStandardDeviation,
            productivityVal: productivity[1],
            productivityLabel: productivity[0]
        };
    });

    return calculatedProductivity;
}

function getProductivityLabel(
    stdv: number,
    mean: number,
    throughput: number
): [ProductivityLabels, number] {

    if (throughput === 0)
        return [ProductivityLabels.NO_WORK, 0];
    if (throughput < (mean - (3 * stdv)))
        return [ProductivityLabels.TERRIBLE, 1];
    if ((throughput < (mean - (2 * stdv))) && (throughput >= (mean - (3 * stdv))))
        return [ProductivityLabels.BAD, 2];
    if ((throughput < (mean - (1 * stdv))) && (throughput >= (mean - (2 * stdv))))
        return [ProductivityLabels.POOR, 3];
    if ((throughput < mean) && (throughput >= (mean - (1 * stdv))))
        return [ProductivityLabels.SLIGHTLY_UNDER, 4];
    if ((throughput === mean) || ((throughput >= mean) && (throughput < (mean + (1 * stdv)))))
        return [ProductivityLabels.AVERAGE, 5];
    if ((throughput >= (mean + (1 * stdv))) && (throughput < (mean + (2 * stdv))))
        return [ProductivityLabels.GOOD, 6];
    if ((throughput >= (mean + (2 * stdv))) && (throughput < (mean + (3 * stdv))))
        return [ProductivityLabels.GREAT, 7];
    if ((throughput >= (mean + (3 * stdv))) && (throughput < (mean + (4 * stdv))))
        return [ProductivityLabels.EXCELLENT, 8];
    if (throughput >= (mean + (4 * stdv)))
        return [ProductivityLabels.PHENOMENAL, 9];

    return [ProductivityLabels.INVALID, -1];
}

function getProductivityColor(
    productivityLabel: ProductivityLabels
): string {
    switch (productivityLabel) {
        case ProductivityLabels.NO_WORK:
            return TrendColor.downColour;
        case ProductivityLabels.TERRIBLE:
            return TrendColor.downColour;
        case ProductivityLabels.BAD:
            return TrendColor.downColour;
        case ProductivityLabels.POOR:
            return TrendColor.downColour;
        case ProductivityLabels.SLIGHTLY_UNDER:
            return TrendColor.stableColour;
        case ProductivityLabels.AVERAGE:
            return TrendColor.stableColour;
        case ProductivityLabels.GOOD:
            return TrendColor.stableColour;
        case ProductivityLabels.GREAT:
            return TrendColor.upColour;
        case ProductivityLabels.EXCELLENT:
            return TrendColor.upColour;
        case ProductivityLabels.PHENOMENAL:
            return TrendColor.upColour;
        default:
            return TrendColor.default;
    }
}

function formatDate(
    aggregationDate: DateTime,
    aggregation: AggregationKey
) {
    switch (aggregation) {
        case 'month':
            return aggregationDate.toFormat("MMM yyyy");
        case 'quarter':
            return aggregationDate.toFormat("Qq yyyy");
        case 'year':
            return aggregationDate.toFormat("yyyy");
        default:
            return aggregationDate.toFormat("MMM-dd yyyy");
    }
}

function parseHistorical(
    historical: ProductivityByAggregate[],
) {
    const parsedResult: [
        string,
        number,
        string
    ][] = historical.map((item) => {
        return [
            item.aggregationDate,
            item.throughput,
            item.productivityLabel
        ];
    });

    return parsedResult;
}


/**
 *  sumTargetMetOfAllWorkItemTypes
 *  -sum all serviceLevelPercent by each workItemType and get the total
 *  -divide the total by 10 to tranform in a decimal, multiply by 100 to get percent
 *
 **/
function sumTargetMetOfAllWorkItemTypes(
    workItemsWithServiceLevelPercent: WorkitemTypeWithServiceLevelPercent[],
): any {

    const sumOfTargetMetOfAllWorkItemTypes = workItemsWithServiceLevelPercent
        .reduce((acc, item) => acc + item.serviceLevelMetCount, 0);
    const sumOfAllWorkItemTypes = workItemsWithServiceLevelPercent
        .reduce((acc, item) => acc + item.serviceLevelCount, 0);

    const percentageOfAllServiceLevel = (sumOfTargetMetOfAllWorkItemTypes / sumOfAllWorkItemTypes) * 100;

    return isNaN(percentageOfAllServiceLevel) ? null : Math.round(percentageOfAllServiceLevel) || 0;
}

function sortLeadTimePerWeek(workItems: StateItem[]): StateItem[] {
    return workItems.sort(
        (a: { [index: string]: any; }, b: { [index: string]: any; }) => {
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
    projectId: string
): StateItem[] {
    return rawLeadTimesPerWeek.filter(
        (item: { flomatikaWorkItemTypeId?: string; projectId?: string; }) =>
            item?.flomatikaWorkItemTypeId === itemTypeId && (projectId === 'NOT_APPLICABLE' || item?.projectId === projectId)
    );
}

function getFormattedLeadTimeWithWeek(
    workItems: StateItem[],
): { week: number; leadtime: number; }[] {
    return workItems.map((item: StateItem) => {
        return {
            week: DateTime.fromISO(item.departureDate!)?.weekNumber,
            leadtime: item?.leadTimeInWholeDays || 0,
        };
    });
}

function getSleFilteredByWorkItem(
    sleConfigItems: WorkItemTypeWithProjectId[],
    workItemTypes: string[],
): WorkItemTypeWithProjectId[] {
    return sleConfigItems.filter((item: { id: string; }) =>
        workItemTypes.includes(item.id),
    );
}

function getAchievedLeadtime(
    leadtimePerweekList: LeadTimeWeek[],
    sleConfigItem: WorkItemTypeItem,
) {
    return (leadtimePerweekList || [])
        .map((item: { leadtime: number; }) => item.leadtime)
        .filter(
            (leadtime) =>
                leadtime <= sleConfigItem.serviceLevelExpectationInDays!,
        );
}

function getLeadTimePerWeek(
    leadtimePerweekList: LeadTimeWeek[],
) {
    return (leadtimePerweekList || [])
        .map((item: { leadtime: number; }) => item.leadtime)
        .filter(
            (leadtime) =>
                leadtime != 0,
        );
}

// function getCalculatedTargetMet(
//     formattedRawLeadtime: LeadTimeWeek[],
//     itemType: WorkItemTypeItem,
// ): number {
//     let targetMet = 0;
//     if (formattedRawLeadtime.length > 0) {
//         // count of all achieved
//         const achievedLength: number = getAchievedLeadtime(
//             formattedRawLeadtime,
//             itemType,
//         ).length;
//         // calculate target ratio of (count of achieved / count of all weeks)
//         targetMet = roundToDecimalPlaces(
//             achievedLength / formattedRawLeadtime.length,
//             2,
//         );
//     }
//     return targetMet;
// }

function calculateSLEPerWorkItem(
    allSLEConfigItems: WorkItemTypeWithProjectId[],
    completedItems: StateItem[],
): {
    workItemsWithServiceLevelPercent: WorkitemTypeWithServiceLevelPercent[];
    itemTypeReturned: string[];
} {
    // all sorted by departureDate
    const rawLeadTimesPerWeek: StateItem[] = sortLeadTimePerWeek(
        completedItems,
    );

    const itemTypeReturned: string[] = [];
    const calculateSLE = (itemType: WorkItemTypeWithProjectId) => {

        // get all by flomatikaWorkItemTypeId
        const filterRawLeadtime: StateItem[] = getLeadTimeByFlomatikaWorkItemTypeId(
            rawLeadTimesPerWeek,
            itemType.id,
            itemType.projectId
        );
        // get leadtime per week
        const formattedRawLeadtime: LeadTimeWeek[] = getFormattedLeadTimeWithWeek(
            filterRawLeadtime,
        );

        // should store the flomatikaWorkItemTypeIds to be returned
        itemTypeReturned.push(itemType.id);

        // const targetMetPcnt = getCalculatedTargetMet(
        //     formattedRawLeadtime,
        //     itemType,
        // );
        const targetMetCount = getAchievedLeadtime(
            formattedRawLeadtime,
            itemType,
        ).length;

        const serviceLevelCount = getLeadTimePerWeek(
            formattedRawLeadtime
        ).length;

        return {
            itemTypeName: itemType.displayName!,
            itemTypeId: itemType.id!,
            serviceLevelMetCount: targetMetCount,
            serviceLevelCount: serviceLevelCount
        };
    };

    const workItemTypeMapsWithServiceLevelPercent: WorkitemTypeWithServiceLevelPercent[] = allSLEConfigItems.map(calculateSLE);
    const workItemsWithServiceLevelPercent: WorkitemTypeWithServiceLevelPercent[] = [];
    workItemTypeMapsWithServiceLevelPercent.forEach(witm => {
        const idx = workItemsWithServiceLevelPercent.findIndex(x => x.itemTypeId === witm.itemTypeId);
        if (idx > -1) {
            workItemsWithServiceLevelPercent[idx].serviceLevelCount = workItemsWithServiceLevelPercent[idx].serviceLevelCount + witm.serviceLevelCount;
            workItemsWithServiceLevelPercent[idx].serviceLevelMetCount = workItemsWithServiceLevelPercent[idx].serviceLevelMetCount + witm.serviceLevelMetCount;
        } else {
            workItemsWithServiceLevelPercent.push(witm);
        }
    });
    return {
        workItemsWithServiceLevelPercent: workItemsWithServiceLevelPercent,
        itemTypeReturned,
    };
}

function calculatePercentOfValueDemand(
    valueDemandLength: number,
    total: number,
): number {
    const valueDemandPercent =
        valueDemandLength && total ? (valueDemandLength / total) * 100 : 0;

    return round(valueDemandPercent);
}

function calculatePercentOfFlowEfficiency(
    activeTime?: number,
    waitingTime?: number,
): number {
    const at = activeTime || 0;
    const wt = waitingTime || 0;
    const flowEfficiencyPercent =
        at + wt !== 0 ? ((at / (at + wt)) * 100) : 0;

    return round(flowEfficiencyPercent);
}

function getAmountOfQualityNormalisedWorkItems(
    valueDemandItems: StateItem[],
): { [normalisedName: string]: number; } {
    const amountOfNormalised: {
        [normalisedName: string]: StateItem[];
    } = groupBy(valueDemandItems, 'normalisedDisplayName');

    const amountByNormalised: { [normalisedName: string]: number; } = {};
    for (const normalisedDisplayName in amountOfNormalised) {
        amountByNormalised[normalisedDisplayName] =
            amountOfNormalised?.[normalisedDisplayName]?.length || 0;
    }

    return amountByNormalised;
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
