import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getDataByKey } from './s3_client';

export const getMockDataHandler = async (event: APIGatewayProxyEventV2) => {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                errorMessage: 'No object key info included',
            }),
        };
    }
    const data = JSON.parse(event.body);
    //just need to get object by key
    const { objectKey } = data;
    try {
        const body = await getDataByKey(objectKey);
        return {
            statusCode: 200,
            body: body, //already string
        };
    } catch (error) {
        console.error(JSON.stringify(error.errors || error));
        return {
            statusCode: 500,
            body: JSON.stringify({
                errorMessage: `error when getting mock data with key ${objectKey}`,
            }),
        };
    }
};
