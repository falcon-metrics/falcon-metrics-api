import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { userInfo } from 'os';
import { SecurityContext } from '../common/security';
import { UserInfo } from '../types/User';
import yup from 'yup';

export interface ApiResponse {
    statusCode: number;
    body: string;
}
export interface JWT {
    claims: { [name: string]: string | number | boolean | string[]; };
    scopes: string[];
}
export const validateRequest = (
    event: APIGatewayProxyEventV2,
    security: SecurityContext,
    params?: {
        requiredRoles?: {
            obeyaAdmin?: boolean;
            adminUser?: boolean;
            powerUser?: boolean;
            beta?: boolean;
            alpha?: boolean;
        };
        requiredParamKeys?: string[];
    },
): ApiResponse | JWT => {
    const jwt = event.requestContext.authorizer?.jwt;
    if (!jwt) {
        return {
            statusCode: 401,
            body: JSON.stringify('Not Authorized'),
        };
    }
    if (params?.requiredParamKeys?.length) {
        if (
            !params.requiredParamKeys.every(
                (paramKey) =>
                    event && event.queryStringParameters &&
                    paramKey in event.queryStringParameters,
            )
        ) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: {
                        message: `Need correct query parameters: ${params.requiredParamKeys}`,
                    },
                }),
            };
        }
    }
    if (security.isPowerUser()) return jwt;
    if (
        params?.requiredRoles?.obeyaAdmin &&
        params.requiredRoles.obeyaAdmin === true
    ) {
        if (security.isGovernanceObeyaAdmin()) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }
    }

    return jwt;
};

export const getUserIdFromInfo = (userInfo: UserInfo): string => {
    return userInfo.user_id.split('|')[1];
};



export const isUUID = (id: string | undefined) => {
    if (!id) return false;
    const schema = yup.object().shape({
        uuid: yup.string().uuid()
    });
    const isValid = schema.isValidSync({ uuid: id });
    return isValid;
};

export const INTERNAL_SERVER_ERROR_BODY = JSON.stringify({ message: 'Internal Server Error' });
export const INTERNAL_SERVER_ERROR_RESPONSE = {
    statusCode: 500,
    body: INTERNAL_SERVER_ERROR_BODY,
};