import { DeliveryRatePrecision, FlomatikaWorkItemTypeLevel } from '../types/types';


export type ForecastWorkItemTypeLevel = {
    forecastPortfolio?: boolean;
    forecastTeam?: boolean;
    forecastIndividualContributor?: boolean;
};

export type ForecastingSettingValue = ForecastWorkItemTypeLevel & {
    teamPerformancePercentage?: number;
    workExpansionPercentage?: number;
    /**
     * Precision level for predictive analysis calculations
     */
    predictiveAnalysisPrecision: DeliveryRatePrecision;
};

export type ForecastingSettingsItem = ForecastingSettingValue & {
    orgId: string;
    roomId: string;
};

export type ForecastWorkItemLevelTextMap = {
    [key in keyof ForecastWorkItemTypeLevel]: {
        text: FlomatikaWorkItemTypeLevel;
    };
};

export type ForecastingSettingContextCapacity = {
    contextId: string;
    contextName: string;
    capacityPercentage: number;
};
export const TeamPerformanceLevels = [
    { value: 25, text: 'Significantly Slower' },
    { value: 50, text: 'Slower' },
    { value: 75, text: 'Slightly Slower' },
    { value: 100, text: 'Normal' },
    { value: 125, text: 'Slightly Faster' },
    { value: 150, text: 'Faster' },
    { value: 175, text: 'Significantly Faster' },
];

export type ForecastLevel = {
    forecastPortfolio: boolean;
    forecastTeam: boolean;
    forecastIndividualContributor: boolean;
};

export const WorkItemLevelNameMap: {
    [key: string]: {
        display: string;
        dataKey: keyof ForecastLevel;
    };
} = {
    portfolio: {
        display: 'Portfolio',
        dataKey: 'forecastPortfolio',
    },
    team: {
        display: 'Team',
        dataKey: 'forecastTeam',
    },
    individualContributor: {
        display: 'Individual Contributor',
        dataKey: 'forecastIndividualContributor',
    },
};
export const workExpansionLevels = [
    { value: 100, display: 'Already fully expanded' },
    { value: 150, display: 'Mostly Expanded' },
    { value: 200, display: 'Somewhat Expanded' },
    { value: 300, display: 'Not Expanded' },
];

export type Assumptions = {
    teamPerformance: string;
    workItemLevel: string;
    workExpansion: string;
    fullFocus: string;
    precision: string;
};
export type ForecastingSettingsData = ForecastingSettingsItem & {
    contextCapacity: ForecastingSettingContextCapacity[];
    sampleStartDate?: string | null;
    sampleEndDate?: string | null;
};
export type ForecastingSettingsResponse = ForecastingSettingsData & {
    assumptions: Assumptions;
};

