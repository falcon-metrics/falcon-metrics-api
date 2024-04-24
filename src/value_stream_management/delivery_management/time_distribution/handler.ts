import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';
import { Calculations, TimeDistributionData } from './calculations';
import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
import { State } from '../../../workitem/state_aurora';
import { isValidPerspective } from '../../../common/perspectives';
import { WidgetInformation, WidgetInformationUtils } from '../../../utils/getWidgetInformation';

class TimeDistributionHandler extends BaseHandler {
    private calculations: Calculations;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations),
            state: asClass(State),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });

        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
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

        try {
            const data: TimeDistributionData = await this.calculations.getTimeDistributionData(
                perspective,
            );

            const histogramWidgetInfo: WidgetInformation[] = await this.calculations.getHistogramWidgetInformation(perspective);
            const scatterplotWidgetInfo: WidgetInformation[] = await this.calculations.getScatterplotWidgetInformation(perspective);

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    data,
                    histogramWidgetInfo,
                    scatterplotWidgetInfo
                }),
            };
        } catch (error) {
            if (error instanceof Error) {
                console.error('Failed: ' + error.message + '\n' + error.stack);
                return {
                    statusCode: 400,
                    body: JSON.stringify({ errorMessage: error.message }),
                };
            }

            return {
                statusCode: 400,
                body: JSON.stringify({
                    errorMessage: 'Unknown error on lead time handler.',
                }),
            };
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
): Promise<any> => {
    return HandleEvent(event, TimeDistributionHandler);
};
