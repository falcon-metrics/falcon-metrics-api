import { APIGatewayProxyEventV2 } from 'aws-lambda';
import omit from 'lodash/omit';

import HttpStatusCode from '../HttpStatusCode';
import { HandlerFunctionReturn, HttpResponse, stringify } from './interfaces';

export default async function afterRequest<T>(
    _event: APIGatewayProxyEventV2,
    { prev: handlerResponse }: { prev: HandlerFunctionReturn<T>; },
): Promise<HttpResponse> {
    let body: unknown;
    let statusCode = HttpStatusCode.OK;
    let rest: Record<string, unknown> = {};

    if ((handlerResponse as any).body) {
        body = (handlerResponse as any).body;
        statusCode = (handlerResponse as any).statusCode ?? statusCode;
        rest = omit((handlerResponse as any), ['body', 'statusCode']);
    } else {
        body = handlerResponse;
    }

    return {
        ...rest,
        body: stringify(body),
        statusCode,
    };
}
