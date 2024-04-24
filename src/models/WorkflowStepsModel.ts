import { Sequelize, DataTypes, Model, BuildOptions } from 'sequelize';
import { SequelizeDate } from './DatasourceModel';
import { writerConnection } from './sequelize';
export interface WorkflowStepsAttributes {
    orgId: string;
    datasourceId: string;
    workflowId: string;
    id: string;
    projectId: string;
    name: string;
    stateCategory: string;
    stateType: string;
    order: number;
    active: boolean;
    deletedAt?: SequelizeDate | null;
}

export interface WorkflowStepsModel
    extends Model<WorkflowStepsAttributes, any>,
        WorkflowStepsAttributes {}

export type WorkflowStepsStatic = typeof Model & {
    new (
        values?: Record<string, unknown>,
        options?: BuildOptions,
    ): WorkflowStepsModel;
};

const types: typeof DataTypes = Sequelize as any;

export const WorkflowStepsFactory = (
    sequelize: Sequelize,
    _type?: any
): WorkflowStepsStatic => <WorkflowStepsStatic>sequelize.define(
        'workflowStep',
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
            id: {
                type: types.STRING,
                primaryKey: true,
            },
            name: {
                type: types.STRING,
                primaryKey: true,
            },
            projectId: types.STRING,
            stateCategory: types.STRING,
            stateType: types.STRING,
            order: types.INTEGER,
            active: types.BOOLEAN,
            deletedAt: types.DATE,
        },
        {
            timestamps: false,
        },
    );

export default async function (aurora?: Sequelize) {
    const sequelize = aurora || (await writerConnection());
    return WorkflowStepsFactory(sequelize);
}
