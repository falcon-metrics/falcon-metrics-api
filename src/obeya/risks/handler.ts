import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

import { BaseHandler } from '../../common/base_handler';
import Profile from '../../profile';
import { State } from '../../workitem/state_aurora';
import { Calculations } from './calculations';
import { RiskItem } from './types';

class RisksHandler extends BaseHandler {
    readonly calculations: Calculations;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations, { lifetime: Lifetime.SCOPED }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
        });
        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
    }

    async createOrUpdateRisk(event: APIGatewayProxyEventV2) {
        const risk: RiskItem = event?.body ? JSON.parse(event?.body) : {};

        try {
            if (!this.security.isGovernanceObeyaAdmin()) {
                return {
                    statusCode: 403,
                    body: JSON.stringify({ error: { message: 'Forbidden' } }),
                };
            }

            if (!risk.roomId) {
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

            const {
                requestContext: {
                    authorizer: { jwt },
                },
            } = event;
            const profile: { getUserInfo: () => any } = await Profile(
                jwt.claims.sub as string,
            );

            let riskWithUser = risk;
            if (!risk.riskId) {
                const userInfo = await profile.getUserInfo();
                riskWithUser = {
                    ...riskWithUser,
                    createdBy: userInfo?.data?.email || userInfo?.data?.name,
                };
            }
            const response = await this.calculations.createOrUpdate(
                riskWithUser,
            );
            return {
                statusCode: 201,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors
                        ? (error as any).errors
                        : error instanceof Error
                        ? error.message
                        : 'Unexpected error',
                ),
            };
        }
    }

    async removeRisk(event: APIGatewayProxyEventV2) {
        if (!this.security.isGovernanceObeyaAdmin()) {
            return {
                statusCode: 403,
                body: JSON.stringify({
                    error: {
                        message: 'Forbidden: you have no permission to remove',
                    },
                }),
            };
        }

        const riskId = event?.pathParameters?.id as string | undefined;

        if (!riskId) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'RiskId is required' },
                }),
            };
        }

        try {
            await this.calculations.deleteRisk(riskId);
            return {
                statusCode: 200,
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors
                        ? (error as any).errors
                        : error instanceof Error
                        ? error.message
                        : 'Unexpected error',
                ),
            };
        }
    }
}

export const createRisk = async (event: APIGatewayProxyEventV2) => {
    return new RisksHandler(event).createOrUpdateRisk(event);
};

export const updateRisk = async (event: APIGatewayProxyEventV2) => {
    return new RisksHandler(event).createOrUpdateRisk(event);
};

export const removeRisk = async (event: APIGatewayProxyEventV2) => {
    return new RisksHandler(event).removeRisk(event);
};
