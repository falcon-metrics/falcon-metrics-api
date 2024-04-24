import {
    asClass,
    Lifetime,
} from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
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
import { Calculations as WipCalculations } from '../../../wip/calculations';
import { Snapshot } from '../../../workitem/snapshot_db';
import { SnapshotQueries } from '../../../workitem/snapshot_queries';
import { State } from '../../../workitem/state_aurora';
import {
    Calculations as ContinuousImprovementsCalculations,
} from '../../continuous_improvements/flow_analysis/calculations';
import {
    Calculations as FlowItemsCalculations,
} from '../../delivery_management/flow_items/calculations';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { Calculations as RealCalculations } from './calculations';
import { handleQuery } from '../../../common/query_handler';

class FitnessCriteriaHandler extends BaseHandler {
    readonly state: State;
    readonly leadtimeCalculations: LeadTimeCalculations;
    readonly throughputCalculations: ThroughputCalculations;
    readonly continuousImprovementsCalculations: ContinuousImprovementsCalculations;
    readonly flowItemsCalculations: FlowItemsCalculations;
    readonly inventoryCalculations: InventoryCalculations;
    readonly wipCalculations: WipCalculations;
    readonly summaryCalculations: SummaryCalculations;
    readonly organisationsSettingsCalculations: OrganizationSettingsCalculations;
    readonly calculations: RealCalculations;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            organisationsSettingsCalculations: asClass(OrganizationSettingsCalculations, {
                lifetime: Lifetime.SCOPED
            }),
            leadtimeCalculations: asClass(LeadTimeCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            continuousImprovementsCalculations: asClass(ContinuousImprovementsCalculations, {
                lifetime: Lifetime.SCOPED
            }),
            flowItemsCalculations: asClass(FlowItemsCalculations, {
                lifetime: Lifetime.SCOPED
            }),
            wipCalculations: asClass(WipCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            summaryCalculations: asClass(SummaryCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            fitnessCriteriaCalculations: asClass(RealCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            inventoryCalculations: asClass(InventoryCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            throughputCalculations: asClass(ThroughputCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            snapshot: asClass(Snapshot, {
                lifetime: Lifetime.SCOPED,
            }),
            snapshotQueries: asClass(SnapshotQueries, {
                lifetime: Lifetime.SCOPED,
            }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.state = this.dependencyInjectionContainer.cradle.state;
        this.leadtimeCalculations = this.dependencyInjectionContainer.cradle.leadtimeCalculations;
        this.throughputCalculations = this.dependencyInjectionContainer.cradle.throughputCalculations;
        this.continuousImprovementsCalculations = this.dependencyInjectionContainer.cradle.continuousImprovementsCalculations;
        this.flowItemsCalculations = this.dependencyInjectionContainer.cradle.flowItemsCalculations;
        this.inventoryCalculations = this.dependencyInjectionContainer.cradle.inventoryCalculations;
        this.wipCalculations = this.dependencyInjectionContainer.cradle.wipCalculations;
        this.summaryCalculations = this.dependencyInjectionContainer.cradle.summaryCalculations;
        this.organisationsSettingsCalculations = this.dependencyInjectionContainer.cradle.organisationsSettingsCalculations;
        this.calculations = this.dependencyInjectionContainer.cradle.fitnessCriteriaCalculations;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {
            // Prefetch the cached work item list
            const completedWorkItemList = await this.calculations.getCachedCompletedWorkItemList();

            // If there are no completed work items then there is no data on this endpoint
            if (completedWorkItemList.length === 0) {
                return {
                    statusCode: 200,
                    body: JSON.stringify({}),
                };
            }

            let response: any = {};
            if (event.queryStringParameters && event.queryStringParameters['query']) {
                const requestedItems = event.queryStringParameters['query'].split(',');
                const config: any = {
                    'speed': this.calculations.getSpeed(),
                    'serviceLevelExpectation': this.calculations.getServiceLevelExpectation(),
                    'predictability': this.calculations.getPredictability(),
                    'productivity': this.calculations.getProductivity(),
                    'customerValue': this.calculations.getCustomerValue(),
                    'flowEfficiency': this.calculations.getFlowEfficiency(),
                    'widgetInformation': this.calculations.getWidgetInformation()
                };
                // const promises = requestedItems.map(async (q: any) => {
                //     if (Object.keys(config).includes(q)) {
                //         response[q] = await config[q];
                //     } else {
                //         throw new Error("Unhandled query value.");
                //     }
                // });
                // const results = await Promise.all(promises);
                response = await handleQuery(config, requestedItems);
            } else {
                const [
                    speed,
                    serviceLevelExpectation,
                    predictability,
                    productivity,
                    customerValue,
                    flowEfficiency,
                    widgetInformation
                ] = await Promise.all([
                    this.calculations.getSpeed(),
                    this.calculations.getServiceLevelExpectation(),
                    this.calculations.getPredictability(),
                    this.calculations.getProductivity(),
                    this.calculations.getCustomerValue(),
                    this.calculations.getFlowEfficiency(),
                    this.calculations.getWidgetInformation()
                ]);

                response = {
                    speed,
                    serviceLevelExpectation,
                    predictability,
                    productivity,
                    customerValue,
                    flowEfficiency,
                    widgetInformation,
                };
            }
            return {
                statusCode: 200,
                body: JSON.stringify(response),
            };
        } catch (error) {
            console.log('Fitness Criteria Endpoint Error');
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: 'Internal server error'
                })
            };
        }
    }
}

export class FlowEfficiencyHistoryHandler extends BaseHandler {
    readonly calculations: RealCalculations;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            organisationsSettingsCalculations: asClass(OrganizationSettingsCalculations, {
                lifetime: Lifetime.SCOPED
            }),
            leadtimeCalculations: asClass(LeadTimeCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            continuousImprovementsCalculations: asClass(ContinuousImprovementsCalculations, {
                lifetime: Lifetime.SCOPED
            }),
            flowItemsCalculations: asClass(FlowItemsCalculations, {
                lifetime: Lifetime.SCOPED
            }),
            wipCalculations: asClass(WipCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            summaryCalculations: asClass(SummaryCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            fitnessCriteriaCalculations: asClass(RealCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            inventoryCalculations: asClass(InventoryCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            throughputCalculations: asClass(ThroughputCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            snapshot: asClass(Snapshot, {
                lifetime: Lifetime.SCOPED,
            }),
            snapshotQueries: asClass(SnapshotQueries, {
                lifetime: Lifetime.SCOPED,
            }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.calculations = this.dependencyInjectionContainer.cradle.fitnessCriteriaCalculations;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {
            const flowEfficiency = await this.calculations.getFlowEfficiencyOverTime();

            const response = {
                flowEfficiency,
            };

            return {
                statusCode: 200,
                body: JSON.stringify(response),
            };
        } catch (error) {
            console.log('Fitness Criteria Endpoint Error');
            console.error(
                {
                    message: 'getFlowEfficiencyOverTime error',
                    errorMessage: (error as Error).message,
                    stack: (error as Error).stack,
                });
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal server error' })
            };
        }
    }
}


export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, FitnessCriteriaHandler);
};

export const flowEfficiencyHistory = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, FlowEfficiencyHistoryHandler);
};

