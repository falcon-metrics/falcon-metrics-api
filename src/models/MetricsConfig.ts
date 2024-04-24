import { DataTypes, Sequelize } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const MetricsConfig = (sequelize: Sequelize) =>
    sequelize.define('performance_metrics', {
        id: {
            type: types.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        orgId: {
            type: types.STRING,
            primaryKey: true,
        },
        metrics: {
            type: types.JSONB,
        },
        customViews: {
            type: types.JSONB,
        },
        createdAt: types.DATE,
        updatedAt: types.DATE,
    });
