import { Sequelize, DataTypes, BuildOptions, Model } from 'sequelize';
import { SequelizeDate } from './DatasourceModel';
import { writerConnection } from './sequelize';

export interface WorkItemTypeAttributes {
    orgId: string;
    workItemTypeId: string;
    displayName: string;
    level: string;
    serviceLevelExpectationInDays: number;
    deletedAt?: SequelizeDate | null;
}

export interface WorkItemTypeModel
    extends Model<WorkItemTypeAttributes, any>,
        WorkItemTypeAttributes {}

export type WorkItemTypeStatic = typeof Model & {
    new (
        values?: Record<string, unknown>,
        options?: BuildOptions,
    ): WorkItemTypeModel;
};

const types: typeof DataTypes = Sequelize as any;

export const WorkItemTypeFactory = (
    sequelize: Sequelize,
    _type?: any,
): WorkItemTypeStatic => <WorkItemTypeStatic>sequelize.define(
        'workItemType',
        {
            orgId: {
                type: types.STRING,
                primaryKey: true,
            },
            workItemTypeId: {
                type: types.STRING,
                primaryKey: true,
            },
            displayName: types.STRING,
            level: types.STRING,
            serviceLevelExpectationInDays: types.INTEGER,
            deletedAt: types.DATE,
        },
        {
            timestamps: false,
        },
    );

export default async function (aurora?: Sequelize) {
    const sequelize = aurora || (await writerConnection());
    return WorkItemTypeFactory(sequelize);
}
