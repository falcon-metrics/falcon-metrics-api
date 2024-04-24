import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
import { Calculations, WidgetProjectItems } from './calculations';
import { Calculations as ThroughputCalculations } from '../../../throughput/calculations';
import { Calculations as InventoryCalculations } from '../../../inventory/calculations';
import { Calculations as WipCalculations } from '../../../wip/calculations';
import { Calculations as FlowOfDemandsCalculations } from '../../../value_stream_management/continuous_improvements/flow_of_demands/calculations';
import { Snapshot } from '../../../workitem/snapshot_db';
import { SnapshotQueries } from '../../../workitem/snapshot_queries';
import { State, StateCategory } from '../../../workitem/state_aurora';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { ExtendedStateItem } from '../../../workitem/interfaces';
import zlib from 'zlib';
import { handleQuery } from '../../../common/query_handler';

class FlowOfDemandsHandler extends BaseHandler {
    readonly calculations: Calculations;
    readonly inventoryCalculations: InventoryCalculations;
    readonly wipCalculations: WipCalculations;
    readonly state: State;
    readonly snapshot: Snapshot;
    readonly snapshotQueries: SnapshotQueries;
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
            snapshotQueries: asClass(SnapshotQueries, {
                lifetime: Lifetime.SCOPED,
            }),
            throughputCalculations: asClass(ThroughputCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            inventoryCalculations: asClass(InventoryCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            wipCalculations: asClass(WipCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            flowOfDemandsCalculations: asClass(FlowOfDemandsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.inventoryCalculations = this.dependencyInjectionContainer.cradle.inventoryCalculations;
        this.wipCalculations = this.dependencyInjectionContainer.cradle.wipCalculations;
        this.state = this.dependencyInjectionContainer.cradle.state;
        this.snapshot = this.dependencyInjectionContainer.cradle.snapshot;
        this.snapshotQueries = this.dependencyInjectionContainer.cradle.snapshotQueries;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        const disableCompression =
            event.queryStringParameters?.disableCompression === 'true';

        let response = {};

        try {
            const [
                demandVsCapacity,
                inflowVsOutflow,
                inventorySize,
                commitmentRate,
                timeToCommit,
                wipCount,
                avgWipAge,
                throughput,
                widgetInformation,
            ] = await Promise.all([
                this.calculations.getDemandVsCapacity(),
                this.calculations.getInflowVsOutflow(),
                this.calculations.getInventorySize(),
                this.calculations.getCommitmentRate(),
                this.calculations.getTimeToCommit(),
                this.calculations.getWipCount(),
                this.calculations.getAvgWipAge(),
                this.calculations.getThroughput(),
                this.calculations.getWidgetInformation(),
            ]);
        
            const widgetProjectItems: WidgetProjectItems = await this.calculations.getItemsPerWidget({
                inventoryItems: inventorySize.items as ExtendedStateItem[],
                wipItems: wipCount.items as ExtendedStateItem[],
                completedItems: throughput.items as ExtendedStateItem[],
            });
        
            const config: any = {
                demandVsCapacity,
                inflowVsOutflow,
                inventorySize: {
                    ...inventorySize,
                    items: widgetProjectItems.inventoryItems,
                },
                commitmentRate,
                timeToCommit,
                wipCount: {
                    ...wipCount,
                    items: widgetProjectItems.wipItems,
                },
                avgWipAge,
                
                throughput: {
                    ...throughput,
                    items: widgetProjectItems.completedItems,
                },
                widgetInformation,
            };

            if (event.queryStringParameters && event.queryStringParameters['query']) {
                const requestedItems = event.queryStringParameters['query'].split(',');

                response = await handleQuery(config, requestedItems);
            } else {
                response = config;
            }
        
            if (!disableCompression) {
                response = zlib.deflateSync(JSON.stringify(response)).toString('base64');
            }
        
            const [
                proposedWorkItems,
                inProgressWorkItems,
                completedWorkItems,
            ] = await Promise.all([
                this.calculations.getCachedWorkItemByStateCategory(StateCategory.PROPOSED),
                this.calculations.getCachedWorkItemByStateCategory(StateCategory.INPROGRESS),
                this.calculations.getCachedWorkItemByStateCategory(StateCategory.COMPLETED),
            ]);
        
            if (
                proposedWorkItems.length === 0 &&
                inProgressWorkItems.length === 0 &&
                completedWorkItems.length === 0
            ) {
                return {
                    statusCode: 200,
                    body: JSON.stringify({}),
                };
            }
        
            return {
                statusCode: 200,
                body: JSON.stringify({ response }),
            };
        } catch (error) {
            console.log('Flow of Demands Endpoint Error');
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors
                        ? (error as any).errors
                        : error instanceof Error
                        ? error.message
                        : 'Unknown error',
                ),
            };
        }

        
        // try {
        //     if (
        //         event.queryStringParameters &&
        //         event.queryStringParameters['query']
        //     ) {
        //         const requestedItems = event.queryStringParameters[
        //             'query'
        //         ].split(',');
        //         const config: any = {
        //             demandVsCapacity: this.calculations.getDemandVsCapacity(),
        //             inflowVsOutflow: this.calculations.getInflowVsOutflow(),
        //             inventorySize: this.calculations.getInventorySize(),
        //             commitmentRate: this.calculations.getCommitmentRate(),
        //             timeToCommit: this.calculations.getTimeToCommit(),
        //             wipCount: this.calculations.getWipCount(),
        //             avgWipAge: this.calculations.getAvgWipAge(),
        //             throughput: this.calculations.getThroughput(),
        //             widgetInformation: this.calculations.getWidgetInformation(),
        //         };
        //         response = await handleQuery(config, requestedItems);
        //     } else {
        //         const [
        //             demandVsCapacity,
        //             inflowVsOutflow,
        //             inventorySize,
        //             commitmentRate,
        //             timeToCommit,
        //             wipCount,
        //             avgWipAge,
        //             throughput,
        //             widgetInformation,
        //         ] = await Promise.all([
        //             this.calculations.getDemandVsCapacity(),
        //             this.calculations.getInflowVsOutflow(),
        //             this.calculations.getInventorySize(),
        //             this.calculations.getCommitmentRate(),
        //             this.calculations.getTimeToCommit(),
        //             this.calculations.getWipCount(),
        //             this.calculations.getAvgWipAge(),
        //             this.calculations.getThroughput(),
        //             this.calculations.getWidgetInformation(),
        //         ]);

        //         const widgetProjectItems: WidgetProjectItems = await this.calculations.getItemsPerWidget(
        //             {
        //                 inventoryItems: inventorySize.items as ExtendedStateItem[],
        //                 wipItems: wipCount.items as ExtendedStateItem[],
        //                 completedItems: throughput.items as ExtendedStateItem[],
        //             },
        //         );

        //         response = {
        //             demandVsCapacity,
        //             inflowVsOutflow,
        //             inventorySize: {
        //                 ...inventorySize,
        //                 ...{ items: widgetProjectItems.inventoryItems },
        //             },
        //             commitmentRate,
        //             timeToCommit,
        //             wipCount: {
        //                 ...wipCount,
        //                 ...{ items: widgetProjectItems.wipItems },
        //             },
        //             avgWipAge,
        //             throughput: {
        //                 ...throughput,
        //                 ...{ items: widgetProjectItems.completedItems },
        //             },
        //             widgetInformation,
        //         };
        //     }

        //     if (!disableCompression) {
        //         response = zlib
        //             .deflateSync(JSON.stringify(response))
        //             .toString('base64');
        //     }

        //     // This block was before the calculations
        //     // Moving this to below the calculations. Because it avoids an await before the calculations start. The calculations make the queries in parallel AND the query results are cached after the calculations.
        //     const [
        //         proposedWorkItems,
        //         inProgressWorkItems,
        //         completedWorkItems,
        //     ] = await Promise.all([
        //         this.calculations.getCachedWorkItemByStateCategory(
        //             StateCategory.PROPOSED,
        //         ),
        //         this.calculations.getCachedWorkItemByStateCategory(
        //             StateCategory.INPROGRESS,
        //         ),
        //         this.calculations.getCachedWorkItemByStateCategory(
        //             StateCategory.COMPLETED,
        //         ),
        //     ]);

        //     // If there are no work items then there is no data on this endpoint
        //     if (
        //         proposedWorkItems.length === 0 &&
        //         inProgressWorkItems.length === 0 &&
        //         completedWorkItems.length === 0
        //     ) {
        //         return {
        //             statusCode: 200,
        //             body: JSON.stringify({}),
        //         };
        //     }

        //     return {
        //         statusCode: 200,
        //         body: JSON.stringify({ response }),
        //     };
        // } catch (error) {
        //     console.log('Flow of Demands Endpoint Error');
        //     console.error(error);
        //     return {
        //         statusCode: 500,
        //         body: JSON.stringify(
        //             error && (error as any).errors
        //                 ? (error as any).errors
        //                 : error instanceof Error
        //                 ? error.message
        //                 : 'Unknown error',
        //         ),
        //     };
        // }
    }
}

export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, FlowOfDemandsHandler);
};
