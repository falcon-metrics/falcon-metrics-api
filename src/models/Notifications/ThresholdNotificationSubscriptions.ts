import { Sequelize, DataTypes } from 'sequelize';

export const ThresholdNotificationSubscriptionModel = (sequelize: Sequelize) =>
    sequelize.define(
        'threshold_notification_subscriptions',
        {
            id: DataTypes.INTEGER,
            notificationId: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
            active: DataTypes.BOOLEAN,
            threshold: DataTypes.NUMBER,
            thresholdUnit: DataTypes.STRING,
            thresholdDirection: DataTypes.STRING,
            queryParameters: DataTypes.STRING,
            targetDate: DataTypes.DATE,
            obeyaRoomId: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
            userId: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
            email: DataTypes.STRING,
            orgId: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
        },
        {
            timestamps: false,
        },
    );
