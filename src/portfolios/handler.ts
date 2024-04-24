import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { HandleEvent } from '../common/event_handler';
import { IQueryFilters, QueryFilters } from '../common/filters_v2';
import { Calculations as PortfolioCalculations } from './calculations';
import { GetResponse } from './interfaces';
import { PortfolioDbAurora } from './portfolio_db_aurora';
import { DateTime, Interval } from 'luxon';

class Portfolios extends BaseHandler {
    readonly portfolioCalculations: PortfolioCalculations;
    readonly portfolioDbAurora: PortfolioDbAurora;
    readonly orgId: string;
    readonly filters: IQueryFilters;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            portfolioDbAurora: asClass(PortfolioDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
            portfolioCalculations: asClass(PortfolioCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            filters: asClass(QueryFilters, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.portfolioCalculations = this.dependencyInjectionContainer.cradle.portfolioCalculations;
        this.portfolioDbAurora = this.dependencyInjectionContainer.cradle.portfolioDbAurora;
        this.orgId = this.dependencyInjectionContainer.cradle.security.organisation!;
        this.filters = this.dependencyInjectionContainer.cradle.filters;
    }

    async getEverything(
        event: APIGatewayProxyEventV2,
    ): Promise<GetResponse | { statusCode: number; body: string; }> {
        try {
            const columns = await this.portfolioCalculations.getColumns();

            return {
                statusCode: 200,
                body: JSON.stringify({
                    columns,
                }),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in getEverything',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors
                        ? (error as any).errors
                        : error instanceof Error
                            ? error.message
                            : 'Internal Server Error',
                ),
            };
        }
    }

    private parseBody(body: string) {
        const parsed = JSON.parse(body!);
        return parsed;
    }

    async post({ body }: APIGatewayProxyEventV2) {
        if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        if (!body) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: { message: 'Body is required' } }),
            };
        }
        const data = this.parseBody(body);

        if (!data.columnName) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'Column Name is required' },
                }),
            };
        }
        if (!data.columnId) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'Column Id is required' },
                }),
            };
        }

        const newColumn = {
            ...data,
        };

        try {
            const result = await this.portfolioCalculations.post({
                ...newColumn,
            });
            return {
                statusCode: 200,
                body: JSON.stringify(result),
            };
        } catch (error) {
            const message =
                error instanceof Error && error.message
                    ? error.message
                    : 'Unknown error while creating object';

            console.error(
                JSON.stringify({
                    message: 'Error in post column',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify({ message }),
            };
        }
    }

    async patch(event: APIGatewayProxyEventV2) {
        const body: any = event.body || {};
        try {
            const payload = JSON.parse(body);
            const response = await this.portfolioCalculations.update(payload);
            return {
                statusCode: 201,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify((error as any).errors),
            };
        }
    }

    async remove(event: APIGatewayProxyEventV2) {
        const columnId = event?.pathParameters?.id as string | undefined;

        try {
            if (!columnId) {
                return {
                    statusCode: 422,
                    body: JSON.stringify({
                        error: { message: 'Column Id is required' },
                    }),
                };
            }
            await this.portfolioCalculations.delete(columnId);
            return {
                statusCode: 204,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify('Deleted Successfully'),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify((error as any).errors),
            };
        }
    }

    async getFocus(event: APIGatewayProxyEventV2) {
        const queryParams = event.queryStringParameters;
        if (!queryParams) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: "Parameters missing for the endpoint"
                }),
            };
        }
        try {
            let focus;
            if (!queryParams.contextId)
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: "Context ID missing"
                    }),
                };
            if (!queryParams.filterStartDate || !queryParams.filterEndDate)
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: "Start date or end date missing"
                    }),
                };

            // setZone to use the same timezone in the ISO string
            const startDate = DateTime.fromISO(queryParams.filterStartDate, { setZone: true });
            const endDate = DateTime.fromISO(queryParams.filterEndDate, { setZone: true });
            const interval = Interval.fromDateTimes(startDate, endDate);
            const isIncludeChildren = queryParams.isIncludeChildren === 'true' ? true : false;

            if (!interval.isValid) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: "Valid interval could not be constructed with the parameters"
                    }),
                };
            }
            console.log(interval.toISO());
            focus = await this.portfolioCalculations.getFocus(queryParams.contextId, interval, isIncludeChildren);

            // const costAnalysis = await this.portfolioCalculations.getCostAnalysis(queryParams.contextId, interval);

            return {
                statusCode: 200,
                body: JSON.stringify({
                    focus,
                    // costAnalysis
                }),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in getFocus',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors
                        ? (error as any).errors
                        : error instanceof Error
                            ? error.message
                            : 'Internal Server Error',
                ),
            };
        }
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyEventV2> => {
    return HandleEvent(event, Portfolios);
};

export const post = async (event: APIGatewayProxyEventV2) => {
    return await new Portfolios(event).post(event);
};

export const patch = async (event: APIGatewayProxyEventV2) => {
    return await new Portfolios(event).patch(event);
};

export const remove = async (event: APIGatewayProxyEventV2) => {
    return await new Portfolios(event).remove(event);
};

export const getFocus = async (event: APIGatewayProxyEventV2) => {
    return await new Portfolios(event).getFocus(event);
};
