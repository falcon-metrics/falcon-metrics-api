import { camelCase } from 'lodash';
import { Interval } from 'luxon';

import { StateItem } from '../../../workitem/interfaces';
import { ForecastingSettingsData } from '../forecasting_settings/types';
import {
    DeliveryRateEachContext,
    DeliveryRate,
    DeliveryRateSummaryEachContext,
    GetSummaryDataParams,
    RemainingWorkItemsByLevel,
    SimulationSummaryData,
} from '../types/types';
import { getAdjustTotalRemainingWorkCount } from './forecasting_utils';

export const calculateDeliveryRatePerWeekFromDailyDeliveryRate = (
    deliveryRateByDay: DeliveryRate[],
    sampleDateRange: Interval,
): number => {
    const totalThroughput = deliveryRateByDay.reduce(
        (total, deliveryRate) => total + (deliveryRate.itemCompleted as number),
        0,
    );
    return calculateDeliveryRatePerWeek(totalThroughput, sampleDateRange);
};
export const calculateDeliveryRatePerWeek = (
    throughput: number,
    sampleDateRange: Interval,
): number => {
    const weeks = sampleDateRange.length('days') / 7;
    return Math.round(throughput / weeks);
};

type RemainingWorkItemsByLevelRaw = {
    //used for original grouping
    [key: string]: number;
};

export const groupRemainingWorkItemsByLevel = (
    workItems: StateItem[],
): RemainingWorkItemsByLevel => {
    const groupByCounter = (key: 'flomatikaWorkItemTypeLevel') => (
        result: RemainingWorkItemsByLevelRaw,
        current: StateItem,
    ) => {
        const level = current[key];
        const levelKey = camelCase(level as string);
        result[levelKey] = result[levelKey] ? result[levelKey] + 1 : 1;
        return result;
    };
    const result = workItems.reduce(
        groupByCounter('flomatikaWorkItemTypeLevel'),
        {},
    );
    return result as RemainingWorkItemsByLevel;
};
const adjustRemainingWorkCountByLevel = (
    foreCastingSettings: ForecastingSettingsData,
    workItemCountByLevel: RemainingWorkItemsByLevel,
) => {
    const adjustedWorkItemCountByLevel = Object.assign(
        {},
        workItemCountByLevel,
    );
    if (foreCastingSettings.workExpansionPercentage) {
        Object.keys(adjustedWorkItemCountByLevel).forEach((levelKey) => {
            const workItemCount =
                workItemCountByLevel[
                    levelKey as keyof RemainingWorkItemsByLevel
                ];
            adjustedWorkItemCountByLevel[
                levelKey as keyof RemainingWorkItemsByLevel
            ] = getAdjustTotalRemainingWorkCount(
                workItemCount,
                foreCastingSettings,
            );
        });
    }
    return adjustedWorkItemCountByLevel;
};

export const consolidateDeliveryRateByContext = (
    originalDeliveryRateByContext: DeliveryRateEachContext,
    adjustedDeliveryRateByContext: DeliveryRateEachContext,
    sampleDateRange: Interval,
): DeliveryRateSummaryEachContext => {
    const deliveryRateSummary: DeliveryRateSummaryEachContext = {};
    Object.keys(originalDeliveryRateByContext).forEach((contextId) => {
        deliveryRateSummary[contextId] = {
            original: calculateDeliveryRatePerWeek(
                originalDeliveryRateByContext[contextId],
                sampleDateRange,
            ),
            adjusted: calculateDeliveryRatePerWeek(
                adjustedDeliveryRateByContext[contextId],
                sampleDateRange,
            ),
        };
    });
    return deliveryRateSummary;
};

export const getSimulationSummary = (
    params: GetSummaryDataParams,
): SimulationSummaryData => {
    const {
        adjustedRemainingWorkCount,
        itemsInSelectedWorkItemLevel,
        foreCastingSettings,
        sampleDateRange,
        sampleDeliveryRate,
        originalDeliveryRateByContext,
        adjustedDeliveryRateByContext,
        simulationCount,
    } = params;
    const originalRemainingWorkItemsCountByLevel = groupRemainingWorkItemsByLevel(
        itemsInSelectedWorkItemLevel,
    );
    const adjustedRemainingWorkItemsCountByLevel = adjustRemainingWorkCountByLevel(
        foreCastingSettings,
        originalRemainingWorkItemsCountByLevel,
    );
    const deliveryRateByWeek = calculateDeliveryRatePerWeekFromDailyDeliveryRate(
        sampleDeliveryRate,
        sampleDateRange,
    );

    return {
        adjustedRemainingWork: adjustedRemainingWorkCount,
        adjustedRemainingWorkItemsByLevel: adjustedRemainingWorkItemsCountByLevel,
        originalRemainingWorkItemsByLevel: originalRemainingWorkItemsCountByLevel,
        averageWeeklyDeliveryRate: deliveryRateByWeek,
        deliveryRateByContext: consolidateDeliveryRateByContext(
            originalDeliveryRateByContext,
            adjustedDeliveryRateByContext,
            sampleDateRange,
        ),
        simulationCount,
    };
};
