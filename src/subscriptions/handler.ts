import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { Subscription } from './subscriptions';
import { SubscriptionDB } from './subscriptions_db';
import {
    ThresholdNotificationSubscription,
    ThresholdNotificationSubscriptionRequest,
} from './types';
import Profile from '../profile';
import { UserInfo } from '../types/User';
import { AxiosResponse } from 'axios';
import { logErrorInHandler } from '../utils/logging';
import { JWT, validateRequest } from '../utils/api';
class SubscriptionHandler extends BaseHandler {
    readonly subscription: Subscription;
    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            subscription: asClass(Subscription, {
                lifetime: Lifetime.SCOPED,
            }),
            subscriptionDb: asClass(SubscriptionDB),
        });
        this.subscription = this.dependencyInjectionContainer.cradle
            .subscription as Subscription;
    }
    async createThresholdSubscription(event: APIGatewayProxyEventV2) {
        const thresholdSubscriptionRequest: ThresholdNotificationSubscriptionRequest = event?.body
            ? JSON.parse(event?.body)
            : {};
        try {
            const validateResponse = validateRequest(event, this.security, {
                requiredRoles: { obeyaAdmin: true },
            }) as any;
            if (validateResponse.statusCode) {
                return validateResponse;
            }
            const jwt = validateResponse as JWT;
            const profile: {
                getUserInfo: () => Promise<AxiosResponse<any>>;
            } = await Profile(jwt.claims.sub as string);
            const userInfo: UserInfo = (await profile.getUserInfo()).data;
            const response = await this.subscription.createThresholdSubscription(
                userInfo,
                thresholdSubscriptionRequest,
            );
            return {
                statusCode: 201,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            logErrorInHandler(error);
        }
    }
    async getThresholdSubscription(event: APIGatewayProxyEventV2) {
        try {
            const validateResponse = validateRequest(event, this.security, {
                requiredParamKeys: ['obeyaRoomId'],
            }) as any;
            if (validateResponse.statusCode) {
                return validateResponse;
            }
            const obeyaRoomId = event.queryStringParameters?.obeyaRoomId;
            const jwt = validateResponse as JWT;
            const profile: {
                getUserInfo: () => Promise<AxiosResponse<any>>;
            } = await Profile(jwt.claims.sub as string);
            const userInfo: UserInfo = (await profile.getUserInfo()).data;
            const response = await this.subscription.getThresholdSubscription(
                userInfo,
                obeyaRoomId!,
            );
            return {
                statusCode: 201,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            logErrorInHandler(error);
        }
    }
    async inactivateSubscription(event: APIGatewayProxyEventV2) {
        try {
            const validateResponse = validateRequest(event, this.security, {
                requiredRoles: { obeyaAdmin: true },
            }) as any;

            if (validateResponse.statusCode) {
                return validateResponse;
            }
            const thresholdSubscription: ThresholdNotificationSubscription = event?.body
                ? JSON.parse(event?.body)
                : {};
            const response = await this.subscription.inactivateSubscription(
                thresholdSubscription,
            );
            return {
                statusCode: 201,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(response),
            };
        } catch (error) {
            logErrorInHandler(error);
        }
    }
}
export const subscribeToThresholdNotification = async (
    event: APIGatewayProxyEventV2,
) => {
    return new SubscriptionHandler(event).createThresholdSubscription(event);
};
export const getThresholdSubscription = async (
    event: APIGatewayProxyEventV2,
) => {
    return new SubscriptionHandler(event).getThresholdSubscription(event);
};
export const inactivateThresholdSubscription = async (
    event: APIGatewayProxyEventV2,
) => {
    return new SubscriptionHandler(event).inactivateSubscription(event);
};
