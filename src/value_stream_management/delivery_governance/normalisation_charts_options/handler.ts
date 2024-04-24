import {
    asClass,
    Lifetime,
} from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
import { Snapshot } from '../../../workitem/snapshot_db';
import { SnapshotQueries } from '../../../workitem/snapshot_queries';
import { State } from '../../../workitem/state_aurora';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { Calculations } from './calculations';

class ClassOfServiceHandler extends BaseHandler {
    readonly calculations: Calculations;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations, {
                lifetime: Lifetime.SCOPED
            }),
            state: asClass(State, {
                lifetime: Lifetime.SCOPED
            }),
            snapshot: asClass(Snapshot, {
                lifetime: Lifetime.SCOPED,
            }),
            snapshotQueries: asClass(SnapshotQueries, {
                lifetime: Lifetime.SCOPED,
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
            const response = await this.calculations.getNormalisationCategoryList();
            
            return {
                statusCode: 200,
                body: JSON.stringify(response),
            };
        } catch (error) {
            console.log('Class of Service Endpoint Error');
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: error && (error as any).errors ? (error as any).errors : (
                        error instanceof Error ? error.message : 'Unknown error'
                    )
                }),
            };
        }
    }
}

export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, ClassOfServiceHandler);
};
