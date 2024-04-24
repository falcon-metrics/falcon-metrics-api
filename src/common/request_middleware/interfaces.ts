import {
    APIGatewayProxyEventPathParameters,
    APIGatewayProxyEventV2,
} from 'aws-lambda';
import isObject from 'lodash/isObject';
import isString from 'lodash/isString';

import HttpStatusCode from '../HttpStatusCode';

export type HandlerFunctionArgs<
    T extends Record<string, unknown> = Record<string, undefined>
> = {
    requestBody: T;
    pathParameters?: APIGatewayProxyEventPathParameters;
    organisationId?: string;
    event: APIGatewayProxyEventV2;
    jwt?: any;
};

export type HandlerFunctionReturn<Body> =
    | Body
    | {
          body: Body;
          statusCode?: HttpStatusCode;
          headers?: Record<string, string>;
      };

export function isErrorWithMessage(arg: unknown): arg is { message: unknown } {
    if (isObject(arg)) {
        return 'message' in arg;
    }
    return false;
}

export type HttpResponse = {
    body: string;
    statusCode?: HttpStatusCode;
    headers?: Record<string, string>;
};

export type APIProcessedEvent<
    PathParameters = never,
    Body = never
> = APIGatewayProxyEventV2 & {
    organisationId: string;
    roles: string[];
    jwt?: any;
    user?: string | number | boolean | string[];
    pathParameters?: PathParameters;
    body?: Body;
};

export const stringify = (arg: unknown): string =>
    isString(arg) ? arg : JSON.stringify(arg);
