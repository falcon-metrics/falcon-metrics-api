import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { asClass } from 'awilix';
import { Normalization } from './Normalization';

class NormalizationHandler extends BaseHandler {
    private normalization: Normalization;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            normalization: asClass(Normalization),
        });

        this.normalization = this.dependencyInjectionContainer.cradle.normalization;
    }

    async getData(getter: keyof Normalization) {
        try {
            const data = await this.normalization[getter]();
            return {
                statusCode: 201,
                body: JSON.stringify(data),
            };
        } catch (error) {
            console.error(error);
            const errors = JSON.stringify(error.errors);
            return {
                statusCode: 500,
                body: JSON.stringify(errors),
            };
        }
    }
}

export const getFilterColors = async (event: APIGatewayProxyEventV2) => {
    return await new NormalizationHandler(event).getData('getFilterColors');
};

export const getConfiguredCategories = async (
    event: APIGatewayProxyEventV2,
) => {
    return await new NormalizationHandler(event).getData(
        'getConfiguredCategories',
    );
};

export const getFilters = async (event: APIGatewayProxyEventV2) => {
    return await new NormalizationHandler(event).getData('getFilters');
};
