import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;
export const ForecastingSettingsModel = (sequelize: Sequelize, _type?: any) =>
    sequelize.define(
        'forecasting_settings',
        {
            roomId: {
                type: types.STRING,
                primaryKey: true,
            },
            orgId: {
                type: types.STRING,
                primaryKey: true,
            },
            teamPerformancePercentage: types.INTEGER,
            workExpansionPercentage: types.INTEGER,
            forecastPortfolio: types.BOOLEAN,
            forecastTeam: types.BOOLEAN,
            forecastIndividualContributor: types.BOOLEAN,
            predictiveAnalysisPrecision: types.STRING,
            sampleStartDate: types.STRING,
            sampleEndDate: types.STRING
        },
        {
            timestamps: false,
        },
    );
