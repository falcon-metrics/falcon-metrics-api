import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
import { Calculations, FlowEfficiencyBodyResponse } from './calculations';
import { State, StateCategory } from '../../../workitem/state_aurora';
import { QueryFilters } from '../../../common/filters_v2';
import { PredefinedWidgetTypes } from '../common/enum';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { Snapshot } from '../../../workitem/snapshot_db';

export class FlowEfficiencyHandler extends BaseHandler {
    readonly calculations: Calculations;
    readonly filters: QueryFilters;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations, { lifetime: Lifetime.SCOPED }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            snapshot: asClass(Snapshot, { lifetime: Lifetime.SCOPED }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.filters = this.dependencyInjectionContainer.cradle.filters;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
        this.filters.setSafeAggregation();
    }

    async getEverything() {
        try {
            const [
                proposed,
                inprogress,
                completed,
            ] = await Promise.all([
                this.calculations.getCachedWorkItemsByStateCategory(StateCategory.PROPOSED),
                this.calculations.getCachedWorkItemsByStateCategory(StateCategory.INPROGRESS),
                this.calculations.getCachedWorkItemsByStateCategory(StateCategory.COMPLETED),
            ]);

            if (proposed.length === 0 && inprogress.length === 0 && completed.length === 0) {
                // Empty state
                return {
                    statusCode: 200,
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({}),
                };
            }

            const aggregation = this.filters.aggregation;
            const timeZone = this.filters.clientTimezone || 'utc';

            const [
                flowEfficiency,
                timeInStage,
                flowEfficiencyWidgetInfo,
                timeInStageWidgetInfo
            ] = await Promise.all([
                this.calculations.getFlowEfficiency(aggregation, timeZone),
                this.calculations.getTimeInStage(),
                this.calculations.getWidgetInformation(PredefinedWidgetTypes.FLOWEFFICIENCY),
                this.calculations.getWidgetInformation(PredefinedWidgetTypes.TIMEINSTAGE)
            ]);

            const response: FlowEfficiencyBodyResponse = {
                flowEfficiency,
                timeInStage,
                flowEfficiencyWidgetInfo,
                timeInStageWidgetInfo
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

export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, FlowEfficiencyHandler);
};
