import { DataTypes, Sequelize } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const Events = (sequelize: Sequelize) => {
    return sequelize.define('events', {
        id: {
            type: types.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        description: types.STRING,
        event_name: types.STRING,
        username: types.STRING,
        context_id: types.STRING,
        efective_date: types.DATE,
        createdAt: types.DATE,
        updatedAt: types.DATE,
        deletedAt: types.DATE,
        user_id: types.STRING,
        orgId: types.STRING
    });
};
