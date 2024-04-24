import { Sequelize, DataTypes } from 'sequelize';
import { ValueAreaItem } from '../data_v2/value_area';

const types: typeof DataTypes = Sequelize as any;

export const ValueAreaModel = (
    sequelize: Sequelize,
    _type?: any
) =>
    sequelize.define(
        'valueArea',
        {
            valueAreaId: {
                type: types.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            orgId: types.STRING,
            displayName: types.STRING,
        },
        {
            timestamps: false,
        },
    );

export const asValueAreaItem = (model: any): ValueAreaItem => {
    return {
        id: model.valueAreaId,
        displayName: model.displayName,
    };
};
