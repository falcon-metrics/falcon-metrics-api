import { BuildOptions, DataTypes, Model, Sequelize } from 'sequelize';
import { DataType } from 'sequelize-typescript';

export interface ExtendedStateAttributes {
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
    changedDate: Date;
    arrivalDate: Date;
    commitmentDate: Date;
    departureDate: Date;
    flomatikaCreatedDate: Date;
    partitionKey: string;
    sortKey: string;
    classOfServiceId: string;
    natureOfWorkId: string;
    valueAreaId: string;
    parentId: string;
    customFields: string;
    deletedAt: Date;
    linkedItems: string;
    projectId: string;
    isBlocked?: boolean;
    isStale?: boolean;
    isDelayed?: boolean;
    isAboveSle?: boolean;
    isAboveSleByWipAge: boolean;
    isExpedited?: boolean;
    resolution?: string;
}

export interface ExtendedStateModelInterface
    extends Model<ExtendedStateAttributes>,
    ExtendedStateAttributes { }

export type ExtendedStateStatic = typeof Model & {
    new(
        values?: Record<string, unknown>,
        options?: BuildOptions,
    ): ExtendedStateModelInterface;
};

export const ExtendedStateModel = (
    sequelize: Sequelize,
): ExtendedStateStatic => {
    return <ExtendedStateStatic>sequelize.define(
        'states',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },

            flomatikaWorkItemTypeId: DataTypes.STRING,
            flomatikaWorkItemTypeLevel: DataTypes.STRING,
            flomatikaWorkItemTypeName: DataTypes.STRING,

            workItemId: DataTypes.STRING,
            title: DataTypes.STRING,
            workItemType: DataTypes.STRING,

            state: DataTypes.STRING,
            stateCategory: DataTypes.STRING,
            stateType: DataTypes.STRING,
            stateOrder: DataTypes.STRING,
            assignedTo: DataTypes.STRING,

            flomatikaWorkItemTypeServiceLevelExpectationInDays:
                DataTypes.INTEGER,

            changedDate: DataTypes.DATE,
            arrivalDate: DataTypes.DATE,
            commitmentDate: DataTypes.DATE,
            departureDate: DataTypes.DATE,

            flomatikaCreatedDate: DataTypes.DATE,
            partitionKey: DataTypes.STRING,
            sortKey: DataTypes.STRING,

            classOfServiceId: DataTypes.STRING,
            natureOfWorkId: DataTypes.STRING,
            valueAreaId: DataTypes.STRING,

            parentId: DataTypes.STRING,

            customFields: DataTypes.JSONB,
            deletedAt: DataTypes.DATE,

            linkedItems: DataTypes.JSONB,
            projectId: DataTypes.STRING,

            leadTimeInWholeDays: DataType.INTEGER,
            wipAgeInWholeDays: DataType.INTEGER,
            inventoryAgeInWholeDays: DataType.INTEGER,

            isBlocked: DataTypes.BOOLEAN,
            isStale: DataTypes.BOOLEAN,
            isDelayed: DataTypes.BOOLEAN,
            isAboveSle: DataTypes.BOOLEAN,
            isAboveSleByWipAge: DataTypes.BOOLEAN,
            isExpedited: DataTypes.BOOLEAN,
            isUnassigned: DataType.BOOLEAN,

            activeTime: DataType.INTEGER,
            waitingTime: DataType.INTEGER,
            flowEfficiency: DataType.FLOAT,

            resolution: DataType.STRING,

        },
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
