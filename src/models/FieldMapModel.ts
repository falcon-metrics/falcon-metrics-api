import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const FieldMapModel = (sequelize: Sequelize, _type?: any) =>
    sequelize.define(
        'fieldMap',
        {
            flomatikaFieldName: {
                type: types.STRING,
                primaryKey: true,
            },
            orgId: {
                type: types.STRING,
                primaryKey: true,
            },
            datasourceId: {
                type: types.STRING,
                primaryKey: true,
            },
            datasourceFieldName: {
                type: types.STRING,
                primaryKey: true,
            },
            datasourceFieldValue: {
                type: types.STRING,
                primaryKey: true,
            },
            flomatikaFieldValue: types.STRING,
        },
        {
            timestamps: false,
        },
    );
