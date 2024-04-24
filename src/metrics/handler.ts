import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { HandleEvent } from '../common/event_handler';
import { Calculations as MetricsCalculations } from './calculations';
import { MetricsDbAurora } from './metrics_db_aurora';
import { GetResponse } from './interfaces';

class Metrics extends BaseHandler {
    readonly metricsCalculations: MetricsCalculations;
    readonly metricsDbAurora: MetricsDbAurora;
    readonly orgId: string;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            metricsDbAurora: asClass(MetricsDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
            metricsCalculations: asClass(MetricsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.metricsCalculations = this.dependencyInjectionContainer.cradle.metricsCalculations;
        this.metricsDbAurora = this.dependencyInjectionContainer.cradle.metricsDbAurora;
        this.orgId = this.dependencyInjectionContainer.cradle.security.organisation!;
    }

    async getEverything(): Promise<
        GetResponse | { statusCode: number; body: string; }
    > {
        try {

            /*
                Should list the metricsConfig stored by the current org level
            */
            let savedMetrics = await this.metricsCalculations.getMetrics();

            const emptySavedMetric = {
                orgId: this.orgId,
                metrics: [],
                customViews: [],
            };
            if (!savedMetrics) {
                savedMetrics = emptySavedMetric;
            }

            /*
                Should provide the default custom_views names to be displayed on Custom Views settings
            */
            const defaultCustomViews = await this.metricsCalculations.getFiltersWithIds();

            return {
                statusCode: 200,
                body: JSON.stringify({
                    savedMetrics,// stored active metric and custom view configs
                    defaultCustomViews,
                }),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in metrics.getEverything',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors
                        ? (error as any).errors
                        : error instanceof Error
                            ? error.message
                            : 'Internal Server Error',
                ),
            };
        }
    }

    private parseBody(body: string) {
        const checkpointView = JSON.parse(body!);
        return checkpointView;
    }

    async postMetric({ body }: APIGatewayProxyEventV2) {
        if (!body) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Body is required' },
                }),
            };
        }
        const parsedBody = this.parseBody(body);
        if (!parsedBody.metrics) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'metrics field is required' },
                }),
            };
        }

        try {
            const result = await this.metricsCalculations.createOrUpdateMetric(parsedBody);
            return {
                statusCode: 200,
                body: JSON.stringify(result),
            };
        } catch (error) {
            const message =
                error instanceof Error && error.message
                    ? error.message
                    : 'Unknown error while creating a Metric object';

            console.error(
                JSON.stringify({
                    message: 'Error in postMetric',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify({ message }),
            };
        }
    }

    async removeMetric(event: APIGatewayProxyEventV2) {
        const metricId = event?.pathParameters?.id as string | undefined;

        if (!metricId) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'metricId is required' },
                }),
            };
        }

        try {
            await this.metricsCalculations.deleteMetric(metricId);
            return {
                statusCode: 200,
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in removeMetric',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyEventV2> => {
    return HandleEvent(event, Metrics);
};

export const postMetric = async (event: APIGatewayProxyEventV2) => {
    return await new Metrics(event).postMetric(event);
};

export const removeMetric = async (event: APIGatewayProxyEventV2) => {
    return await new Metrics(event).removeMetric(event);
};
