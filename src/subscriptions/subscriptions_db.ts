import { ThresholdNotificationSubscription } from './types';
import { Op, Sequelize, Transaction } from 'sequelize';
import { ThresholdNotificationSubscriptionModel } from '../models/Notifications/ThresholdNotificationSubscriptions';
import { apiErrorMessage } from '../utils/logging';

export interface ISubscriptionDB {
    createOrUpdateThresholdSubscription(
        subscriptionData: ThresholdNotificationSubscription,
    ): Promise<ThresholdNotificationSubscription>;
    getThresholdSubscription(
        obeyaRoomId: string,
        userId: string,
    ): Promise<ThresholdNotificationSubscription[]>;
}

export class SubscriptionDB implements ISubscriptionDB {
    readonly auroraWriter: Sequelize;
    readonly aurora: Promise<Sequelize>;
    constructor(opts: { auroraWriter: Sequelize; aurora: Promise<Sequelize> }) {
        this.auroraWriter = opts.auroraWriter;
        this.aurora = opts.aurora;
    }
    async getThresholdSubscription(
        obeyaRoomId: string,
        userId: string,
    ): Promise<ThresholdNotificationSubscription[]> {
        const database = await this.aurora;
        const thresholdSubscriptionModel = ThresholdNotificationSubscriptionModel(
            database,
        );
        try {
            const thresholdSubscriptionItems: unknown[] = await thresholdSubscriptionModel.findAll(
                {
                    where: {
                        obeyaRoomId,
                        userId,
                        active: true,
                    },
                    raw: true,
                },
            );
            return thresholdSubscriptionItems?.map(
                (item) => item as ThresholdNotificationSubscription,
            );
        } catch (error) {
            throw Error(apiErrorMessage('DB', 'subscription', error));
        }
    }
    async createOrUpdateThresholdSubscription(
        subscriptionData: ThresholdNotificationSubscription,
    ): Promise<ThresholdNotificationSubscription> {
        const database = await this.auroraWriter;
        const transaction = await database.transaction();
        const thresholdSubscriptionModel = ThresholdNotificationSubscriptionModel(
            database,
        );
        try {
            await thresholdSubscriptionModel.upsert(subscriptionData);
            transaction.commit();
            return subscriptionData;
        } catch (error) {
            throw Error(apiErrorMessage('DB', 'subscription', error));
        }
    }
}
