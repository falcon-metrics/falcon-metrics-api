import { Logger } from 'log4js';
import { DateTime, Interval } from 'luxon';

import { SecurityContext } from '../../common/security';
import { getPercentile, getPercentRank } from '../../utils/statistics';
import { StateItem } from '../../workitem/interfaces';
import { IState } from '../../workitem/state_aurora';
import { BoardItem, IObeyaCalculation } from '../calculations';
import { IObeyaDb } from '../obeya_db';
import {
    IObeyaRoomsCalculations,
    ObeyaRoom,
} from '../obeya_rooms/calculations';
import { IForecastingSettings } from './forecasting_settings/forecastingSettings';
import {
    Assumptions,
    ForecastingSettingsData,
} from './forecasting_settings/types';
import { ISimulation } from './simulations/simulations';
import {
    CompletedItemsEachDayByContext,
    DeliveryDateAnalysisItem,
    DeliveryDateAnalysisResponse,
    DeliveryDateHistogramData,
    DeliveryRateEachContext,
    DeliveryRate,
    FlomatikaWorkItemTypeLevel,
    ItemCompletedEachContext,
    ObeyaItemDistributionPerContextPercentage,
    PredictiveAnalysisResponse,
    ThroughputAnalysisItem,
    ThroughputAnalysisResponse,
    ThroughputHistogramData,
    DeliveryRatePrecision,
} from './types/types';
import {
    calculateDateRange,
    calculateObeyaItemDistribution,
    calculateRemainingWorkFromObeyaData,
    filterWorkItemByWorkItemLevelSetting,
    formatConfidenceLevel,
    getAdjustTotalRemainingWorkCount,
    getConfidenceLevelOfObeyaRemainingItems,
    adjustSampleDeliveryRateBySettings,
    groupItemCompletedByContext,
    samplingItemWorkItemTypeLevel,
} from './utils/forecasting_utils';
import {
    getThroughputHistogramData,
    buildHistogramData,
} from './utils/histogram_utils';
import {
    getSimulationAdditionalInfo,
    shouldRunSimulation,
} from './utils/simulation_utils';
import { getSimulationSummary } from './utils/summary_utils';
import { ChartRecord } from '../../value_stream_management/delivery_management/run_chart/calculations';

const emptyDeliveryDateAnalysisResponse = {
    '50Percentile': '',
    '85Percentile': '',
    '98Percentile': '',
    desiredDeliveryDate: '',
    desiredDeliveryDateConfidenceLevelPercentage: 0,
    histogramData: [],
};

const emptyRemainingWorkItemsByLevel = {
    portfolio: 0,
    team: 0,
    individualContributor: 0,
};

const emptySimulationSummaryData = {
    adjustedRemainingWork: 0,
    averageWeeklyDeliveryRate: 0,
    originalRemainingWorkItemsByLevel: emptyRemainingWorkItemsByLevel,
    adjustedRemainingWorkItemsByLevel: emptyRemainingWorkItemsByLevel,
    deliveryRateByContext: {},
    simulationCount: 0,
};

