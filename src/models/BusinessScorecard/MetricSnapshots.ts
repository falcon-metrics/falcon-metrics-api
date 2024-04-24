import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;
export const MetricSnapshotModel = (sequelize: Sequelize, _type?: any) =>
    sequelize.define(
        'business_scorecard_metric_snapshots',
        {
            metric_snapshot_id: {
                type: types.INTEGER,
                primaryKey: true,
            },
            metric_id: types.INTEGER,
            value: types.FLOAT,
            createdAt: {
                type: types.DATE,
                defaultValue: types.NOW,
            },
            updatedAt: types.DATE,
        }
    );
