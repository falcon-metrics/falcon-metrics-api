import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const ContextWorkItemMapModel = (
    sequelize: Sequelize,
    _type?: any
) =>
    sequelize.define('contextWorkItemMap', {
        contextId: {
            type: types.STRING,
            primaryKey: true,
        },
        workItemId: {
            type: types.STRING,
            primaryKey: true,
        },
        orgId: types.STRING,
    });
