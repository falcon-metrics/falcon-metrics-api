import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';

import {
    AggregationKey,
    parseFilterAggregationOption,
} from '../../../common/aggregation';
import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
import { isValidPerspective } from '../../../common/perspectives';
import { WidgetInformation, WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { State } from '../../../workitem/state_aurora';
import { Calculations } from './calculations';

class RunChartHandler extends BaseHandler {
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
            const { perspective, currentDataAggregation: aggregationParam } =
                event.queryStringParameters || {};

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

            const aggregation: AggregationKey = parseFilterAggregationOption(
                aggregationParam,
            );

            const calcs = this.calculations;
            const {
                totalItemsData,
                newItemsData,
            } = await calcs.getRunChartByPerspective(perspective, aggregation);

            const widgetInfo: WidgetInformation[] = await calcs.getWidgetInformation(perspective);

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    runChartData: {
                        totalItemsData,
                        newItemsData,
                    },
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
                'RunChartHandler Error: getEverything() failed.',
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
    return HandleEvent(event, RunChartHandler);
};
