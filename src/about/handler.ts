import { APIGatewayProxyResultV2 } from 'aws-lambda';

export const about = async (): Promise<APIGatewayProxyResultV2> => {
    let version = process.env.API_VERSION;
    version = version ? version : new Date().toISOString();

    const environmentName = process.env.STAGE;

    const response = {
        statusCode: 200,
        body: JSON.stringify({
            version: version,
            environment: environmentName,
        }),
    };

    return response;
};
