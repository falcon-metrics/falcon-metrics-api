import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';

import { BaseHandler } from '../common/base_handler';
import { HandleEvent } from '../common/event_handler';
import { IQueryFilters, QueryFilters } from '../common/filters_v2';
import RelationshipsDbAurora from '../relationships/relationships_db_aurora';
import { State } from '../workitem/state_aurora';
import {
    BoardItem,
    getFormattedWorkflowItem,
    HighlightsResponse,
    IndividualContributorsItem,
    ObeyaCalculation,
    ObeyaContextsWithWorkItems,
    ObeyaScopeBurnData,
    PopulateResult,
    WorkFlowBoard,
} from './calculations';
import * as DependenciesCalculations from './dependencies/calculations';
import { ObeyaDb } from './obeya_db';
import { ObeyaRoomsCalculations } from './obeya_rooms/calculations';
import { ObjectiveCalculations } from './objectives/calculations';
import { PredictiveAnalysisCalculations } from './predictive_analysis/calculations';
import { ForecastingSettings } from './predictive_analysis/forecasting_settings/forecastingSettings';
import { ForecastingSettingDB } from './predictive_analysis/forecasting_settings/forecastingSettings_db';
import { ForecastingSettingsData } from './predictive_analysis/forecasting_settings/types';
import { Simulation } from './predictive_analysis/simulations/simulations';
import * as RisksCalculations from './risks/calculations';
import { RiskItem } from './risks/types';

import _ from 'lodash';
import { SecurityContext } from '../common/security';
import { WidgetInformationUtils } from '../utils/getWidgetInformation';
import { Calculations as FlowItemsCalculation } from '../value_stream_management/delivery_management/flow_items/calculations';
import { ExtendedStateItem } from '../workitem/interfaces';
import { ISnapshot, Snapshot } from '../workitem/snapshot_db';

import zlib from 'zlib';


