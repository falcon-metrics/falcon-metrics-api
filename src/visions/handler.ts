import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { HandleEvent } from '../common/event_handler';
import { IQueryFilters, QueryFilters } from '../common/filters_v2';
import { Calculations as VisionsCalculations } from './calculations';
import { Calculations as StrategiesCalculations } from '../strategies/calculations';
import { StrategyDbAurora } from '../strategies/strategies_db_aurora';
import { VisionsDbAurora } from './visions_db_aurora';
import RelationshipsDbAurora from '../relationships/relationships_db_aurora';
import { ObeyaCalculation } from '../obeya/calculations';
import { State } from '../workitem/state_aurora';
import { ObeyaRoomsCalculations } from '../obeya/obeya_rooms/calculations';
import { HorizonItem } from '../strategies/interfaces';

class Visions extends BaseHandler {
    readonly visionsCalculations: VisionsCalculations;
    readonly visionsDbAurora: VisionsDbAurora;
    readonly orgId: string;
    readonly filters: IQueryFilters;
    readonly strategiesCalculations: StrategiesCalculations;
    readonly strategyDbAurora: StrategyDbAurora;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            visionsDbAurora: asClass(VisionsDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
            strategyDbAurora: asClass(StrategyDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
            visionsCalculations: asClass(VisionsCalculations, {
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
            state: asClass(State, {
                lifetime: Lifetime.SCOPED
            }),
            obeyaRoomsCalculations: asClass(ObeyaRoomsCalculations, {
                lifetime: Lifetime.SCOPED
            })
        });
        this.strategiesCalculations = this.dependencyInjectionContainer.cradle.strategiesCalculations;
        this.strategyDbAurora = this.dependencyInjectionContainer.cradle.strategyDbAurora;
        this.visionsCalculations = this.dependencyInjectionContainer.cradle.visionsCalculations;
        this.visionsDbAurora = this.dependencyInjectionContainer.cradle.visionsDbAurora;
        this.orgId = this.dependencyInjectionContainer.cradle.security.organisation!;
        this.filters = this.dependencyInjectionContainer.cradle.filters;
    }

    async getAllHorizons(): Promise<{ statusCode: number; body: string; }> {
        try {
            const horizons: HorizonItem[] = await this.visionsCalculations.getAllHorizons();
            return {
                statusCode: 200,
                body: JSON.stringify(horizons),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in getAllHorizons',
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

    async getEverything(): Promise<{ statusCode: number; body: string; }> {
        try {
            /*
                Should list the vision stored by the current org level
            */
            const vision = await this.visionsCalculations.getAllVisions();

            return {
                statusCode: 200,
                body: JSON.stringify(vision),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in getAllVisions',
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


    async getVision(
        event: APIGatewayProxyEventV2,
    ): Promise<{ statusCode: number; body: string; }> {
        const visionId = event?.pathParameters?.id as string | undefined;

        if (!visionId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Vision id is required' },
                }),
            };
        }
        try {
            /*
                Should list the vision stored by the current org level
            */
            const vision = await this.visionsCalculations.getVision(visionId);

            return {
                statusCode: 200,
                body: JSON.stringify(vision),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in getVision',
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
        const payload = JSON.parse(body!);
        return payload;
    }

    async postVision({ body, requestContext }: APIGatewayProxyEventV2) {
        if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const vision = this.parseBody(body!);
        delete vision.id;

        const userId = requestContext?.authorizer?.jwt.claims.sub;
        if (!userId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Invalid user id in vision request.' },
                }),
            };
        }

        try {
            const result = await this.visionsCalculations.createVision(vision);
            return {
                statusCode: 200,
                body: JSON.stringify(result),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in post vision',
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

    async removeVision(event: APIGatewayProxyEventV2) {
        if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const visionId = event?.pathParameters?.id as string | undefined;

        if (!visionId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'vision id is required' },
                }),
            };
        }

        try {
            await this.visionsCalculations.deleteVision(Number(visionId));
            return {
                statusCode: 200,
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in remove vision',
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

    async patchVision({ body }: APIGatewayProxyEventV2) {
        if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const visionPayload = this.parseBody(body!);
        try {
            const visions = await this.visionsCalculations.getVision(
                visionPayload.id,
            );

            const findResult = visions.find(
                (visionItem: any) =>
                    visionItem?.id.toString() === visionPayload?.id?.toString(),
            );

            if (findResult) {
                const result = await this.visionsCalculations.updateVision(
                    visionPayload,
                );
                return {
                    statusCode: 200,
                    body: JSON.stringify(result),
                };
            } else {
                return {
                    statusCode: 404,
                    body: JSON.stringify({
                        message: 'Vision id not found.',
                    }),
                };
            }
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in patchVision',
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
    return HandleEvent(event, Visions);
};

export const getAllHorizons = async (event: APIGatewayProxyEventV2) => {
    return await new Visions(event).getAllHorizons();
};

export const getVision = async (event: APIGatewayProxyEventV2) => {
    return await new Visions(event).getVision(event);
};

export const postVision = async (event: APIGatewayProxyEventV2) => {
    return await new Visions(event).postVision(event);
};

export const removeVision = async (event: APIGatewayProxyEventV2) => {
    return await new Visions(event).removeVision(event);
};

export const patchVision = async (event: APIGatewayProxyEventV2) => {
    return await new Visions(event).patchVision(event);
};