import { describe, expect, test } from '@jest/globals';
import { DateTime, Interval } from 'luxon';
import { StateItem } from '../../../../workitem/interfaces';
import {
    ForecastingSettingsData,
    ForecastWorkItemTypeLevel,
} from '../../forecasting_settings/types';
import {
    DeliveryRate,
    DeliveryRatePrecision,
    ItemCompletedEachContext,
} from '../../types/types';
import {
    groupItemCompletedByContext,
    formatConfidenceLevel,
    adjustSampleDeliveryRateBySettings,
    filterWorkItemByWorkItemLevelSetting,
    calculateRemainingWorkFromObeyaData,
    samplingItemWorkItemTypeLevel,
    getConfidenceLevelOfObeyaRemainingItems,
} from '../forecasting_utils';

// describe('calculate date range tests', () => {
//     const today = DateTime.utc().startOf('day');
//     const yesterday = today.minus({ days: 1 });
//     const duration = 30;
//     test('calculate sampling date range', () => {
//         const obeyaStart = today.minus({ days: 10 });
//         const obeyaEnd = obeyaStart.plus({ days: duration });
//         const interval = calculateDateRange(obeyaStart, obeyaEnd, today);
//         expect(interval.start).toEqual(yesterday.minus({ days: duration }));
//         expect(interval.end).toEqual(yesterday);
//     });
// });

// describe('calculate obeya item distribution and total remaining tasks', () => {
//     const sampleProgress = [
//         {
//             contextId: 'test-context-1',
//             boardName: 'SaaS Platform',
//             completed: 19,
//             inProgress: 1,
//             proposed: 2,
//         },
//         {
//             contextId: 'test-context-2',
//             boardName: 'Analytics Dashboard Team',
//             completed: 117,
//             inProgress: 1,
//             proposed: 2,
//         },
//     ];
//     const obeyaDistribution = calculateObeyaItemDistribution(sampleProgress);
//     expect(obeyaDistribution['test-context-1']).toBe(50);
//     expect(obeyaDistribution['test-context-2']).toBe(50);
// });

// describe('test format confidence level', () => {
//     test('to 1 decimal place', () => {
//         expect(formatConfidenceLevel(0.1 / 100)).toBe(0.1);
//     });
// });

