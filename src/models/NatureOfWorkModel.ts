import { Sequelize, DataTypes } from 'sequelize';
import { NatureOfWorkItem } from '../data_v2/nature_of_work';

const types: typeof DataTypes = Sequelize as any;

export const NatureOfWorkModel = (sequelize: Sequelize, _type?: any) =>
    sequelize.define(
        'natureOfWork',
        {
            natureOfWorkId: {
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

export const asNatureOfWorkItem = (model: any): NatureOfWorkItem => {
    return {
        id: model.natureOfWorkId,
        displayName: model.displayName,
    };
};
