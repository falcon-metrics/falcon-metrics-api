import { Sequelize, DataTypes } from 'sequelize';

export const KeyResultsModel = (sequelize: Sequelize) =>
    sequelize.define(
        'obeya_keyResults',
        {
            orgId: {
                type: DataTypes.STRING,
            },
            roomId: DataTypes.STRING,
            contextId: DataTypes.STRING,
            objectiveId: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
            keyResultId: {
                type: DataTypes.STRING,
            },
            keyResultDescription: DataTypes.STRING,
            completed: DataTypes.BOOLEAN,
            parentWorkItemId: DataTypes.STRING,
            parentWorkItemTitle: DataTypes.STRING,
            ratingId: DataTypes.STRING,
            ratingDescription: DataTypes.STRING,
            includeChildren: DataTypes.BOOLEAN,
            includeRelated: DataTypes.BOOLEAN,
            includeChildrenOfChildren: DataTypes.BOOLEAN,
            includeChildrenOfRelated: DataTypes.BOOLEAN,
            childItemLevel: DataTypes.NUMBER,
            linkTypes: DataTypes.JSONB,
            initiativeId: DataTypes.STRING,
            strategyId: DataTypes.NUMBER
        },
        {
            timestamps: true,
        },
    );
