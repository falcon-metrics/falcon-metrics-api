import { DateTime, Interval } from 'luxon';
import { StateItem } from '../../../workitem/interfaces';
import {
    Assumptions,
    ForecastingSettingsData,
    ForecastingSettingsResponse,
} from '../forecasting_settings/types';

export type DeliveryDateAnalysisItem = {
    '50Percentile'?: DateTime;
    '85Percentile'?: DateTime;
    '98Percentile'?: DateTime;
    desiredDeliveryDate: DateTime;
    desiredDeliveryDateConfidenceLevelPercentage: number;
};
export type ThroughputAnalysisItem = {
    '50Percentile': number;
    '85Percentile': number;
    '98Percentile': number;
    obeyaRemainingItem: number;
    obeyaRemainingItemConfidenceLevelPercentage: number;
};
export type DeliveryDateAnalysisResponse = {
    '50Percentile': string;
    '85Percentile': string;
    '98Percentile': string;
    desiredDeliveryDate: string;
    desiredDeliveryDateConfidenceLevelPercentage: number;
    histogramData: DeliveryDateHistogramData[];
};
export type ThroughputAnalysisResponse = ThroughputAnalysisItem & {
    histogramData: ThroughputHistogramData[];
};

export type SimulationAdditionalInfo = {
    dateRangeValue: string;
    duration: number;
    dataSetSize: string;
    throughputDays: number;
};

export type PredictiveAnalysisResponse = {
    deliveryDateAnalysis: DeliveryDateAnalysisResponse;
    throughputAnalysis: ThroughputAnalysisResponse;
    simulationSummary: SimulationSummaryData;
    simulationAdditionalInfo: SimulationAdditionalInfo;
    message?: string;
    isEmpty?: boolean;
    assumptions: Assumptions;
};
export type SampleThroughputDay = {
    day: Date;
    taskComplete: number;
};

export type SampleData = {
    [contextId: string]: SampleThroughputDay[];
};
export type ObeyaItemDistributionPerContextPercentage = {
    [contextId: string]: number;
};
export enum DeliveryRatePrecision {
    DAY = 'day',
    WEEK = 'week',
}
export type DeliveryRate = {
    date: string;
    itemCompleted: number | string; //sequelize returns string sometime
};
export type DeliveryRateEachContext = {
    [key: string]: number;
};

export type DeliveryRateSummaryEachContext = {
    [key: string]: {
        original: number;
        adjusted: number;
    };
};

export type ItemCompletedEachContext = {
    contextId: string;
    date: string | Date; //sequelize does that in my(@yuncheng) environment, just to make sure
    itemCompleted: string;
};

export type CompletedItemsEachDayByContext = {
    [contextId: string]: {
        [date: string]: number;
    };
};

export type FlomatikaWorkItemTypeLevel =
    | 'Portfolio'
    | 'Team'
    | 'Individual Contributor';

export type CommonHistogramData = {
    bin: number;
    frequency: number;
    probability: number;
    accumulatedProbability: number;
};

export type DeliveryDateHistogramData = CommonHistogramData & {
    deliveryDate: string;
};
export type ThroughputHistogramData = CommonHistogramData;

export type RemainingWorkItemsByLevel = {
    portfolio: number;
    team: number;
    individualContributor: number;
};
export type SimulationSummaryData = {
    adjustedRemainingWork: number;
    averageWeeklyDeliveryRate: number;
    originalRemainingWorkItemsByLevel: RemainingWorkItemsByLevel;
    adjustedRemainingWorkItemsByLevel: RemainingWorkItemsByLevel;
    deliveryRateByContext: DeliveryRateSummaryEachContext;
    simulationCount: number;
};

export type GetSummaryDataParams = {
    adjustedRemainingWorkCount: number;
    foreCastingSettings: ForecastingSettingsData;
    itemsInSelectedWorkItemLevel: StateItem[];
    sampleDeliveryRate: DeliveryRate[];
    sampleDateRange: Interval;
    originalDeliveryRateByContext: DeliveryRateEachContext;
    adjustedDeliveryRateByContext: DeliveryRateEachContext;
    simulationCount: number;
};
