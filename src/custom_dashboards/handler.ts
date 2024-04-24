import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { asClass, Lifetime } from 'awilix';
import { HandleEvent } from '../common/event_handler';
import CustomDashboardsDbAurora from './custom_dashboards_db_aurora';

class CustomDashboardHanlder extends BaseHandler {
    readonly customDashboardsDbAurora: CustomDashboardsDbAurora;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            customDashboardsDbAurora: asClass(CustomDashboardsDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.customDashboardsDbAurora = this.dependencyInjectionContainer.cradle.customDashboardsDbAurora;
    }

    async getEverything(
        event: APIGatewayProxyEventV2,
    ): Promise<{ statusCode: number; body: string }> {
        try {
            if (
                event.queryStringParameters &&
                event.queryStringParameters['userId']
            ) {
                let data = await this.customDashboardsDbAurora.getCustomDashboardData(
                    event.queryStringParameters['userId'],
                    event.queryStringParameters['dashboardId'],
                );

                return {
                    statusCode: 200,
                    body: JSON.stringify(data),
                };
            } else {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'User Id is missing',
                    }),
                };
            }
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in getDashboardData',
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async updateDashboardData({ body }: APIGatewayProxyEventV2) {
        try {
            const requestData = JSON.parse(body || '');
            const result = await this.customDashboardsDbAurora.updateCustomDashboardData(
                requestData.userId,
                requestData.dashboardId,
                requestData,
            );
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Dashboard data updated',
                }),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in update dashboard',
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async createDashboardData({ body }: APIGatewayProxyEventV2) {
        try {
            const requestData = JSON.parse(body || '');
            const result = await this.customDashboardsDbAurora.saveCustomDashboardData(
                requestData,
            );
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Dashboard data created',
                }),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in create dashboard',
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }
}

export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, CustomDashboardHanlder);
};

export const updateDashboardData = async (event: APIGatewayProxyEventV2) => {
    return await new CustomDashboardHanlder(event).updateDashboardData(event);
};

export const createDashboardData = async (event: APIGatewayProxyEventV2) => {
    return await new CustomDashboardHanlder(event).createDashboardData(event);
};
