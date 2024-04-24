import {
    asClass,
    Lifetime,
} from 'awilix';
import {
    APIGatewayProxyEventV2,
    ScheduledEvent,
} from 'aws-lambda';

import { BaseHandler } from '../../common/base_handler';
import { HandleEvent } from '../../common/event_handler';
import { State } from '../../workitem/state_aurora';
import { ObeyaCalculation } from '../calculations';
import { ObeyaRoomsCalculations } from '../obeya_rooms/calculations';
import { ObjectiveCalculations } from '../objectives/calculations';

class ContextHandler extends BaseHandler {
    readonly calculations: ObeyaCalculation;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(ObeyaCalculation, {
                lifetime: Lifetime.SCOPED,
            }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            objectivesCalculations: asClass(ObjectiveCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            obeyaRoomsCalculations: asClass(ObeyaRoomsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {
            // if (!this?.security.isGovernanceObeya()) {
            //     return {
            //         statusCode: 403,
            //         body: JSON.stringify({ error: { message: 'Forbidden' } }),
            //     };
            // }

            const contexts = await this.calculations.getContextsForObeya();

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ contexts }),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify(error.errors),
            };
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    return HandleEvent(event, ContextHandler);
};