const emptyThroughputAnalysis: ThroughputAnalysisResponse = {
    '50Percentile': 0,
    '85Percentile': 0,
    '98Percentile': 0,
    obeyaRemainingItem: 0,
    obeyaRemainingItemConfidenceLevelPercentage: 0,
    histogramData: [],
};
const emptyResponse: PredictiveAnalysisResponse = {
    deliveryDateAnalysis: emptyDeliveryDateAnalysisResponse,
    throughputAnalysis: emptyThroughputAnalysis,
    simulationSummary: emptySimulationSummaryData,
    simulationAdditionalInfo: {
        dateRangeValue: '',
        duration: 0,
        dataSetSize: '',
        throughputDays: 0,
    },
    assumptions: {
        teamPerformance: '',
        workItemLevel: '',
        workExpansion: '',
        fullFocus: '',
        precision: '',
    },
    isEmpty: true,
};
export interface IPredictiveAnalysisCalculations {
    getContextRatioInObeya(
        obeyaItems: BoardItem[],
    ): ObeyaItemDistributionPerContextPercentage;
}
export class PredictiveAnalysisCalculations
    implements IPredictiveAnalysisCalculations {
    readonly orgId: string;
    readonly logger: Logger;
    readonly obeyaRoomsCalculations: IObeyaRoomsCalculations;
    readonly obeyaCalculation: IObeyaCalculation;
    readonly obeyaDb: IObeyaDb;
    readonly forecastingSettings: IForecastingSettings;
    readonly state: IState;
    readonly simulation: ISimulation;
    readonly today: DateTime;
    constructor(opts: {
        security: SecurityContext;
        logger: Logger;
        obeyaRoomsCalculations: IObeyaRoomsCalculations;
        obeyaCalculation: IObeyaCalculation;
        forecastingSettings: IForecastingSettings;
        obeyaDb: IObeyaDb;
        state: IState;
        simulation: ISimulation;
    }) {
        if (!opts?.security?.organisation) throw Error('Cannot find org id');

        this.orgId = opts?.security?.organisation;
        this.logger = opts.logger;
        this.state = opts.state;
        this.obeyaRoomsCalculations = opts.obeyaRoomsCalculations;
        this.obeyaCalculation = opts.obeyaCalculation;
        this.forecastingSettings = opts.forecastingSettings;
        this.obeyaDb = opts.obeyaDb;
        this.simulation = opts.simulation;
        this.today = DateTime.utc().startOf('day');
    }
    async getPredictiveAnalysis(
        obeyaRoomId: string,
        progressBoard: BoardItem[],
        obeyaData: StateItem[],
    ): Promise<PredictiveAnalysisResponse> {
        const obeyaRoom = await this.getObeyaRoom(obeyaRoomId);
        const obeyaEndDate = DateTime.fromJSDate(obeyaRoom.endDate!);

        const isFinised = obeyaRoom.isFinished;

        if (isFinised) {
            return {
                ...emptyResponse,
                message: 'This initiative has been marked as finished.',
            };
        }


        //exclude context without context address (aggregation)
        const obeyaItemsInContexts = progressBoard;
        const forecastingSettingsData = await this.getForecastingSettingsData(
            obeyaRoomId,
        );
        if (forecastingSettingsData.sampleStartDate === undefined)
            forecastingSettingsData.sampleStartDate = null;
        if (forecastingSettingsData.sampleEndDate === undefined)
            forecastingSettingsData.sampleEndDate = null;
        const sampleDateRange = this.getSampleDateRange(
            forecastingSettingsData.sampleStartDate,
            forecastingSettingsData.sampleEndDate
        );
        const flomatikaWorkItemTypeLevels = samplingItemWorkItemTypeLevel(
            forecastingSettingsData,
        );

        // prevent to break simualtion without valid contextsIds
        const contextIds = obeyaItemsInContexts?.map(
            (boardItem) => boardItem?.contextId,
        );

        if (!contextIds?.length) {
            return {
                ...emptyResponse,
                message:
                    'Unable to run forecast due to no items in this initiative.',
            };
        }

        const {
            deliveryRate: sampleDeliveryRate,
            originalDeliveryRateByContext,
            adjustedDeliveryRateByContext,
        } = await this.getSampleDeliveryRate(
            contextIds,
            sampleDateRange,
            forecastingSettingsData,
            flomatikaWorkItemTypeLevels,
        );
        const totalRemainingWorkItems = calculateRemainingWorkFromObeyaData(
            obeyaData,
        );
        const tomorrow = this.today.plus({ day: 1 });
        const obeyaStartDate = DateTime.fromJSDate(obeyaRoom.beginDate!);
        const simulationStartDate = DateTime.max(tomorrow, obeyaStartDate);

        /**
         * Calculate the expected remaining "slot"
         *
         * The "slot" depends on settings - Day, Week or Month
         */
        let expectedRemainingSlots = 0;
        switch (forecastingSettingsData.predictiveAnalysisPrecision) {
            case DeliveryRatePrecision.DAY: {
                expectedRemainingSlots = obeyaEndDate.diff(simulationStartDate, ['days'])
                    .days;
                break;
            }
            case DeliveryRatePrecision.WEEK: {
                expectedRemainingSlots = obeyaEndDate.diff(simulationStartDate, ['weeks'])
                    .weeks;
                break;
            }
        }
        // Round up to the end of the interval - End of the last day or the end of the last week
        expectedRemainingSlots = Math.ceil(expectedRemainingSlots);

        const itemsInSelectedWorkItemLevel = filterWorkItemByWorkItemLevelSetting(
            totalRemainingWorkItems,
            forecastingSettingsData,
        );
        const totalRemainingWorkCount = itemsInSelectedWorkItemLevel.length;

        const adjustedRemainingWorkCount = this.getAdjustTotalRemainingWorkCount(
            totalRemainingWorkCount,
            forecastingSettingsData,
        );

        const {
            dateRangeValue,
            duration,
            dataSetSize,
            throughputDays,
        } = getSimulationAdditionalInfo(sampleDeliveryRate);

        const runSimulationCheck = shouldRunSimulation({
            sampleDeliveryRate,
            foreCastingSettings: forecastingSettingsData,
        });

        if (!runSimulationCheck.validated) {
            return {
                ...emptyResponse,
                simulationAdditionalInfo: {
                    dateRangeValue,
                    duration,
                    dataSetSize,
                    throughputDays,
                },
                message: runSimulationCheck.reason,
            };
        }

        const {
            simulationResults,
            throughputResults,
            simulationCount,
        } = this.simulation.runSimulation(
            sampleDeliveryRate,
            adjustedRemainingWorkCount,
            expectedRemainingSlots,
            forecastingSettingsData.predictiveAnalysisPrecision,
        );
        //refactor the interpret, use raw days required
        console.time('interpret delivery date');
        const deliveryDateAnalysisItem = this.interpretDeliveryDateDistribution(
            simulationResults,
            DateTime.fromJSDate(obeyaRoom.endDate!),
            forecastingSettingsData,
            obeyaStartDate
        );
        console.timeEnd('interpret delivery date');
        console.time('interpret throughput');
        const throughputAnalysisItem = this.interpretThroughputDistribution(
            throughputResults,
            adjustedRemainingWorkCount,
        );
        console.timeEnd('interpret throughput');

        console.time('get histograms');
        const deliveryDateHistogramData = this.getWhenHistogramData(
            simulationResults,
            simulationStartDate,
            forecastingSettingsData.predictiveAnalysisPrecision,
        );
        const throughputHistogramData = this.getThroughputHistogramData(
            throughputResults,
        );
        console.timeEnd('get histograms');

        return {
            deliveryDateAnalysis: this.mapPredictiveAnalysisItemToResponse(
                deliveryDateAnalysisItem,
                deliveryDateHistogramData,
            ),
            throughputAnalysis: {
                ...throughputAnalysisItem,
                histogramData: throughputHistogramData,
            },
            simulationSummary: getSimulationSummary({
                adjustedRemainingWorkCount,
                foreCastingSettings: forecastingSettingsData,
                itemsInSelectedWorkItemLevel,
                sampleDeliveryRate,
                sampleDateRange,
                originalDeliveryRateByContext,
                adjustedDeliveryRateByContext,
                simulationCount,
            }),
            simulationAdditionalInfo: {
                dateRangeValue,
                duration,
                dataSetSize,
                throughputDays,
            },
            assumptions: this.getAssumptions(forecastingSettingsData),
        };
    }
    private mapPredictiveAnalysisItemToResponse = (
        analysisItem: DeliveryDateAnalysisItem,
        histogramData: DeliveryDateHistogramData[],
    ): DeliveryDateAnalysisResponse => {
        return {
            histogramData,
            '50Percentile': analysisItem?.['50Percentile']?.toISODate() ?? '-',
            '85Percentile': analysisItem?.['85Percentile']?.toISODate() ?? '-',
            '98Percentile': analysisItem?.['98Percentile']?.toISODate() ?? '-',
            desiredDeliveryDate:
                analysisItem.desiredDeliveryDate?.toISODate() ?? '-',
            desiredDeliveryDateConfidenceLevelPercentage:
                analysisItem.desiredDeliveryDateConfidenceLevelPercentage,
        };
    };
    public getSampleDateRange(
        sampleStartDate: string | null,
        sampleEndDate: string | null,
    ): Interval {
        return calculateDateRange(sampleStartDate, sampleEndDate, this.today);
    }
    private getAdjustTotalRemainingWorkCount(
        totalRemainingWork: number,
        foreCastingSettings: ForecastingSettingsData,
    ) {
        return getAdjustTotalRemainingWorkCount(
            totalRemainingWork,
            foreCastingSettings,
        );
    }
    private getWhenHistogramData(
        simulationResult: number[],
        simulationStartDate: DateTime,
        precision: DeliveryRatePrecision,
    ): DeliveryDateHistogramData[] {
        return buildHistogramData(simulationResult, simulationStartDate, precision);
    }
    private getThroughputHistogramData(
        throughputResults: number[],
    ): ThroughputHistogramData[] {
        return getThroughputHistogramData(throughputResults);
    }
    async getObeyaRoom(obeyaRoomId: string): Promise<ObeyaRoom> {
        return await this.obeyaRoomsCalculations.getObeyaRoom(obeyaRoomId);
    }
    /**
     * Get historical data. Get the delivery rates
     * per interval (interval is in settings as "precision" - day or week)
     *
     */
    async getSampleDeliveryRate(
        contextIds: string[],
        dateRange: Interval,
        forecastingSettings: ForecastingSettingsData,
        flomatikaWorkItemTypeLevels?: FlomatikaWorkItemTypeLevel[],
    ): Promise<{
        deliveryRate: DeliveryRate[];
        originalDeliveryRateByContext: DeliveryRateEachContext;
        adjustedDeliveryRateByContext: DeliveryRateEachContext;
    }> {
        /**
         * Counts of completed work items for every context
         */
        const completedItemsEachDayByContext = await this.getCompletedItemEachDayByContexts(
            contextIds,
            dateRange,
            flomatikaWorkItemTypeLevels,
        );

        // Remove contexts that dont have a context id
        const filteredByValidContext: CompletedItemsEachDayByContext = {};
        Object.keys(completedItemsEachDayByContext)
            .filter((c) => c != null && c !== 'null')
            .forEach((contextId) => {
                if (contextId !== null || contextId !== 'null') {
                    filteredByValidContext[contextId] =
                        completedItemsEachDayByContext[contextId];
                }
            });
        return adjustSampleDeliveryRateBySettings(
            contextIds,
            dateRange,
            filteredByValidContext,
            forecastingSettings,
        );
    }

    groupByContext(
        completedItemEachDayWithContext: ItemCompletedEachContext[],
    ): CompletedItemsEachDayByContext {
        return groupItemCompletedByContext(completedItemEachDayWithContext);
    }
    async getCompletedItemEachDayByContexts(
        contextIds: string[],
        dateRange: Interval,
        flomatikaWorkItemTypeLevels?: FlomatikaWorkItemTypeLevel[],
    ): Promise<CompletedItemsEachDayByContext> {
        let itemCompleteByContext: ItemCompletedEachContext[] = [];
        if (contextIds.length) {
            itemCompleteByContext = await this.obeyaDb.getCompletedItemsEachDayByContext(
                this.orgId,
                contextIds,
                dateRange,
                flomatikaWorkItemTypeLevels,
            );
        }

        return this.groupByContext(itemCompleteByContext);
    }
    async getForecastingSettingsData(
        obeyaRoomId: string,
    ): Promise<ForecastingSettingsData> {
        return await this.forecastingSettings.getForecastingSettingsData(
            obeyaRoomId,
        );
    }
    public getAssumptions(
        forecastingData: ForecastingSettingsData,
    ): Assumptions {
        return this.forecastingSettings.getAssumptions(forecastingData);
    }
    async getSampleDatasetOfDeliveryRateWithoutContext(
        //Currently not in use
        contextIds: string[],
        dateRange: Interval,
    ): Promise<DeliveryRate[]> {
        if (!this.orgId) throw Error('Cannot find org id');
        const completedItemsEachDayByContext = await this.state.getCompletedItemsEachDayInContexts(
            this.orgId,
            contextIds,
            dateRange,
        );
        return completedItemsEachDayByContext;
    }
    getContextRatioInObeya(
        //Currently not in use
        obeyaItemsByContext: BoardItem[],
    ): ObeyaItemDistributionPerContextPercentage {
        return calculateObeyaItemDistribution(obeyaItemsByContext);
    }
    public interpretDeliveryDateDistribution(
        simulationResults: number[],
        obeyaEndDate: DateTime,
        forecastingSettingsData: ForecastingSettingsData,
        obeyaStartDate: DateTime
    ): DeliveryDateAnalysisItem {
        //if obeya start date is after tomorrow , use obeya start date instead of tomorrow to get final dates
        const tomorrow = this.today.plus({ day: 1 });
        const simulationStartDate = DateTime.max(tomorrow, obeyaStartDate);

        // similation start date  = tomorrow | obeya start date


        const durationType =
            forecastingSettingsData.predictiveAnalysisPrecision;

        const percentile50Count = getPercentile(50, simulationResults);
        const percentile85Count = getPercentile(85, simulationResults);
        const percentile98Count = getPercentile(98, simulationResults);

        // Helper function - This is a closure.
        // It uses tomorrow's date and duration type from above
        const addToDate = (count: number) => {
            switch (durationType) {
                case DeliveryRatePrecision.DAY: {
                    return simulationStartDate.plus({ days: count });
                }
                case DeliveryRatePrecision.WEEK: {
                    return simulationStartDate.plus({ weeks: count });
                }
            }
        };

        const targetDate = obeyaEndDate.toUTC().startOf('day').plus({ day: 1 });
        let target = targetDate.diff(simulationStartDate, 'days').days || 0;
        if (durationType === DeliveryRatePrecision.WEEK) {
            target = targetDate.diff(simulationStartDate, 'weeks').weeks;
        }

        /**
         * Percentage rank is saying:
         * before that day (percentage rank of the day first appear in the distribution),
         * so we add 1, to get the
         * actual percentage rank of <= the day (percentage rank of the
         * day last appear in the distribution).
         */
        const percentRank = getPercentRank(simulationResults, target);

        const analysisItem: DeliveryDateAnalysisItem = {
            '50Percentile': simulationResults.length
                ? addToDate(percentile50Count)
                : undefined,
            '85Percentile': simulationResults.length
                ? addToDate(percentile85Count)
                : undefined,
            '98Percentile': simulationResults.length
                ? addToDate(percentile98Count)
                : undefined,
            desiredDeliveryDate: obeyaEndDate ?? undefined,
            desiredDeliveryDateConfidenceLevelPercentage:
                obeyaEndDate && simulationResults?.length
                    ? formatConfidenceLevel(percentRank)
                    : 0,
        };
        return analysisItem;
    }
    public interpretThroughputDistribution(
        throughputDistribution: number[],
        obeyaRemainingItem: number,
    ): ThroughputAnalysisItem {
        //For throughput we get the inverse percentile
        const analysisItem: ThroughputAnalysisItem = {
            '50Percentile': getPercentile(100 - 50, throughputDistribution),
            '85Percentile': getPercentile(100 - 85, throughputDistribution),
            '98Percentile': getPercentile(100 - 98, throughputDistribution),
            obeyaRemainingItem: obeyaRemainingItem,
            obeyaRemainingItemConfidenceLevelPercentage: getConfidenceLevelOfObeyaRemainingItems(
                throughputDistribution,
                obeyaRemainingItem,
            ),
        };
        return analysisItem;
    }
}
