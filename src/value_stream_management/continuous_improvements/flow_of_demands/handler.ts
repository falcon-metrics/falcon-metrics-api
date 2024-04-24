import { asClass, Lifetime } from 'awilix';
import {
    APIGatewayProxyEventV2,
    ScheduledEvent,
} from 'aws-lambda';

import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
import {
    State, StateCategory,
} from '../../../workitem/state_aurora';
import {
    Calculations,
} from './calculations';
import {
    Calculations as ThroughputCalculations,
} from '../../../throughput/calculations';
import { PredefinedWidgetTypes } from '../common/enum';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';

class FlowOfDemandsHandler extends BaseHandler {
    private calculations: Calculations;
    readonly throughputCalculations: ThroughputCalculations;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations),
            state: asClass(State),
            throughputCalculations: asClass(ThroughputCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });

        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.throughputCalculations = this.dependencyInjectionContainer.cradle.throughputCalculations;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
    }

    async getEverything() {
        try {
            const [
                proposed,
                inprogress,
                completed,
            ] = await Promise.all([
                this.calculations.getCachedWorkItemByStateCategory(StateCategory.PROPOSED),
                this.calculations.getCachedWorkItemByStateCategory(StateCategory.INPROGRESS),
                this.calculations.getCachedWorkItemByStateCategory(StateCategory.COMPLETED),
            ]);

            if (proposed.length === 0 && inprogress.length === 0 && completed.length === 0) {
                // Empty state
                return {
                    statusCode: 200,
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({}),
                };
            }
    
            const [
                demandVsCapacity,
                inflowVsOutflow,
                demandVsCapacityWidgetInfo,
                inflowVsOutflowWidgetInfo,
            ] = await Promise.all([
                this.calculations.getDemandVsCapacityWidgetData(),
                this.calculations.getInflowVsOutflowWidgetData(),
                this.calculations.getWidgetInformation(PredefinedWidgetTypes.DEMANDVSCAPACITY),
                this.calculations.getWidgetInformation(PredefinedWidgetTypes.WORK_STARTED_COMPLETED)
            ]);

            const response = {
                demandVsCapacity,
                inflowVsOutflow,
                demandVsCapacityWidgetInfo,
                inflowVsOutflowWidgetInfo,
            };

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: (
                        error instanceof Error ? error.message : 'Unexpected error'
                    )
                }),
            };
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    return HandleEvent(event, FlowOfDemandsHandler);
};
