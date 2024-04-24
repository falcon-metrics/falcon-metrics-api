import { DataTypes, Sequelize, Model, BuildOptions } from 'sequelize';
import { TimeHorizon } from '../visions/interfaces';

const types: typeof DataTypes = Sequelize as any;

export interface TimeHorizonModelHorizonItemModel
    extends Model<TimeHorizon, any>, TimeHorizon{}

export type TimeHorizonModelHorizonStatic = typeof Model & {
    new (
        values?: any,
        options?: BuildOptions,
    ): TimeHorizonModelHorizonItemModel;
};

export const TimeHorizonModel = (
    sequelize: Sequelize,
): TimeHorizonModelHorizonStatic => {
    return <TimeHorizonModelHorizonStatic>sequelize.define('time_horizons', {
        id: {
            type: types.STRING,
            primaryKey: true,
        },
        startDate: types.DATE,
        endDate: types.DATE,
        title: types.STRING,
        orgId: types.STRING,
        visionId: types.STRING,
        contextId: types.STRING,
        updatedAt: types.DATE,
        deletedAt: types.DATE,
        createdAt: types.DATE,
    });
};
