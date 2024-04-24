import { BuildOptions, Model, Sequelize, DataTypes } from 'sequelize';
import { SequelizeDate } from './DatasourceModel';

export interface ContextWorkItemMapAttributes {
    contextId: string;
    workItemId: string;
    orgId: string;
    deletedAt: SequelizeDate;
}

export interface ContextWorkItemMapModelType
    extends Model<ContextWorkItemMapAttributes, any>,
        ContextWorkItemMapAttributes {}

export type ContextWorkItemMapStatic = typeof Model & {
    new (values?: object, options?: BuildOptions): ContextWorkItemMapModelType;
};

const types: typeof DataTypes = Sequelize as any;

export const ContextWorkItemMapFactory = (
    sequelize: Sequelize,
    _type?: any,
): ContextWorkItemMapStatic => <ContextWorkItemMapStatic>sequelize.define(
        'contextWorkItemMap',
        {
            contextId: {
                type: types.STRING,
                primaryKey: true,
            },
            workItemId: {
                type: types.STRING,
                primaryKey: true,
            },
            orgId: types.STRING,
        },
    );
