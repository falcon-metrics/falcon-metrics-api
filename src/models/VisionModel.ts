import { DataTypes, Sequelize, Model, BuildOptions } from 'sequelize';
import { VisionItem as VisionItemAttributes } from '../visions/interfaces';

const types: typeof DataTypes = Sequelize as any;

export interface VisionItemModel
    extends Model<VisionItemAttributes, any>,
    VisionItemAttributes { }

export type VisionItemStatic = typeof Model & {
    new(values?: any, options?: BuildOptions): VisionItemModel;
};

export const VisionsModel = (sequelize: Sequelize): VisionItemStatic => {
    return <VisionItemStatic>sequelize.define('visions', {
        id: {
            type: types.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        visionStatement: types.STRING,
        missionStatement: types.STRING,
        orgId: types.STRING,
        strategicDrivers: types.JSONB,

        createdAt: {
            type: types.DATE,
            defaultValue: types.NOW,
        },
        updatedAt: types.DATE,
        deletedAt: types.DATE,
    });
};
