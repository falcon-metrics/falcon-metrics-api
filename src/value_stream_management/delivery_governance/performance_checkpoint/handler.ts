import {
    asClass,
    Lifetime,
} from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

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
import { Calculations as WipCalculations } from '../../../wip/calculations';
import { Snapshot } from '../../../workitem/snapshot_db';
import { SnapshotQueries } from '../../../workitem/snapshot_queries';
import { State } from '../../../workitem/state_aurora';
import { Calculations } from './calculations';

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

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            organisationsSettingsCalculations: asClass(
                OrganizationSettingsCalculations,
                { lifetime: Lifetime.SCOPED },
            ),
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
            flowEfficiencyCalculations: asClass(FlowEfficiencyCalculations),
            snapshot: asClass(Snapshot),
            snapshotQueries: asClass(SnapshotQueries),
        });
        this.state = this.dependencyInjectionContainer.cradle.state;
        this.leadtimeCalculations = this.dependencyInjectionContainer.cradle.leadtimeCalculations;
        this.throughputCalculations = this.dependencyInjectionContainer.cradle.throughputCalculations;
        this.flowEfficiencyCalculations = this.dependencyInjectionContainer.cradle.flowEfficiencyCalculations;
        this.inventoryCalculations = this.dependencyInjectionContainer.cradle.inventoryCalculations;
        this.wipCalculations = this.dependencyInjectionContainer.cradle.wipCalculations;
        this.summaryCalculations = this.dependencyInjectionContainer.cradle.summaryCalculations;
        this.organisationsSettingsCalculations = this.dependencyInjectionContainer.cradle.organisationsSettingsCalculations;
        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        // Time Aggregation
        const aggregationParam: unknown =
            event.queryStringParameters?.aggregation;
        const aggregation: AggregationKey = parseAggregation(aggregationParam);

        try {
            // get all completed
            const allCompletedWorkItems = await this.calculations.getCompletedWorkItems();

            // calculate throughput variability
            const throughputPredicabilityPromise = this.calculations.calculateThroughputVariability(
                allCompletedWorkItems,
            );

            const completedByWeek = await this.calculations.getCompletedWorkItemsByWeek(
                allCompletedWorkItems,
            );

            // calculate productivity
            const productivityWidgetPromise = this.calculations.calculateProductivity(
                completedByWeek,
            );

            const percentile85thTeamLevel = this.calculations.getPercentile85thTeamLevel(
                allCompletedWorkItems,
            );

            const percentile85thPortfolioLevel = this.calculations.getPercentile85thPortfolioLevel(
                allCompletedWorkItems,
            );

            // calculate leadtime target met
            const targetMetPromise = this.calculations.calculateTargetMet(
                allCompletedWorkItems,
            );

            const leadtimePredicabilityPromise = this.leadtimeCalculations.getShapeOfLeadTimeDistribution();

            const flowEfficiencyWidgetPromise = this.calculations.getFlowEfficiencyForFitnessCriteria();

            const valueDemandItemsPromise = this.calculations.getValueDemand(
                allCompletedWorkItems,
            );

            const historicalValueDemandPromise = this.calculations.getValueDemandByAggregation(
                allCompletedWorkItems,
                aggregation,
            );

            const historicalViewOfTargetMetSLEPromise = this.calculations.calculateHistoricalViewToTargetMetAndSLE(
                aggregation,
                allCompletedWorkItems,
            );

            const [
                leadtimePredicability,
                valueDemandItems,
                targetMet,
                flowEfficiencyWidget,
                throughputPredicability,
                historicalValueDemand,
                historicalViewOfTargetMetSLE,
                productivityWidget,
            ] = await Promise.all([
                leadtimePredicabilityPromise,
                valueDemandItemsPromise,
                targetMetPromise,
                flowEfficiencyWidgetPromise,
                throughputPredicabilityPromise,
                historicalValueDemandPromise,
                historicalViewOfTargetMetSLEPromise,
                productivityWidgetPromise,
            ]);
            const leadTimePredicabilityValue = leadtimePredicability.split(' ')[0];

            return {
                statusCode: 200,
                body: JSON.stringify({
                    targetMet,
                    percentile85thTeam: percentile85thTeamLevel,
                    percentile85thPortfolio: percentile85thPortfolioLevel,
                    percentile85thChart:
                        historicalViewOfTargetMetSLE.percentile85thChart,
                    targetMetChart: historicalViewOfTargetMetSLE.targetMetChart,
                    productivityWidget,
                    throughputPredicability,
                    leadtimePredicability: leadTimePredicabilityValue,
                    valueDemandKpi: valueDemandItems,
                    historicalValueDemand,
                    ...flowEfficiencyWidget,
                }),
            };
        } catch (error) {
            console.log('fitness criteria error', error);
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors ? (error as any).errors : (
                        error instanceof Error ? error.message : 'Unknown error on fitness criteria'
                    )
                ),
            };
        }
    }
}

export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, FitnessCriteriaHandler);
};
