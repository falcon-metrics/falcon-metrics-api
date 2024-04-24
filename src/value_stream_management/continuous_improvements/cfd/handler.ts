import { asClass, Lifetime } from 'awilix';
import {
    APIGatewayProxyEventV2,
    ScheduledEvent,
} from 'aws-lambda';

import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
import { QueryFilters } from '../../../common/filters_v2';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { Snapshot } from '../../../workitem/snapshot_db';
import { SnapshotQueries } from '../../../workitem/snapshot_queries';
import { State } from '../../../workitem/state_aurora';
import {
    Calculations,
} from './calculations';

export type CFDNewDataItem = {
    stateName: string;
    cumulativeFlowData: {
        [date: string]: number;
    };
};

export type CFDSummaryItem = {
    arrivalRate?: number;
    departureRate?: number;
    dailyAverage?: number;
    averageCycleTime?: number;
};

class CFDHandler extends BaseHandler {
    private calculations: Calculations;
    private filters: QueryFilters;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations, {
                lifetime: Lifetime.SCOPED
            }),
            snapshotQueries: asClass(SnapshotQueries, {
                lifetime: Lifetime.SCOPED,
            }),
            state: asClass(State, {
                lifetime: Lifetime.SCOPED
            }),
            snapshot: asClass(Snapshot, {
                lifetime: Lifetime.SCOPED
            }),
            filters: asClass(QueryFilters, {
                lifetime: Lifetime.SCOPED
            }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });

        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.filters = this.dependencyInjectionContainer.cradle.filters;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
        // Override the aggregation
        this.filters.setSafeAggregation();
    }

    async getEverything() {
        try {
            const selectedWorkItemType = this.filters.queryParameters?.cfdFlowItemType?.split(",");
            const includeCompleted = this.filters.queryParameters?.cfdIncludeCompleted === 'true';

            const response = await this.calculations.getCumulativeFlowResponse(
                selectedWorkItemType,
                includeCompleted || false
            );

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response === null ? {} : response),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors ? (error as any).errors : (
                        error instanceof Error ? error.message : 'Unexpected error'
                    )
                ),
            };
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    return HandleEvent(event, CFDHandler);
};
