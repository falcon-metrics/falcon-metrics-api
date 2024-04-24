import { asClass } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../../common/base_handler';
import { HandleCustomFields } from './handleCustomFields';

import CustomFields from '../../models/CustomFieldConfigModel';
import { DatasourceId } from '../Providers';
import jwtToUser from '../jwtToUser';

type Dependency = {
    customFieldId: string;
    fqlFilters: string[];
    obeyaRooms: string[];
};
class CustomFieldsHandler extends BaseHandler {
    private customFieldsHandle: HandleCustomFields;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            customFieldsHandle: asClass(HandleCustomFields),
        });

        this.customFieldsHandle = this.dependencyInjectionContainer.cradle.customFieldsHandle;
    }

    async post(event: any) {
        const {
            body,
            pathParameters: { provider },
        } = event;

        const _namespace = event.pathParameters.namespace;

        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
        };

        type Payload = {
            selectedCustomFields: any[];
            removedCustomFields: string[];
        };

        const { selectedCustomFields, removedCustomFields } = JSON.parse(
            body!,
        ) as Payload;

        try {
            const customFieldDependencies = await this.customFieldsHandle.getDependencies(
                removedCustomFields,
                provider,
                _namespace
            );

            // console.table(dependencies.customFields);

            const dependencies: Dependency[] = [];
            customFieldDependencies.customFields.forEach((value, key) => {
                if (value.fqlFilters.length || value.obeyaRooms.length) {
                    dependencies.push({
                        customFieldId: key,
                        fqlFilters: value.fqlFilters,
                        obeyaRooms: value.obeyaRooms,
                    });
                }
            });

            // console.log(JSON.stringify(cf));

            if (dependencies.length) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        dependencies: dependencies,
                    }),
                };
            } else {
                const customFieldsConfig = await this.customFieldsHandle.postCustomFields(
                    selectedCustomFields,
                    removedCustomFields ?? [],
                    provider,
                    _namespace,
                );

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(customFieldsConfig),
                };
            }
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify((error as any).errors || error),
            };
        }
    }
}

export const post = async (event: APIGatewayProxyEventV2) => {
    return await new CustomFieldsHandler(event).post(event);
};

export const get = async (event: any) => {
    const {
        pathParameters: { provider },
        requestContext: {
            authorizer: { jwt },
        },
    } = event;

    const _namespace = event.pathParameters.namespace;

    const { organisationId } = jwtToUser(jwt);
    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace: _namespace,
    });

    const model = await CustomFields();
    const dataset = await model.findAll({
        where: { datasourceId, orgId: organisationId, deletedAt: null } as any,
    });

    return {
        statusCode: 200,
        body: JSON.stringify(dataset),
    };
};
