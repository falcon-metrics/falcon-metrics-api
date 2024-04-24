import { Sequelize, DataTypes } from 'sequelize';

export const InsightsPatternsModel = (sequelize: Sequelize) =>
    sequelize.define(
        "insights_patterns",
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            title: DataTypes.STRING,
            iql: DataTypes.STRING,
            sql: DataTypes.STRING,
        },
        {
            timestamps: false,
        }
    );