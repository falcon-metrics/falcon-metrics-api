import { Sequelize, DataTypes, Model, BuildOptions } from 'sequelize';
import { writerConnection } from './sequelize';

export interface WorkItemTypeMapAttributes {
    orgId: string;
    datasourceId: string;
    workflowId: string;
    workItemTypeId: string;
    datasourceWorkItemId: string;
    projectId: string;
    archived: boolean;
    serviceLevelExpectationInDays: number;
    isDistinct: boolean;
}

export interface WorkItemTypeMapModel
    extends Model<WorkItemTypeMapAttributes, any>,
    WorkItemTypeMapAttributes { }

export type WorkItemTypeMapStatic = typeof Model & {
    new(
        values?: Record<string, unknown>,
        options?: BuildOptions,
    ): WorkItemTypeMapModel;
};

const types: typeof DataTypes = Sequelize as any;

export const WorkItemTypeMapFactory = (
    sequelize: Sequelize,
    _type?: any
): WorkItemTypeMapStatic => {
    return <WorkItemTypeMapStatic>sequelize.define(
        'workItemTypeMap',
        {
            orgId: {
                type: types.STRING,
                primaryKey: true,
            },
            datasourceId: {
                type: types.STRING,
                primaryKey: true,
            },
            workflowId: {
                type: types.STRING,
                primaryKey: true,
            },
            workItemTypeId: {
                type: types.STRING,
                primaryKey: true,
            },
            datasourceWorkItemId: {
                type: types.STRING,
                primaryKey: true,
            },
            archived: {
                type: types.BOOLEAN,
            },
            projectId: {
                type: types.STRING,
                primaryKey: true,
            },
            serviceLevelExpectationInDays: types.INTEGER,
            level: types.STRING,
            isDistinct: types.BOOLEAN
        },
        {
            timestamps: false,
        },
    );
};

export default async function (aurora?: Sequelize) {
    const sequelize = aurora || (await writerConnection());
    return WorkItemTypeMapFactory(sequelize);
}
