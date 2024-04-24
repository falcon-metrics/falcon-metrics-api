import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const ObjectivesModel = (sequelize: Sequelize) =>
    sequelize.define(
        'obeya_objectives',
        {
            orgId: {
                type: types.STRING,
                primaryKey: true,
            },
            roomId: {
                type: types.STRING,
                primaryKey: true,
            },
            objectiveId: {
                type: types.STRING,
                primaryKey: true,
            },
            objectiveDescription: types.STRING,
            ratingId: types.STRING,
            ratingDescription: types.STRING,
            achieved: types.BOOLEAN,
            contextId: types.STRING,
            strategyId: types.STRING
        },
        {
            timestamps: true,
        },
    );
