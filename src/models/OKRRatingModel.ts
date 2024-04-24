import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const OKRRatingModel = (
    sequelize: Sequelize,
    _type?: any
) =>
    sequelize.define(
        'obeya_okr_ratings',
        {
            orgId: {
                type: types.STRING,
                primaryKey: true,
            },
            ratingId: {
                type: types.STRING,
                primaryKey: true,
            },
            ratingDescription: types.STRING,
        },
        {
            timestamps: false,
        },
    );
