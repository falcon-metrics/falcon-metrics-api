import {
    asClass,
    Lifetime,
} from 'awilix';
import {
    APIGatewayProxyEventV2,
    ScheduledEvent,
} from 'aws-lambda';

import { BaseHandler } from '../common/base_handler';
import { HandleEvent } from '../common/event_handler';
import { ObeyaCalculation } from '../obeya/calculations';
import { ObeyaRoomsCalculations } from '../obeya/obeya_rooms/calculations';
import { State } from '../workitem/state_aurora';

class ObeyaLinkTypesHandler extends BaseHandler {
    readonly obeyaCalculation: ObeyaCalculation;
    
    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            obeyaCalculation: asClass(ObeyaCalculation, {
                lifetime: Lifetime.SCOPED,
            }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            obeyaRoomsCalculations: asClass(ObeyaRoomsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.obeyaCalculation = this.dependencyInjectionContainer.cradle.obeyaCalculation;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {
            /* allow any roles to access Governance Obeya
            if (!this.security.isGovernanceObeya()) {
                return {
                    statusCode: 403,
                    body: JSON.stringify({ error: { message: 'Forbidden' } }),
                };
            } */

            const obeyaRoomId = event.queryStringParameters?.obeyaRoomId;
            if (!obeyaRoomId) {
                return {
                    statusCode: 422,
                    body: JSON.stringify({
                        error: { message: 'Obeya Room Id is required' },
                    }),
                };
            }

            const obeyaLinkTypesPromise: string[] = await this.obeyaCalculation.getObeyaLinkTypes(obeyaRoomId); /// TODO: CHANGE THIS

            const [
                obeyaLinkTypes
            ] = await Promise.all([
                obeyaLinkTypesPromise
            ]);
            
            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    obeyaLinkTypes
                }),
            };
        } catch (error) {
            console.log('getEverything obeyaHandler error', error);
            return {
                statusCode: 500,
                body: JSON.stringify(
                    (error as any).errors
                        ? (error as any).errors
                        : {
                            message:
                                (error as any).message ||
                                'Unknown error at obeya endpoint',
                        },
                ),
            };
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    return HandleEvent(event, ObeyaLinkTypesHandler);
};
