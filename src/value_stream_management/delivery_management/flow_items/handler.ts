import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';
import zlib from 'zlib';

import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
import { isValidPerspective } from '../../../common/perspectives';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { Snapshot } from '../../../workitem/snapshot_db';

import { State } from '../../../workitem/state_aurora';

import { Calculations } from './calculations';

class FlowItemsHandler extends BaseHandler {
    readonly calculations: Calculations;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations, {
                lifetime: Lifetime.SCOPED,
            }),
            state: asClass(State, {
                lifetime: Lifetime.SCOPED
            }),
            snapshot: asClass(Snapshot, {
                lifetime: Lifetime.SCOPED
            }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {
            const perspective = event.queryStringParameters?.perspective;
            const disableCompression = event.queryStringParameters?.disableCompression === 'true';

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
            const [workItemList, widgetInfo] = await Promise.all([
                calcs.getWorkItemList(perspective),
                calcs.getWidgetInformation(perspective)
            ]);

            let flowItems: any = workItemList;
            if (!disableCompression) {
                let str = JSON.stringify(workItemList);
                flowItems = zlib.deflateSync(str).toString('base64');
            }

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    flowItems,
                    widgetInfo
                }),
            };
        } catch (error) {
            const parsedError: Error = error instanceof Error
                ? error
                : new Error(
                    `Unexpected error object of type "${typeof error}"`,
                );
            console.log('Flow Units Handler Error');
            console.log(parsedError);
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
    return HandleEvent(event, FlowItemsHandler);
};