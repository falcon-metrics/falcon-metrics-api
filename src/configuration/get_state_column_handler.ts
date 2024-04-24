import { asClass } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { Logger } from 'log4js';
import { BaseHandler } from '../common/base_handler';
import { State } from '../workitem/state_aurora';

export class StateColumnHandler extends BaseHandler {
    private logger: Logger;
    private state: State;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, { state: asClass(State) });
        this.state = this.dependencyInjectionContainer.cradle.state;
        this.logger = this.dependencyInjectionContainer.cradle.logger;
    }

    async getRows(columnName: string) {
        try {
            // eslint-disable-next-line
            const rows = await this.state.getDistinctRows(this.security.organisation!, columnName);
            return rows;

        } catch (e) {
            const error = {
                message: 'Error in getAssignees',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack
            };

            return {
                statusCode: 500,
                body: JSON.stringify(error),
            };
        }
    }
}

export const getAssignees = async (event: APIGatewayProxyEventV2) => {
    return new StateColumnHandler(event).getRows('assignedTo');
};

export const getResolution = async (event: APIGatewayProxyEventV2) => {
    return new StateColumnHandler(event).getRows('resolution');
};