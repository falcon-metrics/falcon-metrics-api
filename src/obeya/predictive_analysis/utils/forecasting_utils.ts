import _ from 'lodash';
import { groupBy } from 'lodash';
import { DateTime, Interval } from 'luxon';
import slugify from 'slugify';

import { getPercentRank } from '../../../utils/statistics';
import { StateItem } from '../../../workitem/interfaces';
import { StateCategory } from '../../../workitem/state_aurora';
import { BoardItem, ScopeItem } from '../../calculations';
import {
    ForecastingSettingsData,
    ForecastWorkItemLevelTextMap,
    ForecastWorkItemTypeLevel,
} from '../forecasting_settings/types';
import {
    CompletedItemsEachDayByContext,
    DeliveryRateEachContext,
    DeliveryRate,
    FlomatikaWorkItemTypeLevel,
    ItemCompletedEachContext,
    ObeyaItemDistributionPerContextPercentage,
    DeliveryRatePrecision,
} from '../types/types';

const DefaultCapacity = 0.75;

export const calculateDateRange = (
    sampleStartDate: string | null,
    sampleEndDate: string | null,
    today: DateTime,
): Interval => {
    // This if branch is to compute the rolling window interval
    // If the end date is not provided, we compute the rolling window 
    if (sampleStartDate !== null && sampleEndDate === null) {
        // setZone is true to use the same timezone as the client
        return Interval.fromDateTimes(DateTime.fromISO(sampleStartDate, { setZone: true }), today.minus({ day: 1 }));
    } else if (sampleStartDate !== null && sampleEndDate !== null) {
        return Interval.fromDateTimes(DateTime.fromISO(sampleStartDate, { setZone: true }), DateTime.fromISO(sampleEndDate, { setZone: true }));
    }
    return Interval.before(today.minus({ day: 1 }), { days: 90 });
    // return Interval.before(today.minus({ day: 1 }), { days: 3 });
};

export const calculateObeyaItemDistribution = (
    obeyaItemsByContext: BoardItem[],
): ObeyaItemDistributionPerContextPercentage => {
    const totalItemCount: number = obeyaItemsByContext.reduce(
        (sum: number, currentItem: BoardItem) => {
            sum += currentItem.inProgress;
            sum += currentItem.proposed;
            return sum;
        },
        0,
    );
    const obeyaItemDistribution: ObeyaItemDistributionPerContextPercentage = {};

    obeyaItemsByContext.forEach((boardItem: BoardItem) => {
        const totalItemsInContext = boardItem.inProgress + boardItem.proposed;
        obeyaItemDistribution[boardItem.contextId] = Math.round(
            (100 * totalItemsInContext) / totalItemCount,
        );
    });
    return obeyaItemDistribution;
};

export const calculateRemainingWorkFromScopeData = (
    scopeData: ScopeItem[],
): number => {
    return scopeData.reduce((acc, item) => {
        acc += item.inProgress + item.proposed;
        return acc;
    }, 0);
};
export const filterWorkItemByWorkItemLevelSetting = (
    remainingItems: StateItem[],
    forecastingSettings?: ForecastingSettingsData,
): StateItem[] => {
    if (!forecastingSettings) return remainingItems;
    const forecastLevelCheck: {
        [key: string]: {
            levelText: string;
            settingDataKey: keyof ForecastingSettingsData;
        };
    } = {
        forecastPortfolio: {
            levelText: 'Portfolio',
            settingDataKey: 'forecastPortfolio',
        },
        forecastTeam: { levelText: 'Team', settingDataKey: 'forecastTeam' },
        forecastIndividualContributor: {
            levelText: 'Individual Contributor',
            settingDataKey: 'forecastIndividualContributor',
        },
    };
    Object.keys(forecastLevelCheck).forEach((forecastLevelKey) => {
        const forecastLevel = forecastLevelCheck[forecastLevelKey];
        if (forecastingSettings[forecastLevel.settingDataKey] === false) {
            remainingItems = remainingItems.filter((item) =>
                item.flomatikaWorkItemTypeLevel
                    ? slugify(item.flomatikaWorkItemTypeLevel) !==
                    slugify(forecastLevel.levelText)
                    : false,
            );
        }
    });
    return remainingItems;
};
export const calculateRemainingWorkFromObeyaData = (
    obeyaData: StateItem[],
): StateItem[] => {
    const remainingItems = obeyaData.filter(
        (stateItem) =>
            stateItem.stateCategory !==
            StateCategory[StateCategory.COMPLETED].toLowerCase() &&
            stateItem.stateCategory !==
            StateCategory[StateCategory.REMOVED].toLowerCase(),
    );
    return remainingItems;
};
export const formatConfidenceLevel = (percentRank: number) => {
    return Math.round(percentRank * 100 * 10) / 10;
};

