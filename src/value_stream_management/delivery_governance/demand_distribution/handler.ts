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

class DemandDistributionHandler extends BaseHandler {
    readonly calculations: Calculations;
    readonly state: State;
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
        this.state = this.dependencyInjectionContainer.cradle.state;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {

            const [
                upcomingWork,
                workInProcess,
                completedWork
            ] = await Promise.all([
                this.calculations.getUpcomingWorkDemandDistribution(),
                this.calculations.getWorkInProcessDemandDistribution(),
                this.calculations.getCompletedWorkDemandDistribution(),
            ]);

            const response = {
                upcomingWork,
                workInProcess,
                completedWork,
            };

            return {
                statusCode: 200,
                body: JSON.stringify(response),
            };
        } catch (error) {
            console.log('Demand Distribution Endpoint Error');
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors ? (error as any).errors : (
                        error instanceof Error ? error.message : 'Unknown error'
                    )
                ),
            };
        }
    }
}

export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, DemandDistributionHandler);
};