describe('test get delivery rate from item completed each context', () => {
    //Note: we allow decimal number in this step of calculation
    //0 is jan, so 9 is oct
    const day1 = DateTime.fromISO('2021-10-10')
        .toUTC()
        .startOf('day')
        .toISODate();
    const day2 = DateTime.fromISO('2021-10-11')
        .toUTC()
        .startOf('day')
        .toISODate();
    const day3 = DateTime.fromISO('2021-10-12')
        .toUTC()
        .startOf('day')
        .toISODate();
    const day4 = DateTime.fromISO('2021-10-13')
        .toUTC()
        .startOf('day')
        .toISODate();
    const dateRange = Interval.fromDateTimes(
        DateTime.fromISO('2021-10-10').toUTC(),
        DateTime.fromISO('2021-10-13').toUTC(),
    );
    const testCompletedItemEachDayWithContextWithDateFormat: ItemCompletedEachContext[] = [
        {
            contextId: 'test1',
            itemCompleted: '5',
            date: day1,
        },
        {
            contextId: 'test2',
            itemCompleted: '5',
            date: day1,
        },
        {
            contextId: 'test1',
            itemCompleted: '5',
            date: day2,
        },
    ];
    const testCompletedItemEachDayWithContextWithStringFormat = testCompletedItemEachDayWithContextWithDateFormat.map(
        (completedItem) => ({
            ...completedItem,
            date: completedItem.date as Date,
        }),
    );
    const itemCompletedGroupByContext: {
        [key: string]: {
            [key: string]: number;
        };
    } = {
        test1: {},
        test2: {},
    };
    itemCompletedGroupByContext.test1[day1] = 5;
    itemCompletedGroupByContext.test1[day2] = 5;
    itemCompletedGroupByContext.test2[day1] = 5;
    test('correct grouping by context', () => {
        let formattedItemByContext = groupItemCompletedByContext(
            testCompletedItemEachDayWithContextWithDateFormat,
        );
        expect(formattedItemByContext).toEqual(itemCompletedGroupByContext);
        formattedItemByContext = groupItemCompletedByContext(
            testCompletedItemEachDayWithContextWithStringFormat,
        );
        expect(formattedItemByContext).toEqual(itemCompletedGroupByContext);
    });
    test('get correct delivery rate from itemCompletedGroupByContext', () => {
        const forecastingSettings: ForecastingSettingsData = {
            orgId: 'test-rog',
            roomId: 'test-room',
            contextCapacity: [
                {
                    contextId: 'test1',
                    contextName: 'test1',
                    capacityPercentage: 50,
                },
                {
                    contextId: 'test2',
                    contextName: 'test2',
                    capacityPercentage: 100,
                },
            ],
            predictiveAnalysisPrecision: DeliveryRatePrecision.DAY
        };
        const contextIds = ['test1', 'test2'];
        const { deliveryRate: deliveryRateByDay } = adjustSampleDeliveryRateBySettings(
            contextIds,
            dateRange,
            itemCompletedGroupByContext,
            forecastingSettings,
        );
        const expectedDeliveryRate: DeliveryRate[] = [
            {
                date: day1,
                itemCompleted: Math.round(7.5),
            },
            {
                date: day2,
                itemCompleted: Math.round(2.5),
            },
            {
                date: day3,
                itemCompleted: 0,
            },
            {
                date: day4,
                itemCompleted: 0,
            },
        ];
        expect(deliveryRateByDay).toEqual(expectedDeliveryRate);
    });
    test('get correct delivery rate from itemCompletedGroupByContext when context capacity does not match, uses default', () => {
        const forecastingSettings: ForecastingSettingsData = {
            orgId: 'test-rog',
            roomId: 'test-room',
            teamPerformancePercentage: 100,
            contextCapacity: [
                {
                    contextId: 'test3',
                    contextName: 'test3',
                    capacityPercentage: 50,
                },
                {
                    contextId: 'test4',
                    contextName: 'test4',
                    capacityPercentage: 100,
                },
            ],
            predictiveAnalysisPrecision: DeliveryRatePrecision.DAY

        };
        const contextIds = ['test1', 'test2'];
        const { deliveryRate: deliveryRateByDay } = adjustSampleDeliveryRateBySettings(
            contextIds,
            dateRange,
            itemCompletedGroupByContext,
            forecastingSettings,
        );
        const expectedDeliveryRate: DeliveryRate[] = [
            {
                date: day1,
                itemCompleted: Math.round(7.5),
            },
            {
                date: day2,
                itemCompleted: Math.round(3.75),
            },
            {
                date: day3,
                itemCompleted: 0,
            },
            {
                date: day4,
                itemCompleted: 0,
            },
        ];
        expect(deliveryRateByDay).toEqual(expectedDeliveryRate);
    });
    test('get correct delivery rate from itemCompletedGroupByContext when there is no context capacity, with default capacity', () => {
        const forecastingSettings: ForecastingSettingsData = {
            orgId: 'test-rog',
            roomId: 'test-room',
            contextCapacity: [],
            predictiveAnalysisPrecision: DeliveryRatePrecision.DAY
        };
        const contextIds = ['test1', 'test2'];
        const { deliveryRate: deliveryRateByDay } = adjustSampleDeliveryRateBySettings(
            contextIds,
            dateRange,
            itemCompletedGroupByContext,
            forecastingSettings,
        );
        const expectedDeliveryRateWithDefaultCapacity: DeliveryRate[] = [
            {
                date: day1,
                itemCompleted: Math.round(7.5),
            },
            {
                date: day2,
                itemCompleted: Math.round(3.75),
            },
            {
                date: day3,
                itemCompleted: 0,
            },
            {
                date: day4,
                itemCompleted: 0,
            },
        ];
        expect(deliveryRateByDay).toEqual(
            expectedDeliveryRateWithDefaultCapacity,
        );
    });
    test('team performance setting works', () => {
        const forecastingSettings: ForecastingSettingsData = {
            orgId: 'test-rog',
            roomId: 'test-room',
            teamPerformancePercentage: 200,
            contextCapacity: [],
            predictiveAnalysisPrecision: DeliveryRatePrecision.DAY
        };
        const contextIds = ['test1', 'test2'];
        const { deliveryRate: deliveryRateByDay } = adjustSampleDeliveryRateBySettings(
            contextIds,
            dateRange,
            itemCompletedGroupByContext,
            forecastingSettings,
        );
        const expectedDeliveryRate: DeliveryRate[] = [
            {
                date: day1,
                itemCompleted: Math.round(7.5 * 2),
            },
            {
                date: day2,
                itemCompleted: Math.round(3.75 * 2),
            },
            {
                date: day3,
                itemCompleted: 0,
            },
            {
                date: day4,
                itemCompleted: 0,
            },
        ];
        expect(deliveryRateByDay).toEqual(expectedDeliveryRate);
    });
});

