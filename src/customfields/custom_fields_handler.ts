import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { CustomFieldsService } from '../data_v2/custom_fields_service';

export class CustomFieldsHandler extends BaseHandler {
    private customFieldsService: CustomFieldsService;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            customFieldsService: asClass(CustomFieldsService, {
                lifetime: Lifetime.SCOPED,
            }),
        });

        this.customFieldsService = this.dependencyInjectionContainer.cradle.customFieldsService;
    }

    async getCustomFields() {
        let customFields: any = [];
        try {
            customFields = await this.customFieldsService.getEverything(
                this.security.organisation!,
            );
        } catch (e) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: e.message }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(customFields),
        };
    }
    async getEverything() {
        return this.getCustomFields();
    }
}

export const getCustomFields = async (event: APIGatewayProxyEventV2) => {
    return await new CustomFieldsHandler(event).getEverything();
};
