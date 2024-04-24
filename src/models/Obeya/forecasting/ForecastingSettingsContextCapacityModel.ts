import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;
export const ForecastingSettingContextCapacityModel = (
    sequelize: Sequelize,
    _type?: any,
) =>
    sequelize.define(
        'forecasting_setting_context_capacity',
        {
            roomId: {
                type: types.STRING,
                primaryKey: true,
            },
            orgId: {
                type: types.STRING,
                primaryKey: true,
            },
            contextId: {
                type: types.STRING,
                primaryKey: true,
            },
            contextName: types.STRING,
            capacityPercentage: types.INTEGER,
        },
        {
            timestamps: false,
        },
    );
