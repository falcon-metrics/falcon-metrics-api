import { DataTypes, Sequelize, Model, BuildOptions } from 'sequelize';
import { StrategicDriver as VisionStrategicDriverItemAttributes } from '../visions/interfaces';

const types: typeof DataTypes = Sequelize as any;

export interface VisionStrategicDriverItemModel
    extends Model<VisionStrategicDriverItemAttributes, any>,
    VisionStrategicDriverItemAttributes { }

export type VisionStrategicDriverItemStatic = typeof Model & {
    new(values?: any, options?: BuildOptions): VisionStrategicDriverItemModel;
};

export const VisionStrategicDriverModel = (sequelize: Sequelize): VisionStrategicDriverItemStatic => {
    return <VisionStrategicDriverItemStatic>sequelize.define('vision_strategic_drivers', {
        id: {
            type: types.STRING,
            primaryKey: true,
        },
        name: types.STRING,
        colour: types.STRING,
        icon_name: types.STRING,
        description: types.STRING,
        vision_id: types.INTEGER,
        org_id: types.STRING,
        oneLineSummary: types.STRING,
    });
};
