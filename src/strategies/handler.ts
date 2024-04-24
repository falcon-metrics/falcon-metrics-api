import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { HandleEvent } from '../common/event_handler';
import { IQueryFilters, QueryFilters } from '../common/filters_v2';
import { Calculations as StrategiesCalculations } from './calculations';
import { StrategyDbAurora } from './strategies_db_aurora';
import RelationshipsDbAurora from '../relationships/relationships_db_aurora';
import { ObeyaCalculation } from '../obeya/calculations';
import { State } from '../workitem/state_aurora';
import { ObeyaRoomsCalculations } from '../obeya/obeya_rooms/calculations';

class Strategies extends BaseHandler {
    readonly strategiesCalculations: StrategiesCalculations;
    readonly strategyDbAurora: StrategyDbAurora;
    readonly orgId: string;
    readonly filters: IQueryFilters;
    readonly obeyaCalculations: ObeyaCalculation;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            strategyDbAurora: asClass(StrategyDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
            strategiesCalculations: asClass(StrategiesCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            filters: asClass(QueryFilters, {
                lifetime: Lifetime.SCOPED,
            }),
            relationshipsDbAurora: asClass(RelationshipsDbAurora, {
                lifetime: Lifetime.SCOPED
            }),
            obeyaCalculations: asClass(ObeyaCalculation, {
                lifetime: Lifetime.SCOPED
            }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            obeyaRoomsCalculations: asClass(ObeyaRoomsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.strategiesCalculations = this.dependencyInjectionContainer.cradle.strategiesCalculations;
        this.strategyDbAurora = this.dependencyInjectionContainer.cradle.strategyDbAurora;
        this.orgId = this.dependencyInjectionContainer.cradle.security.organisation!;
        this.filters = this.dependencyInjectionContainer.cradle.filters;
        this.obeyaCalculations = this.dependencyInjectionContainer.cradle.obeyaCalculations;
    }

    async getEverything(
        event: APIGatewayProxyEventV2,
    ): Promise<{ statusCode: number; body: string; }> {
        const contextId = event.queryStringParameters?.contextId;
        const horizonId = event.queryStringParameters?.horizonId;
        console.log(this.filters.clientTimezone);
        try {
            /*
                Should list the stragegy stored by the current org level
            */
            const stragegy = await this.strategiesCalculations.getAllStrategies(
                contextId,
                horizonId,
            );

            if (stragegy[0]) {
                let strategyId = stragegy[0].id;
                if (typeof strategyId === 'string') {
                    strategyId = parseInt(strategyId, 10);
                }
                let okrs = [];
                if (strategyId) {
                    okrs = await this.strategiesCalculations.getOkrs(strategyId.toString());
                }
                stragegy[0].okrs = okrs;
            }
            return {
                statusCode: 200,
                body: JSON.stringify(stragegy),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in getAllStrategies',
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

    async getStrategyFromStrategicDriver(
        event: APIGatewayProxyEventV2,
    ): Promise<{ statusCode: number; body: string; }> {
        const parentStrategicDriverId = event?.pathParameters?.id as
            | string
            | undefined;

        if (!parentStrategicDriverId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: {
                        message: 'parentStrategicDriverId id is required',
                    },
                }),
            };
        }
        try {
            /*
                Should list the strategy stored by the current org level
            */
            const strategy = await this.strategiesCalculations.getStrategyFromStrategicDriver(
                parentStrategicDriverId,
            );

            return {
                statusCode: 200,
                body: JSON.stringify(strategy),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in getStrategyFromStrategicDriver',
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

    async getStrategy(
        event: APIGatewayProxyEventV2,
    ): Promise<{ statusCode: number; body: string; }> {
        const strategyId = event?.pathParameters?.id as string | undefined;

        if (!strategyId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Strategy id is required' },
                }),
            };
        }
        try {
            /*
                Should list the strategy stored by the current org level
            */
            const strategy = await this.strategiesCalculations.getStrategy(
                strategyId,
            );
            if (strategy[0]) {
                let strategyId = strategy[0].id;
                if (typeof strategyId === 'string') {
                    strategyId = parseInt(strategyId, 10);
                }
                let okrs = [];
                if (strategyId) {
                    okrs = await this.strategiesCalculations.getOkrs(strategyId.toString());
                }
                strategy[0].okrs = okrs;
            }
            return {
                statusCode: 200,
                body: JSON.stringify(strategy),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in getStrategy',
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

    private parseBody(body: string) {
        const payload = JSON.parse(body!);
        return payload;
    }

    async postStrategy({ body, requestContext }: APIGatewayProxyEventV2) {
        if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const strategy = this.parseBody(body!);
        delete strategy.id;

        const userId = requestContext?.authorizer?.jwt.claims.sub;
        if (!userId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Invalid user id in strategy request.' },
                }),
            };
        }

        try {
            const result = await this.strategiesCalculations.createStrategy(
                strategy,
            );
            return {
                statusCode: 200,
                body: JSON.stringify(result),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in post strategy',
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

    async removeStrategy(event: APIGatewayProxyEventV2) {
        if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const strategyId = event?.pathParameters?.id as string | undefined;

        if (!strategyId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'strategy id is required' },
                }),
            };
        }

        try {
            await this.strategiesCalculations.deleteStrategy(Number(strategyId));
            return {
                statusCode: 200,
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in remove strategy',
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

    async patchStrategy({ body }: APIGatewayProxyEventV2) {
        if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const strategyInfo = this.parseBody(body!);
        try {
            const strategies = await this.strategiesCalculations.getStrategy(
                strategyInfo.id,
            );

            const strategyItemWasFound = strategies.findIndex(
                (strategyInfoItem: any) =>
                    strategyInfoItem?.id.toString() === strategyInfo?.id?.toString(),
            );

            if (strategyItemWasFound > -1) {
                const result = await this.strategiesCalculations.updateStrategy(
                    strategyInfo,
                );
                return {
                    statusCode: 200,
                    body: JSON.stringify(result),
                };
            } else {
                return {
                    statusCode: 404,
                    body: JSON.stringify({
                        message: 'Strategy id not found.',
                    }),
                };
            }
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in patch Strategy',
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

    async getObjectivePreview(event: APIGatewayProxyEventV2,
    ): Promise<{ statusCode: number; body: string; }> {
        const objectiveId = event?.pathParameters?.objectiveId as string | undefined;

        if (!objectiveId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Strategy id is required' },
                }),
            };
        }
        try {
            /*
                Should list the strategy stored by the current org level
            */
            const strategy = await this.strategiesCalculations.getStrategyPreviewFromObjective(objectiveId);
            return {
                statusCode: 200,
                body: JSON.stringify(strategy),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in getObjectivePreview',
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

    async getkeyResultPreview(event: APIGatewayProxyEventV2,
    ): Promise<{ statusCode: number; body: string; }> {
        const keyResultId = event?.pathParameters?.keyResultId as string | undefined;

        if (!keyResultId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Strategy id is required' },
                }),
            };
        }
        try {
            /*
                Should list the strategy stored by the current org level
            */
            const strategy = await this.strategiesCalculations.getStrategyPreviewFromKeyResult(keyResultId);
            return {
                statusCode: 200,
                body: JSON.stringify(strategy),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in getKeyResultPreview',
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

    async getKeyResultProgress(event: APIGatewayProxyEventV2,
    ): Promise<{ statusCode: number; body: string; }> {
        const keyResultId = event?.pathParameters?.keyResultId as string | undefined;
        const timezone = this.filters.clientTimezone;

        if (!keyResultId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Strategy id is required' },
                }),
            };
        }

        if (!timezone) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Time zone is required' },
                }),
            };
        }
        try {
            /*
                Should list the strategy stored by the current org level
            */
            const strategy = await this.strategiesCalculations.getKeyResultProgress(keyResultId, timezone);
            return {
                statusCode: 200,
                body: JSON.stringify(strategy),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in getKeyResultPreview',
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
    return HandleEvent(event, Strategies);
};

export const getStrategy = async (event: APIGatewayProxyEventV2) => {
    return await new Strategies(event).getStrategy(event);
};

export const getStrategyFromStrategicDriver = async (
    event: APIGatewayProxyEventV2,
) => {
    return await new Strategies(event).getStrategyFromStrategicDriver(event);
};

export const postStrategy = async (event: APIGatewayProxyEventV2) => {
    return await new Strategies(event).postStrategy(event);
};

export const removeStrategy = async (event: APIGatewayProxyEventV2) => {
    return await new Strategies(event).removeStrategy(event);
};

export const patchStrategy = async (event: APIGatewayProxyEventV2) => {
    return await new Strategies(event).patchStrategy(event);
};

export const getObjectivePreview = async (event: APIGatewayProxyEventV2) => {
    return await new Strategies(event).getObjectivePreview(event);
};

export const getKeyResultPreview = async (event: APIGatewayProxyEventV2) => {
    return await new Strategies(event).getkeyResultPreview(event);
};

export const getKeyResultProgress = async (event: APIGatewayProxyEventV2) => {
    return await new Strategies(event).getKeyResultProgress(event);
};