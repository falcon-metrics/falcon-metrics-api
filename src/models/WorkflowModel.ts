import { Sequelize, DataTypes } from 'sequelize';
import { writerConnection } from './sequelize';

const types: typeof DataTypes = Sequelize as any;

export const WorkflowModel = (sequelize: Sequelize, _type?: any) =>
    sequelize.define(
        'workflow',
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
            workflowName: types.STRING,
            projectId: types.STRING,
            deletedAt: types.DATE,
            datasourceWorkflowId: types.STRING,
        },
        {
            timestamps: false,
        },
    );

export default async function (aurora?: Sequelize) {
    const sequelize = aurora || (await writerConnection());
    return WorkflowModel(sequelize);
}
