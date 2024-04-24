import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { Calculations } from './calculations';
import { InsightsResults } from './pattern_matcher';

export class ActionableInsightsHandler extends BaseHandler {
    readonly calculations: Calculations;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations, { lifetime: Lifetime.SCOPED }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
    }

    async getEverything() {
        let response: InsightsResults;
        try {
            response = await this.calculations.getResponse();
            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (err) {
            console.error('Error at ActionableInsights endpoint', err);
            return {
                statusCode: 500,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    message: (err instanceof Error) ? err.message : 'Unknown error'
                }),
            };
        }
    }
}

export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, ActionableInsightsHandler);
};