export const groupItemCompletedByContext = (
    completedItemEachDayWithContext: ItemCompletedEachContext[],
): CompletedItemsEachDayByContext => {
    const completedItemsGroupByContext = groupBy(
        completedItemEachDayWithContext,
        'contextId',
    );
    const completedItemsEachDayByContext: CompletedItemsEachDayByContext = {};
    Object.keys(completedItemsGroupByContext).forEach((contextId) => {
        const dateItemCompleted: {
            [date: string]: number;
        } = {};
        completedItemsGroupByContext[contextId].forEach(
            (itemCompletedByContextAndDate: {
                contextId: string;
                itemCompleted: string;
                date: string | Date;
            }) => {
                let dateString = '';
                if (typeof itemCompletedByContextAndDate.date === 'string')
                    dateString = itemCompletedByContextAndDate.date;
                else if (itemCompletedByContextAndDate.date instanceof Date)
                    dateString = itemCompletedByContextAndDate.date
                        .toISOString()
                        .split('T')[0];
                dateItemCompleted[dateString] = Number.parseInt(
                    itemCompletedByContextAndDate.itemCompleted,
                );
            },
        );
        completedItemsEachDayByContext[contextId] = dateItemCompleted;
    });
    return completedItemsEachDayByContext;
};

/**
 * Adjust delivery rate by team performance
 *
 * `adjusted delivery rate = original delivery rate * team performance percentage`
 */
export const adjustByTeamPerformance = (
    rawItemCompleted: number,
    forecastingSettings?: ForecastingSettingsData,
): number => {
    let itemCompleted = rawItemCompleted;
    if (!forecastingSettings) return itemCompleted;
    if (forecastingSettings.teamPerformancePercentage) {
        itemCompleted =
            itemCompleted *
            (forecastingSettings.teamPerformancePercentage / 100);
    }
    return itemCompleted;
};

/**
 * Adjust the delivery rates according to the team performance
 *
 * 1. Adjust by capacity
 *    - Higher the capacity - Higher the delivery rate
 * 2. Adjust by team performance
 *    - Higher the team performance - Higher the delivery rate
 *
 */