describe('test get correct total work item count with forecasting', () => {
    const testItems: StateItem[] = [
        {
            workItemId: 'test-item-1',
            stateCategory: 'inprogress',
            flomatikaWorkItemTypeLevel: 'Team',
        },
        {
            workItemId: 'test-item-2',
            stateCategory: 'proposed',
            flomatikaWorkItemTypeLevel: 'Portfolio',
        },
        {
            workItemId: 'test-item-3',
            stateCategory: 'inprogress',
            flomatikaWorkItemTypeLevel: 'Individual Contributor',
        },
    ];
    const forecastingSettings: ForecastingSettingsData = {
        orgId: 'test-rog',
        roomId: 'test-room',
        contextCapacity: [],
        forecastIndividualContributor: true,
        forecastTeam: true,
        forecastPortfolio: true,
        predictiveAnalysisPrecision: DeliveryRatePrecision.DAY
    };

    test('test filter with forecast level exclude works', () => {
        const settings = Object.assign({}, forecastingSettings);
        settings.forecastPortfolio = false;
        settings.forecastTeam = false;
        settings.forecastIndividualContributor = false;
        const filteredItem = filterWorkItemByWorkItemLevelSetting(
            testItems,
            settings,
        );
        expect(filteredItem.length).toBe(0);
    });
    test('test filter with forecast level include works', () => {
        const settings = Object.assign({}, forecastingSettings);
        settings.forecastPortfolio = true;
        settings.forecastTeam = false;
        settings.forecastIndividualContributor = false;
        const filteredItem = filterWorkItemByWorkItemLevelSetting(
            testItems,
            settings,
        );
        expect(filteredItem.length).toBe(1);
        expect(filteredItem[0].workItemId).toBe('test-item-2');
    });
    test('calculate remaining work exclude completed items', () => {
        testItems.push({
            workItemId: 'test-item-4',
            stateCategory: 'completed',
            flomatikaWorkItemTypeLevel: 'Portfolio',
        });
        expect(testItems[testItems.length - 1].workItemId).toBe('test-item-4');
        expect(testItems.length).toBe(4);
        const remainingWork = calculateRemainingWorkFromObeyaData(testItems);
        expect(remainingWork.length).toBe(3);
    });
});

describe('test get samplingItemWorkItemLevel', () => {
    test('return correct list when forecast level turned off', () => {
        const forecastingData: ForecastWorkItemTypeLevel = {
            forecastIndividualContributor: true,
            forecastPortfolio: true,
            forecastTeam: false,
        };
        const validWorkItemTexts = samplingItemWorkItemTypeLevel(
            forecastingData,
        );
        expect(validWorkItemTexts.sort()).toEqual(
            ['Portfolio', 'Individual Contributor'].sort(),
        );
    });
    test('return correct list when all forecast level turned off', () => {
        const forecastingData: ForecastWorkItemTypeLevel = {
            forecastIndividualContributor: false,
            forecastPortfolio: false,
            forecastTeam: false,
        };
        const validWorkItemTexts = samplingItemWorkItemTypeLevel(
            forecastingData,
        );
        expect(validWorkItemTexts).toEqual([]);
    });
});

describe('test interpret throughput distribution inversely correct', () => {
    const distribution = [5, 6, 7, 8, 9, 10];

    test('when obeya remaining item should be in high confidence of the distribution', () => {
        const remainingWork = 5;
        const confidenceLevel = getConfidenceLevelOfObeyaRemainingItems(
            distribution,
            remainingWork,
        );
        expect(confidenceLevel).toBe(100);
    });
    test('when obeya remaining item should be in low confidence of the distribution', () => {
        const remainingWork = 10;
        const confidenceLevel = getConfidenceLevelOfObeyaRemainingItems(
            distribution,
            remainingWork,
        );
        expect(confidenceLevel).toBe(0);
    });
});

describe('test format confidence level', () => {
    test('to 1 decimal place', () => {
        expect(formatConfidenceLevel(0.1 / 100)).toBe(0.1);
    });
});
