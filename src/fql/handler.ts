import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { asClass } from 'awilix';
import FQLService from './fql_service';
import { State, IState } from '../workitem/state_aurora';
import { DatasourceId } from '../datasources/Providers';
import jwtToUser from '../datasources/jwtToUser';

class FqlHandler extends BaseHandler {
    private state: IState
    private orgId: string;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            state: asClass(State),
        });

        this.orgId = this.security.organisation!;
        this.state = this.dependencyInjectionContainer.cradle.state;
    }

    async checkFQLForObeya(event: any) {
        try {
            const service = await FQLService();
            const expression = JSON.parse(event.body).expression;

            const isValid = await this.state.testFqlQuery(
                this.orgId,
                '', // not required in Obeya
                service,
                expression,
            );
            
            return {
                statusCode: 201,
                body: JSON.stringify({ isValid }),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(error instanceof Error ? error.stack : 'Unknown error'),
            };
        }
    }

    async checkFQLQuery(event: any) {
        const {
            body,
            pathParameters: { provider, namespace },
            requestContext: {
                authorizer: { jwt },
            },
        } = event;

        const { organisationId } = jwtToUser(jwt);
        const datasourceId = await DatasourceId({
            provider,
            organisationId,
            namespace,
        });

        try {
            const service = await FQLService();
            const expression = JSON.parse(body).expression;

            const isValid = await this.state.testFqlQuery(
                organisationId,
                datasourceId,
                service,
                expression,
            );

            return {
                statusCode: 201,
                body: JSON.stringify({ isValid }),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(error instanceof Error ? error.stack : 'Unknown error'),
            };
        }
    }
}

export const FQLValidation = async (event: APIGatewayProxyEventV2) => {
    return await new FqlHandler(event).checkFQLQuery(event);
};

export const FQLObeyaValidation = async (event: APIGatewayProxyEventV2) => {
    return await new FqlHandler(event).checkFQLForObeya(event);
};
