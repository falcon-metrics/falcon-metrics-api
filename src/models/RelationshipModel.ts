import { DataTypes, Sequelize } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const Relationship = (sequelize: Sequelize) => {
    return sequelize.define('relationships', {
        id: { type: types.TEXT, primaryKey: true },
        orgId: types.STRING,
        fromId: types.STRING,
        fromType: types.STRING,
        toId: types.STRING,
        toType: types.STRING,
        linkType: types.STRING
    }, {
        paranoid: false,
        timestamps: false
    });
};
