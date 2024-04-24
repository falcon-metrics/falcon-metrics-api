import { BuildOptions, DataTypes, Model, Sequelize } from 'sequelize';
import { SequelizeDate } from './DatasourceModel';

import { writerConnection } from './sequelize';

export interface WorkflowEventsAttributes {
    orgId: string;
    datasourceId: string;
    workflowId: string;
    arrivalPointOrder: number;
    commitmentPointOrder: number;
    departurePointOrder: number;
    deletedAt?: SequelizeDate | null;
}

export interface WorkflowEventsModel
    extends Model<WorkflowEventsAttributes, any>,
        WorkflowEventsAttributes {}

export type WorkflowEventsStatic = typeof Model & {
    new (
        values?: Record<string, unknown>,
        options?: BuildOptions,
    ): WorkflowEventsModel;
};

const types: typeof DataTypes = Sequelize as any;

export const WorkflowEventsFactory = (
    sequelize: Sequelize,
    _type?: any,
): WorkflowEventsStatic => <WorkflowEventsStatic>sequelize.define(
        'workflowEvent',
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
            arrivalPointOrder: types.INTEGER,
            commitmentPointOrder: types.INTEGER,
            departurePointOrder: types.INTEGER,
            deletedAt: types.DATE,
        },
        {
            timestamps: false,
        },
    );

export default async function (aurora?: Sequelize) {
    const sequelize = aurora || (await writerConnection());
    return WorkflowEventsFactory(sequelize);
}
