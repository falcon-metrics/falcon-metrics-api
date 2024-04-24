import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { HandleEvent } from '../common/event_handler';
import { isValidPerspective } from '../common/perspectives';
import { Snapshot } from '../workitem/snapshot_db';
import { State } from '../workitem/state_aurora';
import { Calculations } from './calculations';
import { Calculations as FlowItemsCalculations } from '../value_stream_management/delivery_management/flow_items/calculations';
import { WidgetInformationUtils } from '../utils/getWidgetInformation';

class WorkItemExtendedDetailsHandler extends BaseHandler {
    readonly calculations: Calculations;
    readonly flowItemsCalculations: FlowItemsCalculations;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations, {
                lifetime: Lifetime.SCOPED,
            }),
            state: asClass(State, {
                lifetime: Lifetime.SCOPED,
            }),
            snapshot: asClass(Snapshot, {
                lifetime: Lifetime.SCOPED,
            }),
            flowItemsCalculations: asClass(FlowItemsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.flowItemsCalculations = this.dependencyInjectionContainer.cradle.flowItemsCalculations;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {
            const workItemId = event.queryStringParameters?.workItemId;
            const perspective = event.queryStringParameters?.perspective;

            if (!isValidPerspective(perspective)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: {
                            message: 'Invalid perspective',
                        },
                    }),
                };
            }

            if (!workItemId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: 'Work item id is required',
                    }),
                };
            }

            const results = await this.calculations.getExtendedCardDetails(
                perspective,
                workItemId,
            );

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(results),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Internal Server Error' }),
            };
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
): Promise<any> => {
    return HandleEvent(event, WorkItemExtendedDetailsHandler);
};
