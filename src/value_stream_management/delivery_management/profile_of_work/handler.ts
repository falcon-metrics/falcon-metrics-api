import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';

import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
import {
    getPerspectiveProfile,
    isValidPerspective,
} from '../../../common/perspectives';

import { State } from '../../../workitem/state_aurora';

import { CustomFieldsService } from '../../../data_v2/custom_fields_service';
import { Calculations } from './calculations';
import { WidgetInformation, WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { handleQuery } from '../../../common/query_handler';

class ProfileOfWorkHandler extends BaseHandler {
    readonly calculations: Calculations;
    readonly customFieldsService: CustomFieldsService;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations, {
                lifetime: Lifetime.SCOPED,
            }),
            customFieldsService: asClass(CustomFieldsService, {
                lifetime: Lifetime.SCOPED,
            }),
            state: asClass(State, { lifetime: Lifetime.SCOPED }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.customFieldsService = this.dependencyInjectionContainer.cradle.customFieldsService;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        try {
            const { perspective } = event.queryStringParameters || {};

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

            const { stateCategory, ageField } = getPerspectiveProfile(
                perspective,
            );

            // Calculations
            const calcs = this.calculations;

            const workItemDataPromise = calcs.getWorkItemData(
                stateCategory,
                ageField,
                perspective
            );

            const workItemData = await workItemDataPromise;

            // Widget Information
            // TODO: can still be refactored
            const assignedToWidgetInfo: WidgetInformation[] = await calcs.getAssignedToWidgetInformation(perspective);
            const workItemTypeWidgetInfo: WidgetInformation[] = await calcs.getWorkItemTypeWidgetInformation(perspective);
            const stageOfWorkflowWidgetInfo: WidgetInformation[] = await calcs.getStageOfWorkflowWidgetInformation(perspective);
            const workItemsWidgetInfo: WidgetInformation[] = await calcs.getWorkItemsWidgetInformation(perspective);
            const customFieldWidgetInfo: WidgetInformation[] = await calcs.getCustomFieldsWidgetInformation(perspective);
            const normalisedWidgetInfo: WidgetInformation[] = await calcs.getNormaliseWidgetInformation(perspective);

            const emptyDataset = workItemData.workItemList.length === 0 && workItemData.assignedToAnalysisData.length === 0;

            let response = {};
            if (event.queryStringParameters && event.queryStringParameters['query']) {
                const requestedItems = event.queryStringParameters['query'].split(',');
                const config: any = {
                    'systemFields': this.calculations.getSystemFields(workItemData),
                    'customFields': this.calculations.getCustomFieldsRecord(workItemData.workItemList, perspective, emptyDataset),
                    'normalisationFields': this.calculations.getNormalisationFields(stateCategory, workItemData.workItemList, perspective, emptyDataset)
                };
                response = await handleQuery(config, requestedItems);
            } else {
                const customFields = await this.calculations.getCustomFieldsRecord(
                    workItemData.workItemList,
                    perspective,
                    emptyDataset
                );

                const normalisationFields = await this.calculations.getNormalisationFields(
                    stateCategory,
                    workItemData.workItemList,
                    perspective,
                    emptyDataset
                );

                const systemFields = await this.calculations.getSystemFields(workItemData);
                response = {
                    systemFields,
                    customFields,
                    normalisationFields
                };
            }
            response = {
                ...response,
                ... {
                    assignedToWidgetInfo,
                    workItemTypeWidgetInfo,
                    stageOfWorkflowWidgetInfo,
                    workItemsWidgetInfo,
                    customFieldWidgetInfo,
                    normalisedWidgetInfo
                }
            };
            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (err) {
            if (err instanceof Error) {
                console.log(
                    'Profile of Work Handler Errror. getEverything() failed',
                    `\nMessage: ${err.message}\nStack: ${err.stack}`,
                );
            } else {
                console.error(err);
            }
            return {
                statusCode: 500,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    error: err instanceof Error ? err.message : 'Unknown error',
                }),
            };
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent
): Promise<any> => {
    return HandleEvent(event, ProfileOfWorkHandler);
};
