/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { asClass } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { WorkItemType } from '../data_v2/work_item_type_aurora';

export class WorkItemTypeHandler extends BaseHandler {
    private workItemType: WorkItemType;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, { workItemType: asClass(WorkItemType) });

        this.workItemType = this.dependencyInjectionContainer.cradle.workItemType;
    }

    async getTypes() {
        let response;

        try {
            response = (
                await this.workItemType.getTypes(this.security.organisation!)
            ).map((workItemType) => ({
                id: workItemType.id,
                name: workItemType.displayName,
                level: workItemType.level,
            }));
        } catch (e) {
            console.error('Failed: ' + e.message + '\n' + e.stack);
            return {
                statusCode: 400,
                body: JSON.stringify({ error: e.message }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(response),
        };
    }
}

export const getTypes = async (event: APIGatewayProxyEventV2) => {
    return await new WorkItemTypeHandler(event).getTypes();
};
