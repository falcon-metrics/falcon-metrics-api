import { APIGatewayProxyEventV2 } from "aws-lambda";
import { BaseHandler } from "../common/base_handler";
import MetricsDbAurora from "./metrics_db_aurora";
import { asClass, Lifetime } from "awilix";
import { HandleEvent } from "../common/event_handler";
import { DateTime } from "luxon";
import RelationshipsDbAurora from "../relationships/relationships_db_aurora";

class BusinessScorecardMetricsHandler extends BaseHandler {

    readonly metricsDbAurora: MetricsDbAurora;
    readonly orgId: string;
    readonly relationshipsDbAurora: RelationshipsDbAurora;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            metricsDbAurora: asClass(MetricsDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
            relationshipsDbAurora: asClass(RelationshipsDbAurora, {
                lifetime: Lifetime.SCOPED
            })
        });
        this.metricsDbAurora = this.dependencyInjectionContainer.cradle.metricsDbAurora;
        this.orgId = this.dependencyInjectionContainer.cradle.security.organisation!;
        this.relationshipsDbAurora = this.dependencyInjectionContainer.cradle.relationshipsDbAurora;
    }

    async getEverything(): Promise<
        { statusCode: number; body: string; }
    > {
        try {
            let metrics = await this.metricsDbAurora.getAllMetrics(this.orgId);
            metrics = metrics.map(metric => {
                return {
                    id: metric.metric_id,
                    name: metric.metric_name,
                    type: metric.metric_type,
                    lowerLimit: metric.lower_limit,
                    upperLimit: metric.upper_limit,
                    target: metric.target ?? undefined,
                    metricValues: metric.metric_values,
                    perspective: metric.perspective_id,
                    context: metric.context_id,
                    unit: metric.metric_unit,
                    trendDirection: metric.metric_trend_direction
                };
            });
            await Promise.all(metrics.map(async (metric) => {
                const relationshipCount = await this.relationshipsDbAurora.getRelationshipCount(metric.id, 'metric', this.orgId);
                metric.relationshipCount = relationshipCount;
            }));
            return {
                statusCode: 200,
                body: JSON.stringify(
                    metrics
                ),
            };
        } catch (error) {
            console.error(JSON.stringify({
                message: "Error in getMetrics",
                orgId: this.orgId,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async updateMetrics({ body }: APIGatewayProxyEventV2) {
        try {
            const requestData = JSON.parse(body || '');
            let elementsToUpdate = [];
             if (requestData.updateElements) {
                elementsToUpdate = requestData.updateElements.map((i: any) => {
                    return {
                        metric_id: i.id,
                        metric_name: i.name,
                        metric_type: i.type,
                        target: i.target,
                        lower_limit: i.lowerLimit,
                        upper_limit: i.upperLimit,
                        context_id: i.context,
                        perspective_id: i.perspective,
                        org_id: this.orgId,
                        createdAt: '',
                        metric_values: i.metricValues,
                        metric_unit: i.unit,
                        metric_trend_direction: i.trendDirection
                    };
                });
            }
            if (requestData.addElements) {
                elementsToUpdate = elementsToUpdate.concat(requestData.addElements.map((i: any) => {
                    return {
                        metric_id: i.id,
                        metric_name: i.name,
                        metric_type: i.type,
                        target: i.target,
                        lower_limit: i.lowerLimit,
                        upper_limit: i.upperLimit,
                        context_id: i.context,
                        perspective_id: i.perspective,
                        org_id: this.orgId,
                        createdAt: DateTime.now().toSQL(),
                        metric_values: i.metricValues,
                        metric_unit: i.unit,
                        metric_trend_direction: i.trendDirection
                    };
                }));
            }
            let updatedMetrics;
            if (elementsToUpdate && elementsToUpdate.length > 0) {
                updatedMetrics = await this.metricsDbAurora.updateMetrics(elementsToUpdate);
            }
            if (requestData.deleteElements) {
                await this.metricsDbAurora.removeMetrics(requestData.deleteElements);
                await Promise.all(requestData.deleteElements.map(async (metric: any) => {
                    const relationshipCount = await this.relationshipsDbAurora.removeRelationships(metric.id.toString(), 'metric', this.orgId);
                }));
            }
            return {
                statusCode: 200,
                body: JSON.stringify({
                    updatedMetrics
                }),
            };
        } catch (error) {
            console.error(JSON.stringify({
                message: "Error in updateMetrics",
                orgId: this.orgId,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async getMetric(event: APIGatewayProxyEventV2): Promise<
        { statusCode: number; body: string; }
    > {
        const metricId = event?.pathParameters?.metricId;
        if (!metricId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Metric id is required' },
                }),
            };
        }
        try {
            let metric = await this.metricsDbAurora.getMetric(metricId, this.orgId);
            let returnValue;
            if (metric) {
                returnValue = {
                    id: metric.metric_id,
                    name: metric.metric_name,
                    type: metric.metric_type,
                    lowerLimit: metric.lower_limit,
                    upperLimit: metric.upper_limit,
                    target: metric.target ?? undefined,
                    metricValues: metric.metric_values,
                    perspective: metric.perspective_id,
                    context: metric.context_id,
                    unit: metric.metric_unit,
                    trendDirection: metric.metric_trend_direction
                };
            } else {
                returnValue = {};
            }

            return {
                statusCode: 200,
                body: JSON.stringify(
                    returnValue
                ),
            };
        } catch (error) {
            console.error(JSON.stringify({
                message: "Error in getMetric",
                orgId: this.orgId,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }
}

export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, BusinessScorecardMetricsHandler);
};

export const updateMetrics = async (event: APIGatewayProxyEventV2) => {
    return await new BusinessScorecardMetricsHandler(event).updateMetrics(event);
};

export const getMetric = async (event: APIGatewayProxyEventV2) => {
    return await new BusinessScorecardMetricsHandler(event).getMetric(event);
};