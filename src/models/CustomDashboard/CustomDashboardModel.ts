import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;
export const CustomDashboardDataModel = (sequelize: Sequelize, _type?: any) =>
    sequelize.define(
        'custom_dashboard_data',
        {
            dashboardId: {
                type: types.STRING,
                primaryKey: true,
            },
            userId: types.STRING,
            dashboardLayout: types.JSONB,
            dashboardTitle: types.STRING,
            dashboardGroups: types.JSONB,
            createdAt: {
                type: types.DATE,
                defaultValue: types.NOW,
            },
            updatedAt: types.DATE,
            userGroupId: types.STRING
        }
    );
