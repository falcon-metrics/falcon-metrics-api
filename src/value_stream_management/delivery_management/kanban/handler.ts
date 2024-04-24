import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';
import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';

import { State } from '../../../workitem/state_aurora';
import { Calculations, KanbanBoardData } from './calculations';
import { Calculations as SourceOfDelayAndWasteCalculations } from '../../delivery_governance/sources_of_delay_and_waste/calculations';
import { Calculations as ThroughputCalculations } from '../../../throughput/calculations';
import { Calculations as LeadTimeCalculations } from '../../../leadtime/calculations';
import { Calculations as WipCalculations } from '../../../wip/calculations';
import { OrganizationSettings as OrganizationSettingsCalculations } from '../../../organization-settings/handleSettings';
import { WidgetInformation, WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { SnapshotQueries } from '../../../workitem/snapshot_queries';
import { Snapshot } from '../../../workitem/snapshot_db';

export interface ItemSelectionOptions {
    includeBlocked: boolean;
    includeStale: boolean;
    includeAboveSle: boolean;
    includeExpedited: boolean;
    includeUnassigned: boolean;
    includeDelayed: boolean;
    includeDiscardedAfter: boolean;
    includeDiscardedBefore: boolean;
}

class KanbanHandler extends BaseHandler {
    readonly calculations: Calculations;
    readonly sourceOfDelayAndWasteCalculations: SourceOfDelayAndWasteCalculations;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations, {
                lifetime: Lifetime.SCOPED,
            }),
            sourceOfDelayAndWasteCalculations: asClass(SourceOfDelayAndWasteCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            throughputCalculations: asClass(ThroughputCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            leadtimeCalculations: asClass(LeadTimeCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            wipCalculations: asClass(WipCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            organisationsSettingsCalculations: asClass(OrganizationSettingsCalculations, {
                lifetime: Lifetime.SCOPED
            }),
            snapshot: asClass(Snapshot, {
                lifetime: Lifetime.SCOPED,
            }),
            snapshotQueries: asClass(SnapshotQueries, {
                lifetime: Lifetime.SCOPED,
            }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.sourceOfDelayAndWasteCalculations = this.dependencyInjectionContainer.cradle.sourceOfDelayAndWasteCalculations;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
    }

    private static isString(value: unknown): value is string {
        if (!value) {
            return false;
        }

        return typeof value === 'string' || value instanceof String;
    }

    private parseSelectionOperator(value: unknown): string {
        if (!KanbanHandler.isString(value)) {
            return 'or';
        }

        return value === 'and' ? 'and' : 'or';
    }

    private parseBooleanOption(value: unknown): boolean {
        if (KanbanHandler.isString(value) && value === 'true') {
            return true;
        }

        return false;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {
            const {
                selectionOperator: rawSelectionOperator,
                includeBlocked: rawIncludedBlock,
                includeStale: rawIncludeStale,
                includeAboveSle: rawIncludeAboveSle,
                includeExpedited: rawIncludeExpedited,
                includeUnassigned: rawIncludeUnassigned,
                includeDelayed: rawIncludeDelayed,
                includeDiscardedAfter: rawIncludeDiscardedAfter,
                includeDiscardedBefore: rawIncludeDiscardedBefore,
            } = event.queryStringParameters || {};

            const { parseSelectionOperator, parseBooleanOption } = this;

            const selectionOperator = parseSelectionOperator(
                rawSelectionOperator,
            );

            const selectionOptions: ItemSelectionOptions = {
                includeBlocked: parseBooleanOption(rawIncludedBlock),
                includeStale: parseBooleanOption(rawIncludeStale),
                includeAboveSle: parseBooleanOption(rawIncludeAboveSle),
                includeExpedited: parseBooleanOption(rawIncludeExpedited),
                includeUnassigned: parseBooleanOption(rawIncludeUnassigned),
                includeDelayed: parseBooleanOption(rawIncludeDelayed),
                includeDiscardedAfter: parseBooleanOption(rawIncludeDiscardedAfter),
                includeDiscardedBefore: parseBooleanOption(rawIncludeDiscardedBefore),
            };

            const calcs = this.calculations;
            const workItemsPerState: KanbanBoardData = await calcs.getWorkItemPerState(
                selectionOptions,
                selectionOperator,
            );

            const widgetInfo: WidgetInformation[] = await calcs.getWidgetInformation();

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    kanbanBoardData: workItemsPerState,
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
            console.log('Kanban Handler Error. getEverything() failed');
            console.log(`Message: ${parsedError.message}\nStack: ${parsedError.stack}`);
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
    return HandleEvent(event, KanbanHandler);
};