class ObeyaHandler extends BaseHandler {
    readonly obeyaCalculation: ObeyaCalculation;
    readonly objectivesCalculations: ObjectiveCalculations;
    readonly dependenciesCalculations: DependenciesCalculations.Calculations;
    readonly risksCalculations: RisksCalculations.Calculations;
    readonly predictiveAnalysisCalculations: PredictiveAnalysisCalculations;
    readonly forecastingSettings: ForecastingSettings;
    readonly filters: IQueryFilters;
    readonly flowItemsCalculation: FlowItemsCalculation;
    readonly snapshot: ISnapshot;
    readonly widgetInformationUtils: WidgetInformationUtils;
    readonly orgId: string;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            obeyaCalculation: asClass(ObeyaCalculation, {
                lifetime: Lifetime.SCOPED,
            }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            objectivesCalculations: asClass(ObjectiveCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            obeyaRoomsCalculations: asClass(ObeyaRoomsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            obeyaDb: asClass(ObeyaDb, {
                lifetime: Lifetime.SCOPED,
            }),
            dependenciesCalculations: asClass(
                DependenciesCalculations.Calculations,
                {
                    lifetime: Lifetime.SCOPED,
                },
            ),
            risksCalculations: asClass(RisksCalculations.Calculations, {
                lifetime: Lifetime.SCOPED,
            }),
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
            filters: asClass(QueryFilters, {
                lifetime: Lifetime.SCOPED,
            }),
            relationshipsDbAurora: asClass(RelationshipsDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
            flowItemsCalculation: asClass(FlowItemsCalculation, {
                lifetime: Lifetime.SCOPED,
            }),
            snapshot: asClass(Snapshot, {
                lifetime: Lifetime.SCOPED,
            }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.obeyaCalculation = this.dependencyInjectionContainer.cradle.obeyaCalculation;
        this.objectivesCalculations = this.dependencyInjectionContainer.cradle.objectivesCalculations;
        this.dependenciesCalculations = this.dependencyInjectionContainer.cradle.dependenciesCalculations;
        this.risksCalculations = this.dependencyInjectionContainer.cradle.risksCalculations;
        this.predictiveAnalysisCalculations = this.dependencyInjectionContainer.cradle.predictiveAnalysisCalculations;
        this.forecastingSettings = this.dependencyInjectionContainer.cradle.forecastingSettings;
        this.filters = this.dependencyInjectionContainer.cradle.filters;
        this.flowItemsCalculation = this.dependencyInjectionContainer.cradle.flowItemsCalculation;
        this.snapshot = this.dependencyInjectionContainer.cradle.snapshot;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
        this.orgId = (this.dependencyInjectionContainer.cradle.security as SecurityContext).organisation!;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {
            /* allow any roles to access Governance Obeya
            if (!this.security.isGovernanceObeya()) {
                return {
                    statusCode: 403,
                    body: JSON.stringify({ error: { message: 'Forbidden' } }),
                };
            } */

            const disableCompression = event.queryStringParameters?.disableCompression === 'true';

            const obeyaRoomId = event.queryStringParameters?.obeyaRoomId;
            if (!obeyaRoomId) {
                return {
                    statusCode: 422,
                    body: JSON.stringify({
                        error: { message: 'Obeya Room Id is required' },
                    }),
                };
            }
            const obeyaRoom = await this.obeyaCalculation.getObeyaRoom(obeyaRoomId);

            const promises = [
                // Calling this here to save data to the cache
                this.obeyaCalculation.getSavedObeyaData(
                    obeyaRoomId,
                    this.filters.clientTimezone,
                ),
                this.filters.getExcludeWeekendsSetting(this.orgId),
                this.obeyaCalculation.getContextsOfObeya(this.orgId, obeyaRoom)
            ];
            const [obeyaDataResult, excludeWeekendsResult, obeyaContexts] = await Promise.all(promises);
            const obeyaData = obeyaDataResult as ExtendedStateItem[];
            const excludeWeekends = !!excludeWeekendsResult;

            // Contains all workitems by context
            const allWorkItemsWithinContexts: ObeyaContextsWithWorkItems = await this.obeyaCalculation.getContextsWithRelatedWorkItems(
                obeyaData,
                [
                    'workItemId',
                    'title',
                    'state',
                    'stateCategory',
                    'workItemType',
                    'stateType',
                    'arrivalDate',
                    'commitmentDateTime',
                    'departureDateTime',
                    'flagged',
                    'parentId',
                    'leadTimeInWholeDays',
                    'flomatikaWorkItemTypeServiceLevelExpectationInDays',
                    'flomatikaWorkItemTypeLevel',
                    'assignedTo',
                    'targetStart',
                    'targetEnd',
                    'targetStartDateTime',
                    'targetEndDateTime',
                    'baselines',
                    'dependencies',
                    'datasourceId',
                    'linkedItems'
                ],
                (wi) => getFormattedWorkflowItem(wi, excludeWeekends),
            );

            // Contains work items grouped by state category, represented as a key-value pair
            // Used by Roadmap and Scope components
            const [allBoards] = await this.obeyaCalculation.getObeyaWorkflowItems(allWorkItemsWithinContexts);

            const highlightsPromise: Promise<HighlightsResponse> = this.obeyaCalculation.getScopeInfo(
                obeyaData,
            );

            const individualContributorsPromise: Promise<
                IndividualContributorsItem[]
            > = this.obeyaCalculation.getIndividualContributors(obeyaData);

            const progressPromise: Promise<
                BoardItem[]
            > = this.obeyaCalculation.getProgressBoards(obeyaData);

            const scopeBoardsPromise: Promise<
                WorkFlowBoard[]
            > = this.obeyaCalculation.getObeyaWorkflowItems(allWorkItemsWithinContexts);

            const roadmapPromise = this.obeyaCalculation.getRoadmapWorkflowItems(allWorkItemsWithinContexts, allBoards);

            const burnDataPromise: Promise<ObeyaScopeBurnData> = this.obeyaCalculation.getObeyaScopeBurndown(
                obeyaRoomId,
                obeyaData,
            );

            const objectivesPromise = this.objectivesCalculations.getAllObjectives(
                obeyaRoomId,
                obeyaData,
            );

            const dependenciesPromise = this.dependenciesCalculations.getAllDependencies(
                obeyaRoomId,
            );

            const risksPromise: Promise<
                RiskItem[]
            > = this.risksCalculations.getAllRisks(obeyaRoomId);
            //TODO: think about await two promise a bit more, goal: improve performance avoid repeat calls
            // const predictiveAnalysisPromise: Promise<PredictiveAnalysisResponse> = this.predictiveAnalysisCalculations.getPredictiveAnalysis(
            //     obeyaRoomId,
            //     await progressPromise,
            //     await highlightsPromise,
            // );
            const forecastingSettingsPromise: Promise<ForecastingSettingsData> = this.forecastingSettings.getForecastingSettingsData(
                obeyaRoomId,
            );

            const [
                objectives,
                highlights,
                individualContributors,
                progressBoards,
                scopeBoards,
                dependencies,
                risks,
                burnData,
                forecastingSettings,
                roadmapResult,
            ] = await Promise.all([
                objectivesPromise as any,
                highlightsPromise as any,
                individualContributorsPromise as any,
                progressPromise as any,
                scopeBoardsPromise as any,
                dependenciesPromise as any,
                risksPromise as any,
                burnDataPromise as any,
                forecastingSettingsPromise as any,
                roadmapPromise as any,
            ]);
            console.time('analysis');
            const predictiveAnalysis = await this.predictiveAnalysisCalculations.getPredictiveAnalysis(
                obeyaRoomId,
                progressBoards,
                obeyaData,
            );
            const focus = await this.obeyaCalculation.getFocus(progressBoards, _.uniq(obeyaData.map(x => x.workItemId || '')));
            // console.log('delivery analysis is ===>%o', predictiveAnalysis.throughputAnalysis)
            console.timeEnd('analysis');
            let scopeBoardsResponse = scopeBoards;
            if (!disableCompression) {
                let str = JSON.stringify(scopeBoards);
                scopeBoardsResponse = zlib.deflateSync(str).toString('base64');
            }

            const { lowerBoundaryDate, upperBoundaryDate } = this.obeyaCalculation.computeBoundaries(obeyaRoom, obeyaData);
            const flowMetrics: PopulateResult = {
                contexts: obeyaContexts as Awaited<ReturnType<typeof this.obeyaCalculation.getContextsForObeya>>,
                lowerBoundaryDate,
                upperBoundaryDate,
                obeyaStart: obeyaRoom.beginDate,
                obeyaEnd: obeyaRoom.endDate,
            };

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    obeyaRoom,
                    objectives,
                    highlights,
                    individualContributors,
                    progressBoards,
                    scopeBoards: scopeBoardsResponse,
                    dependencies,
                    risks,
                    burnData,
                    predictiveAnalysis,
                    forecastingSettings,
                    roadmapResult,
                    focus,
                    flowMetrics
                }),
            };
        } catch (error) {
            console.log('getEverything obeyaHandler error', error);
            return {
                statusCode: 500,
                body: JSON.stringify(
                    (error as any).errors
                        ? (error as any).errors
                        : {
                            message:
                                (error as any).message ||
                                'Unknown error at obeya endpoint',
                        },
                ),
            };
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    return HandleEvent(event, ObeyaHandler);
};
