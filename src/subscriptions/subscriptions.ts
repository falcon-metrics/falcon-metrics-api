import { DateTime } from 'luxon';
import { SecurityContext } from '../common/security';
import { UserInfo } from '../types/User';
import { getUserIdFromInfo } from '../utils/api';
import { ISubscriptionDB } from './subscriptions_db';
import {
    ThresholdNotificationId,
    ThresholdNotificationSubscription,
    ThresholdNotificationSubscriptionRequest,
} from './types';

export interface ISubscriptions {
    createThresholdSubscription(
        userInfo: UserInfo,
        subscriptionData: ThresholdNotificationSubscriptionRequest,
    ): Promise<ThresholdNotificationSubscription>;
    getThresholdSubscription(
        userInfo: UserInfo,
        obeyaRoomId: string,
    ): Promise<ThresholdNotificationSubscription[]>;
    inactivateSubscription(
        subscriptionData: ThresholdNotificationSubscription,
    ): Promise<ThresholdNotificationSubscription>;
}

export class Subscription implements ISubscriptions {
    readonly subscriptionDb: ISubscriptionDB;
    readonly orgId: string;
    constructor(opts: {
        security: SecurityContext;
        subscriptionDb: ISubscriptionDB;
    }) {
        if (!opts?.security?.organisation) throw Error('Cannot find orgId');
        this.orgId = opts?.security?.organisation;
        this.subscriptionDb = opts.subscriptionDb;
    }
    async createThresholdSubscription(
        userInfo: UserInfo,
        subscriptionRequest: ThresholdNotificationSubscriptionRequest,
    ): Promise<ThresholdNotificationSubscription> {
        const subscriptionData: ThresholdNotificationSubscription = {
            ...subscriptionRequest,
            orgId: this.orgId,
            email: userInfo.email,
            notificationId: ThresholdNotificationId,
            userId: userInfo.user_id,
            queryParameters:
                subscriptionRequest.obeyaRoomId &&
                `obeyaRoomId=${subscriptionRequest.obeyaRoomId}`,
            targetDate: subscriptionRequest.targetDate
                ? DateTime.fromISO(subscriptionRequest.targetDate)
                : undefined,
            active: true,
        };
        return await this.subscriptionDb.createOrUpdateThresholdSubscription(
            subscriptionData,
        );
    }
    async inactivateSubscription(
        subscriptionData: ThresholdNotificationSubscription,
    ): Promise<ThresholdNotificationSubscription> {
        return await this.subscriptionDb.createOrUpdateThresholdSubscription({
            ...subscriptionData,
            active: false,
        });
    }
    async getThresholdSubscription(
        userInfo: UserInfo,
        obeyaRoomId: string,
    ): Promise<ThresholdNotificationSubscription[]> {
        return await this.subscriptionDb.getThresholdSubscription(
            obeyaRoomId,
            userInfo.user_id,
        );
    }
}
