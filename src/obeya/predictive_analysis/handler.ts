import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';
import { BaseHandler } from '../../common/base_handler';
import { State } from '../../workitem/state_aurora';
import { ObeyaCalculation } from '../calculations';
import { ObeyaDb } from '../obeya_db';
import { ObeyaRoomsCalculations } from '../obeya_rooms/calculations';
import { PredictiveAnalysisCalculations } from './calculations';
import { ForecastingSettings } from './forecasting_settings/forecastingSettings';
import { ForecastingSettingDB } from './forecasting_settings/forecastingSettings_db';
import { Simulation } from './simulations/simulations';

class PredictiveAnalysisHandler extends BaseHandler {
    readonly predictiveAnalysisCalculations: PredictiveAnalysisCalculations;
    readonly forecastingSettings: ForecastingSettings;
    readonly obeyaCalculation: ObeyaCalculation;
    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            obeyaCalculation: asClass(ObeyaCalculation, {
                lifetime: Lifetime.SCOPED,
            }),
            obeyaRoomsCalculations: asClass(ObeyaRoomsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            obeyaDb: asClass(ObeyaDb, {
                lifetime: Lifetime.SCOPED,
            }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            predictiveAnalysisCalculations: asClass(
                PredictiveAnalysisCalculations,
                {
                    lifetime: Lifetime.SCOPED,
                },
            ),
            simulation: asClass(Simulation, {
                lifetime: Lifetime.SCOPED,
            }),
            forecastingSettings: asClass(ForecastingSettings, {
                lifetime: Lifetime.SCOPED,
            }),
            forecastingSettingsDb: asClass(ForecastingSettingDB, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.obeyaCalculation = this.dependencyInjectionContainer.cradle.obeyaCalculation;
        this.predictiveAnalysisCalculations = this.dependencyInjectionContainer.cradle.predictiveAnalysisCalculations;
        this.forecastingSettings = this.dependencyInjectionContainer.cradle.forecastingSettings;
    }
    async getPredictiveAnalysis(event: APIGatewayProxyEventV2) {
        try {
            /* allow any roles to access Governance Obeya
            if (!this.security.isGovernanceObeya()) {
                return {
                    statusCode: 403,
                    body: JSON.stringify({ error: { message: 'Forbidden' } }),
                };
            } */

            const obeyaRoomId = event.queryStringParameters?.obeyaRoomId;
            if (!obeyaRoomId) {
                return {
                    statusCode: 422,
                    body: JSON.stringify({
                        error: { message: 'Obeya Room Id is required' },
                    }),
                };
            }
            const obeyaData = await this.obeyaCalculation.getSavedObeyaData(
                obeyaRoomId,
            );
            const progressBoards = await this.obeyaCalculation.getProgressBoards(
                obeyaData,
            );
            const predictiveAnalysis = await this.predictiveAnalysisCalculations.getPredictiveAnalysis(
                obeyaRoomId,
                progressBoards,
                obeyaData,
            );
            // const settingsData = await this.forecastingSettings.getForecastingSettingsData(
            //     obeyaRoomId,
            // );
            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(predictiveAnalysis),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors ? (error as any).errors : (
                        error instanceof Error ? error.message : 'Unexpected error'
                    )
                ),
            };
        }
    }
}

export const getPredictiveAnalysis = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    const apiEvent = event as APIGatewayProxyEventV2;
    if (apiEvent.headers)
        //just a type guard
        return new PredictiveAnalysisHandler(
            event as APIGatewayProxyEventV2,
        ).getPredictiveAnalysis(event as APIGatewayProxyEventV2);
};
