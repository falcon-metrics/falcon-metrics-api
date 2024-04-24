import {
    asClass,
    Lifetime,
} from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { uniqBy } from 'lodash';

import {
    AggregationKey,
    parseAggregation,
} from '../../../common/aggregation';
import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
import {
    Calculations as FlowEfficiencyCalculations,
} from '../../../flow_efficiency/calculations';
import {
    Calculations as InventoryCalculations,
} from '../../../inventory/calculations';
import {
    Calculations as LeadTimeCalculations,
} from '../../../leadtime/calculations';
import {
    OrganizationSettings as OrganizationSettingsCalculations,
} from '../../../organization-settings/handleSettings';
import {
    Calculations as SummaryCalculations,
} from '../../../summary/calculations';
import {
    Calculations as ThroughputCalculations,
} from '../../../throughput/calculations';
import {
    Calculations as WipCalculations,
} from '../../../wip/calculations';
import { StateItem } from '../../../workitem/interfaces';
import { Snapshot } from '../../../workitem/snapshot_db';
import { SnapshotQueries } from '../../../workitem/snapshot_queries';
import { State, StateCategory } from '../../../workitem/state_aurora';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { Calculations as Calculations, WidgetProjectItems } from './calculations';
import { handleQuery } from '../../../common/query_handler';


class FitnessCriteriaHandler extends BaseHandler {
    readonly state: State;
    readonly leadtimeCalculations: LeadTimeCalculations;
    readonly throughputCalculations: ThroughputCalculations;
    readonly flowEfficiencyCalculations: FlowEfficiencyCalculations;
    readonly inventoryCalculations: InventoryCalculations;
    readonly wipCalculations: WipCalculations;
    readonly summaryCalculations: SummaryCalculations;
    readonly organisationsSettingsCalculations: OrganizationSettingsCalculations;
    readonly calculations: Calculations;
    readonly snapshotQueries: SnapshotQueries;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            state: asClass(State, {
                lifetime: Lifetime.SCOPED
            }),
            snapshot: asClass(Snapshot, {
                lifetime: Lifetime.SCOPED,
            }),
            snapshotQueries: asClass(SnapshotQueries, {
                lifetime: Lifetime.SCOPED,
            }),
            organisationsSettingsCalculations: asClass(OrganizationSettingsCalculations, {
                lifetime: Lifetime.SCOPED
            }),
            leadtimeCalculations: asClass(LeadTimeCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            wipCalculations: asClass(WipCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            summaryCalculations: asClass(SummaryCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            calculations: asClass(Calculations, {
                lifetime: Lifetime.SCOPED,
            }),
            inventoryCalculations: asClass(InventoryCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            throughputCalculations: asClass(ThroughputCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            flowEfficiencyCalculations: asClass(FlowEfficiencyCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.state = this.dependencyInjectionContainer.cradle.state;
        this.snapshotQueries = this.dependencyInjectionContainer.cradle.snapshotQueries;
        this.leadtimeCalculations = this.dependencyInjectionContainer.cradle.leadtimeCalculations;
        this.throughputCalculations = this.dependencyInjectionContainer.cradle.throughputCalculations;
        this.flowEfficiencyCalculations = this.dependencyInjectionContainer.cradle.flowEfficiencyCalculations;
        this.inventoryCalculations = this.dependencyInjectionContainer.cradle.inventoryCalculations;
        this.wipCalculations = this.dependencyInjectionContainer.cradle.wipCalculations;
        this.summaryCalculations = this.dependencyInjectionContainer.cradle.summaryCalculations;
        this.organisationsSettingsCalculations = this.dependencyInjectionContainer.cradle.organisationsSettingsCalculations;
        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {
            // Prefetch the cached work item list
            const [
                proposedWorkItems,
                inProgressWorkItems,
                completedWorkItems,
            ] = await Promise.all([
                this.calculations.getCachedWorkItemByStateCategory(StateCategory.PROPOSED),
                this.calculations.getCachedWorkItemByStateCategory(StateCategory.INPROGRESS),
                this.calculations.getCachedWorkItemByStateCategory(StateCategory.COMPLETED),
            ]);

            // If there are no work items then there is no data on this endpoint
            if (proposedWorkItems.length === 0 && inProgressWorkItems.length === 0 && completedWorkItems.length === 0) {
                return {
                    statusCode: 200,
                    body: JSON.stringify({}),
                };
            }

            let response = {};
            if (event.queryStringParameters && event.queryStringParameters['query']) {
                const requestedItems = event.queryStringParameters['query'].split(',');
                const config: any = {
                    'targetWip': this.calculations.getTargetWip(),
                    'staleWork': this.calculations.getStaleWork(),
                    'blockers': this.calculations.getBlockers(),
                    'discardedBeforeStart': this.calculations.getDiscardedBeforeStart(),
                    'discardedAfterStart': this.calculations.getDiscardedAfterStart(),
                    'flowDebt': this.calculations.getFlowDebt(),
                    'delayedItems': this.calculations.getDelayedItems(),
                    'keySourcesOfDelay': this.calculations.getTopWaitSteps(),
                    'widgetInformation': this.calculations.getWidgetInformation()
                };
                response = await handleQuery(config, requestedItems);

            } else {
                const [
                    targetWip,
                    staleWork,
                    blockers,
                    discardedBeforeStart,
                    discardedAfterStart,
                    flowDebt,
                    delayedItems,
                    keySourcesOfDelay,
                    widgetInformation
                ] = await Promise.all([
                    this.calculations.getTargetWip(),
                    this.calculations.getStaleWork(),
                    this.calculations.getBlockers(),
                    this.calculations.getDiscardedBeforeStart(),
                    this.calculations.getDiscardedAfterStart(),
                    this.calculations.getFlowDebt(),
                    this.calculations.getDelayedItems(),
                    this.calculations.getTopWaitSteps(),
                    this.calculations.getWidgetInformation()
                ]);

                response = {
                    targetWip,
                    staleWork,
                    blockers,
                    discardedBeforeStart,
                    discardedAfterStart,
                    flowDebt,
                    delayedItems,
                    keySourcesOfDelay,
                    widgetInformation,
                };
            }
            return {
                statusCode: 200,
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
}

export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, FitnessCriteriaHandler);
};
