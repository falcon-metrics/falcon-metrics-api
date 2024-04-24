import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;
export const PerspectivesModel = (sequelize: Sequelize, _type?: any) =>
    sequelize.define(
        'business_scorecard_perspectives',
        {
            perspective_id: {
                type: types.STRING,
                primaryKey: true,
            },
            perspective_name: types.STRING,
            org_id: types.STRING,
            createdAt: {
                type: types.DATE,
                defaultValue: types.NOW,
            },
            updatedAt: types.DATE,
        }
    );
