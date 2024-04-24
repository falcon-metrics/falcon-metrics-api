import { DataTypes, Sequelize, Model, BuildOptions } from 'sequelize';
import { RawComment as CommentItemAttributes } from '../comments/interfaces';
const types: typeof DataTypes = Sequelize as any;
export interface CommentItemModel
    extends Model<CommentItemAttributes, any>,
        CommentItemAttributes {}

export type CommentItemStatic = typeof Model & {
    new (values?: object, options?: BuildOptions): CommentItemModel;
};

export const Comments = (sequelize: Sequelize): CommentItemStatic => {
    return <CommentItemStatic>sequelize.define('comments', {
        id: {
            type: types.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        comment: types.STRING,
        title: types.STRING,
        username: types.STRING,
        context_id: types.STRING,
        effective_date: types.DATE,
        createdAt: {
            type: types.DATE,
            defaultValue: types.NOW,
        },
        updatedAt: types.DATE,
        deletedAt: types.DATE,
        user_id: types.STRING,
        parentId: types.INTEGER,
        context: types.STRING,
        orgId: types.STRING,
        elementFields: types.JSONB,
    });
};
