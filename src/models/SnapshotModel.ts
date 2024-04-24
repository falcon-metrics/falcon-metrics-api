import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const SnapshotModel = (sequelize: Sequelize) =>
    sequelize.define(
        'snapshot',
        {
            id: {
                type: types.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            workItemId: types.STRING,
            workItemType: types.STRING,
            flomatikaWorkItemTypeId: types.STRING,
            flomatikaWorkItemTypeName: types.STRING,
            flomatikaWorkItemTypeLevel: types.STRING,
            flomatikaSnapshotDate: types.DATE,
            state: types.STRING,
            stateCategory: types.STRING,
            stateOrder: types.STRING,
            stateType: types.STRING,
            assignedTo: types.STRING,
            revision: types.INTEGER,
            isFiller: types.BOOLEAN,
            flomatikaWorkItemTypeServiceLevelExpectationInDays: types.INTEGER,
            title: types.STRING,
            classOfServiceId: types.STRING,
            natureOfWorkId: types.STRING,
            valueAreaId: types.STRING,
            changedDate: types.DATE,

            partitionKey: types.STRING,
            sortKey: types.STRING,
            gs2PartitionKey: types.STRING,
            gs2SortKey: types.STRING,
            flomatikaCreatedBy: types.STRING,
            flomatikaCreatedDate: types.DATE,

            stepCategory: types.STRING,

            resolution: types.STRING,

            type: types.STRING,
            assignee: types.STRING,
            blockedReason: types.STRING,
            discardedReason: types.STRING,
            flagged: types.BOOLEAN

        },
        {
            // indexes: [
            //     {
            //         unique: true,
            //         fields: ['partitionKey', 'sortKey'],
            //     },
            //     {
            //         unique: false,
            //         fields: ['partitionKey', 'flomatikaSnapshotDate'],
            //     },
            //     {
            //         unique: false,
            //         fields: ['workItemId'],
            //     },
            // ],
        },
    );
