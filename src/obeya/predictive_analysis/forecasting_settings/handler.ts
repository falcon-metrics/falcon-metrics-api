import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../../../common/base_handler';
import { ForecastingSettings } from './forecastingSettings';
import { ForecastingSettingDB } from './forecastingSettings_db';
import { ForecastingSettingsData } from './types';
import { PredictiveAnalysisCalculations } from '../calculations';
import { samplingItemWorkItemTypeLevel } from '../utils/forecasting_utils';
import { ChartRecord } from '../../../value_stream_management/delivery_management/run_chart/calculations';
import { ObeyaDb } from '../../obeya_db';
import { State } from '../../../workitem/state_aurora';
import { ObeyaRoomsCalculations } from '../../obeya_rooms/calculations';
import { ObeyaCalculation } from '../../calculations';
import { Simulation } from '../simulations/simulations';

class ForecastingSettingsHandler extends BaseHandler {
    readonly forecastingSettings: ForecastingSettings;
    readonly predictiveAnalysisCalculations: PredictiveAnalysisCalculations;
    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            forecastingSettings: asClass(ForecastingSettings, {
                lifetime: Lifetime.SCOPED,
            }),
            forecastingSettingsDb: asClass(ForecastingSettingDB),
            predictiveAnalysisCalculations: asClass(PredictiveAnalysisCalculations, {
                lifetime: Lifetime.SCOPED
            }),
            obeyaDb: asClass(ObeyaDb, {
                lifetime: Lifetime.SCOPED,
            }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            obeyaRoomsCalculations: asClass(ObeyaRoomsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            obeyaCalculation: asClass(ObeyaCalculation, {
                lifetime: Lifetime.SCOPED,
            }),
            simulation: asClass(Simulation, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.forecastingSettings = this.dependencyInjectionContainer.cradle
            .forecastingSettings as ForecastingSettings;
        this.predictiveAnalysisCalculations = this.dependencyInjectionContainer.cradle.predictiveAnalysisCalculations;
    }
    async createOrUpdateSettings(event: APIGatewayProxyEventV2) {
        const settingsData: ForecastingSettingsData = event?.body
            ? JSON.parse(event?.body)
            : {};
        try {
            if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
                return {
                    statusCode: 403,
                    body: JSON.stringify({ error: { message: 'Forbidden' } }),
                };
            }
            if (!settingsData.sampleStartDate)
                settingsData.sampleStartDate = null;
            if (!settingsData.sampleEndDate)
                settingsData.sampleEndDate = null;
            const response = await this.forecastingSettings.createOrUpdateSettingsData(
                settingsData,
            );
            return {
                statusCode: 201,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors
                        ? (error as any).errors
                        : error instanceof Error
                            ? error.message
                            : 'Unexpected error',
                ),
            };
        }
    }

    async getThroughputPreview(event: APIGatewayProxyEventV2) {
        const contextIds = event?.queryStringParameters?.contextIds;
        const roomId = event?.queryStringParameters?.roomId;
        if (contextIds && roomId) {
            try {
                const startDate = event?.queryStringParameters?.startDate;
                const endDate = event?.queryStringParameters?.endDate;
                const forecastingSettingsData = await this.forecastingSettings.getForecastingSettingsData(event?.queryStringParameters?.roomId || '');
                const dateRangeForThroughputSelector = this.predictiveAnalysisCalculations.getSampleDateRange(
                    startDate || null,
                    endDate || null,
                );
                const flomatikaWorkItemTypeLevels = samplingItemWorkItemTypeLevel(
                    forecastingSettingsData,
                );
                const completedItemsPerDayPerContext = await this.predictiveAnalysisCalculations.getCompletedItemEachDayByContexts(
                    contextIds?.split(','),
                    dateRangeForThroughputSelector,
                    flomatikaWorkItemTypeLevels,
                );
                const throughputArray: ChartRecord[] = [];
                Object.keys(completedItemsPerDayPerContext).forEach(contextId => {
                    Object.keys(completedItemsPerDayPerContext[contextId]).forEach(date => {
                        const idx = throughputArray.findIndex(i => i[0] === date);
                        if (idx > -1) {
                            throughputArray[idx][1] = throughputArray[idx][1] + completedItemsPerDayPerContext[contextId][date];
                        } else {
                            throughputArray.push([date, completedItemsPerDayPerContext[contextId][date]]);
                        }
                    });
                });
                return {
                    statusCode: 200,
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(throughputArray),
                };
            } catch (error) {
                console.error(error);
                return {
                    statusCode: 500,
                    body: JSON.stringify(
                        error && (error as any).errors
                            ? (error as any).errors
                            : error instanceof Error
                                ? error.message
                                : 'Unexpected error',
                    ),
                };
            }
        } else {
            return {
                statusCode: 400,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ errorMessage: "Both contextIds and roomId are necessary parameters." }),
            };
        }

    }
}
export const createOrUpdateForecastingSettings = async (
    event: APIGatewayProxyEventV2,
) => {
    return new ForecastingSettingsHandler(event).createOrUpdateSettings(event);
};

export const getThroughputPreview = async (
    event: APIGatewayProxyEventV2
) => {
    return new ForecastingSettingsHandler(event).getThroughputPreview(event);
};
