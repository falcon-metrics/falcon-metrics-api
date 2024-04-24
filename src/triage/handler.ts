import { asClass } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { Calculations } from './calculations';
import { State } from '../workitem/state_aurora';
import { BaseHandler } from '../common/base_handler';

class TriageHandler extends BaseHandler {
    private calculations: Calculations;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations),
            state: asClass(State),
        });

        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
    }

    async getEverything() {
        let response;

        try {
            response = await this.calculations.getTriageCount();
        } catch (e) {
            console.error('Failed: ' + e.message + '\n' + e.stack);
            return {
                statusCode: 400,
                body: JSON.stringify({ error: e.message }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(response),
        };
    }
}

export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return await new TriageHandler(event).getEverything();
};
