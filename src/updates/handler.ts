import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import * as yup from 'yup';
import { BaseHandler } from '../common/base_handler';
import { Calculations as UpdatesCalculations } from './calculations';
import { UpdatesAggregatedByTime } from './interfaces';
import { UpdatesDbAurora } from './updates_db_aurora';

class Updates extends BaseHandler {
    readonly updatesCalculations: UpdatesCalculations;
    readonly updatesDbAurora: UpdatesDbAurora;
    readonly orgId: string;

    /**
     * This should be in one of the utils files. Adding here for now. 
     */
    private isUUID(id: string | undefined) {
        if (!id) return false;
        const schema = yup.object().shape({
            uuid: yup.string().uuid()
        });
        const isValid = schema.isValidSync({ uuid: id });
        return isValid;
    }

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            updatesDbAurora: asClass(UpdatesDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
            updatesCalculations: asClass(UpdatesCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.updatesCalculations = this.dependencyInjectionContainer.cradle.updatesCalculations;
        this.updatesDbAurora = this.dependencyInjectionContainer.cradle.updatesDbAurora;
        this.orgId = this.dependencyInjectionContainer.cradle.security.organisation!;
    }

    async getEverything(
        event: APIGatewayProxyEventV2,
    ): Promise<{ statusCode?: number; body?: string; }> {
        try {
            const initiativeId = event.queryStringParameters?.initiativeId as
                | string
                | undefined;

            const updateType = event.queryStringParameters?.updateType as
                | string
                | undefined;

            if (!initiativeId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: { message: 'initiativeId is required' },
                    }),
                };
            }

            const updates: UpdatesAggregatedByTime = await this.updatesCalculations.getUpdates(
                initiativeId,
                updateType,
            );
            return {
                statusCode: 200,
                body: JSON.stringify(updates),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in updates.getEverything',
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
        const updateItem = JSON.parse(body!);
        return updateItem;
    }

    async getUpdateWithReplies(
        event: APIGatewayProxyEventV2,
    ): Promise<{ statusCode: number; body: string; }> {
        try {
            const updateId = event?.pathParameters?.id as string | undefined;

            const initiativeId = event.queryStringParameters?.initiativeId as
                | string
                | undefined;

            if (!initiativeId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: { message: 'initiativeId is required' },
                    }),
                };
            }

            if (!updateId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: { message: 'Update id is required' },
                    }),
                };
            }
            const updateWithReplies = await this.updatesCalculations.getReplies(
                updateId,
                initiativeId,
            );
            return {
                statusCode: 200,
                body: JSON.stringify({
                    updateWithReplies,
                }),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in updates.getUpdateWithReplies',
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

    async saveUpdateItem({ body }: APIGatewayProxyEventV2) {
        try {
            if (!body) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Body is required.' }),
                };
            }
            const updateInfo = this.parseBody(body);

            if (!updateInfo.id && this.isUUID(updateInfo.id)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'the body must have an id and it must be a valid uuid' }),
                };
            }

            const result = await this.updatesCalculations.saveUpdateItem({
                ...updateInfo,
            });
            return {
                statusCode: 200,
                body: JSON.stringify(result),
            };
        } catch (error) {
            const message =
                error instanceof Error && error.message
                    ? error.message
                    : 'Unknown error while saving a UpdateItem object';

            console.error(
                JSON.stringify({
                    message: 'Error in saveUpdateItem',
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

    async patchUpdateItem({ body, pathParameters }: APIGatewayProxyEventV2) {
        try {
            const id = pathParameters?.id;
            let errorMessage;
            if (!id) errorMessage = 'id is required in the path';
            if (!body) errorMessage = 'Body is required';
            if (!body || errorMessage) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: errorMessage }),
                };
            }
            const updateInfo = this.parseBody(body);

            const result = await this.updatesCalculations.patchUpdateItem({
                ...updateInfo,
                id
            });
            return {
                statusCode: 200,
                body: JSON.stringify(result),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in patchUpdateItem',
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

    async removeUpdateItem(event: APIGatewayProxyEventV2) {
        try {
            const updateId = event?.pathParameters?.id;
            if (!updateId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: { message: 'updateId is required' },
                    }),
                };
            }

            await this.updatesCalculations.deleteUpdateItem(updateId);
            return {
                statusCode: 200,
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in removeUpdateItem',
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
) => {
    return await new Updates(event).getEverything(event);
};

export const getUpdateWithReplies = async (event: APIGatewayProxyEventV2) => {
    return await new Updates(event).getUpdateWithReplies(event);
};

export const postUpdate = async (event: APIGatewayProxyEventV2) => {
    return await new Updates(event).saveUpdateItem(event);
};

export const patchUpdateItem = async (event: APIGatewayProxyEventV2) => {
    return await new Updates(event).patchUpdateItem(event);
};

export const removeUpdate = async (event: APIGatewayProxyEventV2) => {
    return await new Updates(event).removeUpdateItem(event);
};
