import { BuildOptions, DataTypes, Model, Sequelize } from 'sequelize';

import { SequelizeDate } from './DatasourceModel';

export interface StateAttributes {
    id: number;
    flomatikaWorkItemTypeId: string;
    flomatikaWorkItemTypeLevel: string;
    flomatikaWorkItemTypeName: string;
    workItemId: string;
    title: string;
    workItemType: string;
    state: string;
    stateCategory: string;
    stateType: string;
    stateOrder: string;
    assignedTo: string;
    flomatikaWorkItemTypeServiceLevelExpectationInDays: number;
    changedDate: SequelizeDate;
    arrivalDate: SequelizeDate;
    commitmentDate: SequelizeDate;
    departureDate: SequelizeDate;
    flomatikaCreatedDate: SequelizeDate;
    partitionKey: string;
    sortKey: string;
    classOfServiceId: string;
    natureOfWorkId: string;
    valueAreaId: string;
    parentId: string;
    customFields: string;
    deletedAt: SequelizeDate;
    linkedItems: string;
    projectId: string;
    resolution?: string;
    targetStart?: SequelizeDate;
    targetEnd?: SequelizeDate;
}

export interface StateModelInterface
    extends Model<StateAttributes, any>,
        StateAttributes {}

export type StateStatic = typeof Model & {
    new (
        values?: Record<string, unknown>,
        options?: BuildOptions,
    ): StateModelInterface;
};

const types: typeof DataTypes = Sequelize as any;

export const StateModel = (sequelize: Sequelize, _type?: any): StateStatic => {
    return <StateStatic>sequelize.define(
        'state',
        getStateModelDefinition(types),
        {
            indexes: [
                {
                    unique: true,
                    fields: ['partitionKey', 'sortKey'],
                },
                {
                    unique: false,
                    fields: ['workItemId'],
                },
            ],
        },
    );
};

export function getStateModelDefinition(_type?: any) {
    return {
        id: {
            type: types.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },

        flomatikaWorkItemTypeId: types.STRING,
        flomatikaWorkItemTypeLevel: types.STRING,
        flomatikaWorkItemTypeName: types.STRING,

        workItemId: types.STRING,
        title: types.STRING,
        workItemType: types.STRING,

        state: types.STRING,
        stateCategory: types.STRING,
        stateType: types.STRING,
        stateOrder: types.STRING,
        assignedTo: types.STRING,

        flomatikaWorkItemTypeServiceLevelExpectationInDays: types.INTEGER,

        changedDate: types.DATE,
        arrivalDate: types.DATE,
        commitmentDate: types.DATE,
        departureDate: types.DATE,

        flomatikaCreatedDate: types.DATE,
        partitionKey: types.STRING,
        sortKey: types.STRING,

        classOfServiceId: types.STRING,
        natureOfWorkId: types.STRING,
        valueAreaId: types.STRING,

        parentId: types.STRING,

        customFields: types.JSONB,
        deletedAt: types.DATE,

        linkedItems: types.JSONB,
        projectId: types.STRING,

        resolution: { type: types.STRING, allowNull: true },

        targetStart: types.DATE,
        targetEnd: types.DATE,
        baselines: types.JSONB,
        dependencies: types.JSONB,
    };
}
