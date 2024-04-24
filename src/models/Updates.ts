import { DataTypes, Sequelize, Model, BuildOptions } from 'sequelize';
import { UpdateItem } from '../updates/interfaces';
const types: typeof DataTypes = Sequelize as any;

export interface UpdateModel extends Model<UpdateItem, any>, UpdateItem { }

export type UpdateStaticItem = typeof Model & {
    new(values?: object, options?: BuildOptions): UpdateModel;
};

export const Updates = (sequelize: Sequelize): UpdateStaticItem => {
    return <UpdateStaticItem>sequelize.define('temp_updates', {
        id: {
            type: types.STRING,
            primaryKey: true,
        },
        parentId: types.STRING,
        orgId: types.STRING,
        initiativeId: types.STRING,
        userId: types.STRING,
        username: types.STRING,
        name: types.STRING,
        feedType: types.STRING,
        updateType: types.STRING,
        updateMetadata: types.JSONB,
        updateText: types.STRING,
        updatedAt: types.DATE,
        deletedAt: types.DATE,
        createdAt: {
            type: types.DATE,
            defaultValue: types.NOW,
        },
        feedImages: types.JSONB,
        updateNotes: types.STRING,
        reactions: types.STRING,
    });
};
