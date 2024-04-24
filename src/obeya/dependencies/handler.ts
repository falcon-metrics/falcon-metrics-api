import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

import { BaseHandler } from '../../common/base_handler';
import Profile from '../../profile';
import { State } from '../../workitem/state_aurora';
import { ObeyaCalculation } from '../calculations';
import { ObeyaRoomsCalculations } from '../obeya_rooms/calculations';
import { AssociateWorkItemDependency, Calculations, DependencyItem } from './calculations';

type AssociateWorkItemDependenciesParams = APIGatewayProxyEventV2 & {
    queryStringParameters: {
        blockerContextId?: string;
        blockedContextId?: string;
        obeyaRoomId?: string;
    };
};

class DependenciesHandler extends BaseHandler {
    readonly calculations: Calculations;
    readonly obeyaRoomsCalculations: ObeyaRoomsCalculations;
    readonly obeyaCalculation: ObeyaCalculation;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            obeyaCalculation: asClass(ObeyaCalculation, {
                lifetime: Lifetime.SCOPED,
            }),
            calculations: asClass(Calculations, { lifetime: Lifetime.SCOPED }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            obeyaRoomsCalculations: asClass(ObeyaRoomsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.obeyaRoomsCalculations = this.dependencyInjectionContainer.cradle.obeyaRoomsCalculations;
        this.obeyaCalculation = this.dependencyInjectionContainer.cradle.obeyaCalculation;
        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
    }

    async getAssociateWorkitemDependencies(
        event: APIGatewayProxyEventV2,
    ): Promise<any> {
        /* allow any roles to access Governance Obeya
        if (!this.security.isGovernanceObeya()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        } */

        const { queryStringParameters } = event;
        if (
            !queryStringParameters?.blockerContextId ||
            !queryStringParameters?.blockedContextId
        ) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: {
                        message:
                            'The parameters blockerContextId and blockedContextId are required.',
                    },
                }),
            };
        }

        if (!queryStringParameters?.obeyaRoomId) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'Obeya Room Id is required' },
                }),
            };
        }

        try {
            const response: any[] = await this.calculations.getAllAssociateWorkItemDependency(
                queryStringParameters?.blockerContextId,
                queryStringParameters?.blockedContextId,
                queryStringParameters.obeyaRoomId,
            );

            return {
                statusCode: 200,
                body: JSON.stringify(response),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify((error as any).errors ? (error as any).errors : (error as any).message),
            };
        }
    }

    async saveAssociateWorkItemDependency(event: APIGatewayProxyEventV2) {
        if (!this.security.isGovernanceObeyaAdmin()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const payload: {
            roomId: string;
            dependencyId: string;
            associateWorkItemDependecies: AssociateWorkItemDependency[];
        } = event?.body
            ? JSON.parse(event?.body)
            : {
                  roomId: '',
                  dependencyId: '',
                  associateWorkItemDependecies: [],
              };
        try {
            if (!payload.roomId) {
                return {
                    statusCode: 422,
                    body: JSON.stringify({
                        error: { message: 'Obeya Room Id is required' },
                    }),
                };
            }

            const response = await this.calculations.saveBulkOfAssociateWorkItemDependency(
                payload.roomId,
                payload.dependencyId,
                payload.associateWorkItemDependecies,
            );
            return {
                statusCode: 201,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            console.log('error ==>', error);
            return {
                statusCode: 500,
                body: JSON.stringify(error),
            };
        }
    }

    async createOrUpdateDependency(event: APIGatewayProxyEventV2) {
        const dependency: DependencyItem = event?.body
            ? JSON.parse(event?.body)
            : {};

        if (!this.security.isGovernanceObeyaAdmin()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        if (!dependency.roomId) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'Obeya Room Id is required' },
                }),
            };
        }

        if (!event.requestContext.authorizer?.jwt) {
            return {
                statusCode: 401,
                body: JSON.stringify('Not Authorized'),
            };
        }

        try {
            const {
                requestContext: {
                    authorizer: { jwt },
                },
            } = event;
            const profile: { getUserInfo: () => any } = await Profile(
                jwt.claims.sub as string,
            );

            let dependencyWithUser = dependency;
            if (!dependency.dependencyId) {
                const userInfo = await profile.getUserInfo();
                dependencyWithUser = {
                    ...dependencyWithUser,
                    createdBy: userInfo?.data?.email || userInfo?.data?.name,
                };
            }
            const response = await this.calculations.saveDependency(
                dependencyWithUser,
            );

            return {
                statusCode: 201,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            console.log(error)
            return {
                statusCode: 500,
                body: JSON.stringify((error as any).errors ? (error as any).errors : (error as any).message),
            };
        }
    }

    async removeDependency(event: APIGatewayProxyEventV2) {
        if (!this.security.isGovernanceObeyaAdmin()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const dependencyId = event?.pathParameters?.id as string | undefined;

        if (!dependencyId) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'Dependency Id is required' },
                }),
            };
        }

        try {
            await this.calculations.deleteDependency(dependencyId);
            return {
                statusCode: 200,
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify((error as any).errors ? (error as any).errors : (error as any).message),
            };
        }
    }
}

export const createDependency = async (event: APIGatewayProxyEventV2) => {
    return new DependenciesHandler(event).createOrUpdateDependency(event);
};

export const updateDependency = async (event: APIGatewayProxyEventV2) => {
    return new DependenciesHandler(event).createOrUpdateDependency(event);
};

export const removeDependency = async (event: APIGatewayProxyEventV2) => {
    return new DependenciesHandler(event).removeDependency(event);
};

export const getAssociateWorkitemDependencies = async (
    event: APIGatewayProxyEventV2,
) => {
    return new DependenciesHandler(event).getAssociateWorkitemDependencies(
        event,
    );
};

export const saveAssociateWorkItemDependency = async (
    event: APIGatewayProxyEventV2,
) => {
    return new DependenciesHandler(event).saveAssociateWorkItemDependency(
        event,
    );
};