export const adjustSampleDeliveryRateBySettings = (
    contextIds: string[],
    dateRange: Interval,
    completeItemsEachDayByContext: CompletedItemsEachDayByContext,
    forecastingSettings: ForecastingSettingsData,
): {
    deliveryRate: DeliveryRate[];
    originalDeliveryRateByContext: DeliveryRateEachContext;
    adjustedDeliveryRateByContext: DeliveryRateEachContext;
} => {
    //Loop through days, for each context, get the item completed for that day
    //if cannot find that date in the context, then it is 0
    const { start, end } = dateRange;
    const contextCapacities:
        | ForecastingSettingsData['contextCapacity']
        | undefined = forecastingSettings?.contextCapacity;
    const contextCapacityWithIndex: {
        [contextId: string]: number;
    } = {};
    if (contextCapacities)
        contextCapacities.forEach((contextCapacity) => {
            contextCapacityWithIndex[contextCapacity.contextId] =
                contextCapacity.capacityPercentage;
        });
    const deliveryRateEachDay: DeliveryRate[] = [];
    const originalDeliveryRateByContext: DeliveryRateEachContext = {};
    const adjustedDeliveryRateByContext: DeliveryRateEachContext = {};

    //Initialize delivery rate for each context
    contextIds.forEach((contextId) => {
        originalDeliveryRateByContext[contextId] = 0;
        adjustedDeliveryRateByContext[contextId] = 0;
    });

    let currDate = start;
    while (currDate <= end) {
        /**
         * Sum of item's completed (delivery rate) across all contexts
         */
        let sumForCurrDate = 0;

        const currDateStr = currDate.toUTC().startOf('day').toISODate();
        contextIds.forEach((contextId) => {
            // Get delivery rate for the current date
            let itemCompletedForContextOnCurrDate = 0;
            if (
                completeItemsEachDayByContext[contextId] &&
                completeItemsEachDayByContext[contextId][currDateStr]
            ) {
                itemCompletedForContextOnCurrDate =
                    completeItemsEachDayByContext[contextId][currDateStr];
            }

            // **********Adjust the delivery rate**********
            // 1. Adjust for team capacity
            let adjustedItemCompleted =
                itemCompletedForContextOnCurrDate * DefaultCapacity;
            if (contextId in contextCapacityWithIndex) {
                adjustedItemCompleted =
                    itemCompletedForContextOnCurrDate *
                    (contextCapacityWithIndex[contextId] / 100);
            }

            // 2. Adjust for team performance
            adjustedItemCompleted = adjustByTeamPerformance(
                adjustedItemCompleted,
                forecastingSettings,
            );
            // ********************************************

            // Save values
            originalDeliveryRateByContext[
                contextId
            ] += itemCompletedForContextOnCurrDate;
            adjustedDeliveryRateByContext[contextId] += adjustedItemCompleted;

            sumForCurrDate += adjustedItemCompleted;
        });
        deliveryRateEachDay.push({
            date: currDate.toUTC().startOf('day').toISODate(),
            itemCompleted: Math.round(sumForCurrDate),
        });
        currDate = currDate.plus({ days: 1 });
    }

    const deliveryRate = _.chain(deliveryRateEachDay)
        .map((d) => {
            const date = DateTime.fromISO(d.date);
            let groupId = `day#${date.toISO()}`;
            if (
                forecastingSettings.predictiveAnalysisPrecision ===
                DeliveryRatePrecision.WEEK
            ) {
                groupId = `week#${date.year}#${date.weekNumber}`;
            }
            return { ...d, groupId };
        })
        .groupBy('groupId')
        .map((values) => {
            // Compute sum for each group
            /**
             * Map the array of values to an array of numbers
             * and then compute the sum of the array of numbers with .reduce
             *
             * Example:
             * ```
             * const sum = [1, 2, 3, 4, 5].reduce((sum, n) => sum + n, 0)
             * ```
             */
            const sum = values
                .map((v) => v.itemCompleted as number)
                .reduce((accum, n) => accum + n, 0);
            // After grouping, the date is the first day of the week
            // We're looking at "number of items completed in this week"
            // So we need the last date of the week
            let date = values[0]?.date;
            if (
                forecastingSettings.predictiveAnalysisPrecision ===
                DeliveryRatePrecision.WEEK
            ) {
                date = DateTime.fromISO(values[0]?.date)
                    .endOf('week')
                    .toISODate();
            }

            return {
                date,
                itemCompleted: sum,
            };
        })
        .value();

    return {
        deliveryRate,
        originalDeliveryRateByContext,
        adjustedDeliveryRateByContext,
    };
};

export const samplingItemWorkItemTypeLevel = (
    forecastingData: ForecastWorkItemTypeLevel,
): FlomatikaWorkItemTypeLevel[] => {
    const levelTextMap: ForecastWorkItemLevelTextMap = {
        forecastIndividualContributor: {
            text: 'Individual Contributor',
        },
        forecastTeam: {
            text: 'Team',
        },
        forecastPortfolio: {
            text: 'Portfolio',
        },
    };
    const validWorkItemLevels: FlomatikaWorkItemTypeLevel[] = [];
    Object.keys(forecastingData).forEach((forecastLevel) => {
        const forecastLevelKey = forecastLevel as keyof ForecastWorkItemTypeLevel;

        if (forecastingData[forecastLevelKey] === true) {
            validWorkItemLevels.push(levelTextMap[forecastLevelKey]!.text);
        }
    });
    return validWorkItemLevels;
};

export const getConfidenceLevelOfObeyaRemainingItems = (
    sortedDistribution: number[],
    obeyaRemainingItem: number,
): number => {
    //This code can be confusing so move to utils to be able to test
    return (1 - getPercentRank(sortedDistribution, obeyaRemainingItem)) * 100;
};

export const getAdjustTotalRemainingWorkCount = (
    totalRemainingWork: number,
    foreCastingSettings: ForecastingSettingsData,
) => {
    let adjustedRemainingWork = totalRemainingWork;
    if (foreCastingSettings.workExpansionPercentage) {
        adjustedRemainingWork = Math.floor(
            adjustedRemainingWork *
            (foreCastingSettings.workExpansionPercentage / 100),
        );
    }
    return adjustedRemainingWork;
};
