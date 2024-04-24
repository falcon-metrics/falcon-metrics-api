import {
    asClass,
    Lifetime,
} from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

import { BaseHandler } from '../common/base_handler';
import { HandleEvent } from '../common/event_handler';
import {
    OrganizationSettings as OrganizationSettingsCalculations,
} from '../organization-settings/handleSettings';
import { Calculations as InsightsCalculations } from './calculations';
import { InsightsDbAurora } from './insights_db_aurora';
import { InsightItem } from './interfaces';

class InsightsHandler extends BaseHandler {
    readonly organisationsSettingsCalculations: OrganizationSettingsCalculations;
    readonly insightsCalculations: InsightsCalculations;
    readonly insightsDbAurora: InsightsDbAurora;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            organisationsSettingsCalculations: asClass(
                OrganizationSettingsCalculations,
                { lifetime: Lifetime.SCOPED },
            ),
            insightsDbAurora: asClass(InsightsDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
            insightsCalculations: asClass(InsightsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.organisationsSettingsCalculations = this.dependencyInjectionContainer.cradle.organisationsSettingsCalculations;
        this.insightsCalculations = this.dependencyInjectionContainer.cradle.insightsCalculations;
        this.insightsDbAurora = this.dependencyInjectionContainer.cradle.insightsDbAurora;
    }

    async getEverything(): Promise<
        InsightItem[] | { statusCode: number; body: string }
    > {
        try {
            const insights = await this.insightsCalculations.getInsights();
            return {
                statusCode: 200,
                body: JSON.stringify({
                    insights,
                }),
            };
        } catch (error) {
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

    async postInsightView({ body }: APIGatewayProxyEventV2) {
        const insightView = JSON.parse(body!);

        if (!insightView.context_id) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'context_id field is required' },
                }),
            };
        }
        try {
            const result = await this.insightsCalculations.createOrUpdateInsightsView(
                insightView,
            );
            return {
                statusCode: 200,
                body: JSON.stringify(result),
            };
        } catch (error) {
            const message =
                error instanceof Error && error.message
                    ? error.message
                    : 'Unknown error while creating/updating a Insight object';
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message }),
            };
        }
    }
}

export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, InsightsHandler);
};

export const postInsightView = async (event: APIGatewayProxyEventV2) => {
    return await new InsightsHandler(event).postInsightView(event);
};
