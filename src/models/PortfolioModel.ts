import { DataTypes, Sequelize } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const PortfolioModel = (sequelize: Sequelize) => {
    return sequelize.define('portfolios', {
        id: {
            type: types.STRING,
            primaryKey: true,
        },
        colour: types.STRING,
        order: types.NUMBER,
        orgId: types.STRING,
        columnId: types.STRING,
        columnName: types.STRING,
        createdAt: types.DATE,
        updatedAt: types.DATE,
        deletedAt: types.DATE,
    });
};
