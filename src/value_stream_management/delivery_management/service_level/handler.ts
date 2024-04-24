import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';

import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
import { isValidPerspective } from '../../../common/perspectives';
import { WidgetInformation, WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { State } from '../../../workitem/state_aurora';
import { Calculations, ServiceLevelData } from './calculations';

class ServiceLevelHandler extends BaseHandler {
    readonly calculations: Calculations;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations, {
                lifetime: Lifetime.SCOPED,
            }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {
            const { perspective } = event.queryStringParameters || {};

            if (!isValidPerspective(perspective)) {
                return {
                    statusCode: 422,
                    body: JSON.stringify({
                        error: {
                            message: 'Valid perspective parameter required.',
                        },
                    }),
                };
            }

            const calcs = this.calculations;
            const serviceLevelData: ServiceLevelData = await calcs.getServiceLevelData(
                perspective,
            );

            const widgetInfo: WidgetInformation[] = await calcs.getWidgetInformation(perspective);

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    serviceLevelData,
                    widgetInfo
                }),
            };
        } catch (error) {
            const isKnownError = error instanceof Error;
            const parsedError: Error = isKnownError
                ? error
                : new Error(
                    `Unexpected error object of type "${typeof error}"`,
                );
            console.log(
                'ServiceLevelHandler Error: getEverything() failed.',
                `\nMessage: ${parsedError.message}\nStack: ${parsedError.stack}`,
            );
            return {
                statusCode: 500,
                body: JSON.stringify({ error: parsedError.message }),
            };
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
): Promise<any> => {
    return HandleEvent(event, ServiceLevelHandler);
};
