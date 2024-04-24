import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;
export const MetricModel = (sequelize: Sequelize, _type?: any) =>
    sequelize.define(
        'business_scorecard_metrics',
        {
            metric_id: {
                type: types.STRING,
                primaryKey: true,
            },
            metric_name: types.STRING,
            metric_type: types.STRING,
            target: types.INTEGER,
            lower_limit: types.INTEGER,
            upper_limit: types.INTEGER,
            context_id: types.STRING,
            perspective_id: types.INTEGER,
            org_id: types.STRING,
            metric_values: types.JSONB,
            metric_unit: types.STRING,
            metric_trend_direction: types.STRING,
            createdAt: {
                type: types.DATE,
                defaultValue: types.NOW,
            },
            updatedAt: types.DATE,
        }
    );
