import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { isObject, isString } from 'lodash';

import HttpStatusCode from '../HttpStatusCode';
import { HttpResponse, stringify } from './interfaces';

export class RequestError extends Error {
    constructor(
        public messageToDeveloper: string,
        public statusCode = HttpStatusCode.INTERNAL_SERVER_ERROR,
        public messageToUser?: string,
    ) {
        super(messageToDeveloper);
    }
}

export class ForbiddenError extends RequestError {
    constructor() {
        super('Forbidden', 403);
    }
}

export default async function errorHandler(
    _event: APIGatewayProxyEventV2,
    { prev: error }: { prev: unknown },
): Promise<HttpResponse> {
    console.error(error);

    let statusCode = HttpStatusCode.INTERNAL_SERVER_ERROR;
    let message = '';

    if (error instanceof Error) {
        message = error.message;
    }

    if (error instanceof RequestError) {
        statusCode = error.statusCode;
    }

    const body = isString(error)
        ? { message: error }
        : isObject(error)
        ? { message, ...error }
        : error;

    return {
        body: stringify(body),
        statusCode,
    };
}
