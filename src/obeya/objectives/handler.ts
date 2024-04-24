import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

import { BaseHandler } from '../../common/base_handler';
import { ParentWorkItem } from '../../workitem/interfaces';
import { State } from '../../workitem/state_aurora';
import { ObeyaCalculation } from '../calculations';
import { ObeyaRoomsCalculations } from '../obeya_rooms/calculations';
import { ObjectiveCalculations, OKRObjective } from './calculations';

type WorkItemValidationError = {
    statusCode: number;
    body: string;
};

class ObjectivesHandler extends BaseHandler {
    private okrs: ObjectiveCalculations;
    private obeyaRoomIdFromQuery?: string;
    private obeyaCalculation: ObeyaCalculation;
    private obeyaRoomsCalculations: ObeyaRoomsCalculations;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            okrs: asClass(ObjectiveCalculations),
            state: asClass(State),
            obeyaCalculation: asClass(ObeyaCalculation, {
                lifetime: Lifetime.SCOPED,
            }),
            obeyaRoomsCalculations: asClass(ObeyaRoomsCalculations, {
                lifetime: Lifetime.SCOPED,
            })
        });

        this.obeyaRoomsCalculations =
            this.dependencyInjectionContainer.cradle.obeyaRoomsCalculations;
        this.obeyaCalculation =
            this.dependencyInjectionContainer.cradle.obeyaCalculation;
        this.okrs = this.dependencyInjectionContainer.cradle.okrs;
        if (
            event.queryStringParameters &&
            event.queryStringParameters['obeyaRoomId']
        )
            this.obeyaRoomIdFromQuery =
                event.queryStringParameters['obeyaRoomId'];
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        // if (!this.security.isGovernanceObeyaAdmin()) {
        //     return {
        //         statusCode: 403,
        //         body: JSON.stringify({ error: { message: 'Forbidden' } }),
        //     };
        // }

        const obeyaRoomId = event.queryStringParameters?.obeyaRoomId;
        if (!obeyaRoomId) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'obeya room id is required' },
                }),
            };
        }

        try {
            const obeyaData = await this.obeyaCalculation.getSavedObeyaData(
                obeyaRoomId,
            );

            const OKRs = await this.okrs.getAllObjectives(
                this.obeyaRoomIdFromQuery || '',
                obeyaData,
            );
            return {
                statusCode: 200,
                body: JSON.stringify({ OKRs: OKRs || [] }),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify(
                    (error as any).errors
                        ? (error as any).errors
                        : {
                            message:
                                (error as any).message ||
                                'Unknown error at objectives handler',
                        },
                ),
            };
        }
    }

    async postOrPatchOKR({ body, requestContext }: APIGatewayProxyEventV2) {
        if (!this.security.isGovernanceObeyaAdmin()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const objective = JSON.parse(body!) as OKRObjective;

        if (objective !== null) {
            console.log('objective...', objective.keyResults![0].linkTypes);
        }
        let okrs;
        try {
            if (requestContext.http.method.toUpperCase() === 'POST') {
                okrs = await this.okrs.createOkr(objective);
            }
            if (requestContext.http.method.toUpperCase() === 'PATCH') {
                okrs = await this.okrs.updateOkr(objective);
            }
            return {
                statusCode: 200,
                body: JSON.stringify(okrs),
            };
        } catch (error) {
            const message =
                error instanceof Error && error.message
                    ? error.message
                    : `Unknown error while creating/updating a OKR object`;
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message }),
            };
        }
    }

    async deleteOKR({ body }: APIGatewayProxyEventV2) {
        if (!this.security.isGovernanceObeyaAdmin()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const objective = JSON.parse(body!) as OKRObjective;

        try {
            await this.okrs.deleteOKR(objective);
            return {
                statusCode: 200,
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: (error as any).message }),
            };
        }
    }

    async searchParentWorkitems(
        event: APIGatewayProxyEventV2,
    ): Promise<Array<ParentWorkItem> | WorkItemValidationError> {
        /* allow any roles to access Governance Obeya
        if (!this.security.isGovernanceObeya()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        } */

        const workItemId = event.queryStringParameters?.workItemId;
        const obeyaRoomId = event.queryStringParameters?.obeyaRoomId;
        if (!obeyaRoomId) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'obeyaRoomId is required' },
                }),
            };
        }

        try {
            if (!workItemId) {
                return {
                    statusCode: 422,
                    body: JSON.stringify({
                        error: { message: 'WorkItemId is required' },
                    }),
                };
            }

            const resultSearch: Array<ParentWorkItem> =
                await this.obeyaCalculation.findParentWorkItems(
                    obeyaRoomId,
                    workItemId,
                );
            return {
                statusCode: 200,
                body: JSON.stringify(resultSearch),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: (error as any).message }),
            };
        }
    }
}

export const searchParentWorkitems = async (event: APIGatewayProxyEventV2) => {
    return await new ObjectivesHandler(event).searchParentWorkitems(event);
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return await new ObjectivesHandler(event).getEverything(event);
};

export const postOrPatchOKR = async (event: APIGatewayProxyEventV2) => {
    return await new ObjectivesHandler(event).postOrPatchOKR(event);
};

export const deleteOKR = async (event: APIGatewayProxyEventV2) => {
    return await new ObjectivesHandler(event).deleteOKR(event);
};