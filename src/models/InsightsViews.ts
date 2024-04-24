import {
    DataTypes,
    Sequelize,
} from 'sequelize';

export const InsightsViews = (sequelize: Sequelize) =>
    sequelize.define(
        'insights_views',
        {
            id: {
                primaryKey: true,
                autoIncrement: true,
                type: DataTypes.INTEGER,
            },
            orgId: {
                type: DataTypes.STRING,
            },
            context_id: {
                primaryKey: true,
                type: DataTypes.STRING,
            },
            query_parameters: DataTypes.STRING,
            name: DataTypes.STRING,
            rolling_window_in_days: DataTypes.NUMBER,
        },
        {
            timestamps: false,
        },
    );
