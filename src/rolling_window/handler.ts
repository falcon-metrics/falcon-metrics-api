import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { DateTime } from 'luxon';
import { asClass } from 'awilix';
import { IQueryFilters, QueryFilters } from '../common/filters_v2';

export class RollingWindow extends BaseHandler {
    filters: IQueryFilters;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            filters: asClass(QueryFilters),
        });

        this.filters = this.dependencyInjectionContainer.cradle.filters;
    }

    async getEverything(): Promise<APIGatewayProxyResultV2> {
        let response: { startDate: DateTime | undefined; finishDate: DateTime | undefined };
        try {
            const rollingWindow = await this.filters.datePeriod();
            response = {
                startDate: rollingWindow?.start,
                finishDate: rollingWindow?.end,
            };
        } catch (e) {
            if (e instanceof Error) {
                console.error('Failed: ' + e.message + '\n' + e.stack);
            }
            return {
                statusCode: 500,
                body: JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
            };
        }
        return {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(response),
        };
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
    return await new RollingWindow(event).getEverything();
};
