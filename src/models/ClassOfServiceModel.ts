import { ClassOfServiceItem } from '../data_v2/class_of_service';
import { DataTypes, Sequelize } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const ClassOfServiceModel = (sequelize: Sequelize, _type?: any) =>
    sequelize.define(
        'classOfService',
        {
            classOfServiceId: {
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

export const asClassOfServiceItem = (model: any): ClassOfServiceItem => {
    return {
        id: model.classOfServiceId,
        displayName: model.displayName,
    };
};
