import {
    BuildOptions,
    DataTypes,
    Model,
    Sequelize,
} from 'sequelize';

import { writerConnection } from './sequelize';

export type OrganizationSettingAttributes = {
    orgId: string;
    rollingWindowPeriodInDays: number;
    portfolioDisplayName: string;
    initiativeDisplayName: string;
    teamDisplayName: string;
    staledItemNumberOfDays: string;
    logoUrl: string;
    timezone: string;
    ingestAssignee: boolean;
    ingestTitle: boolean;
    staledItemIndividualContributorNumberOfDays?: string;
    staledItemPortfolioLevelNumberOfDays?: string;
    staledItemTeamLevelNumberOfDays?: string;
    excludeWeekends: boolean;
};

export interface OrganizationSettingsModel
    extends Model<OrganizationSettingAttributes, any>,
    OrganizationSettingAttributes { }

export type OrganizationSettingsStatic = typeof Model & {
    new(
        values?: Record<string, unknown>,
        options?: BuildOptions,
    ): OrganizationSettingsModel;
};

const types: typeof DataTypes = Sequelize as any;

export const SettingsModel = (
    sequelize: Sequelize,
    _type?: any
): OrganizationSettingsStatic => <OrganizationSettingsStatic>sequelize.define(
    'setting',
    {
        orgId: {
            type: types.STRING,
            primaryKey: true,
        },
        rollingWindowPeriodInDays: types.INTEGER,
        portfolioDisplayName: types.STRING,
        initiativeDisplayName: types.STRING,
        teamDisplayName: types.STRING,
        staledItemNumberOfDays: types.STRING,
        staledItemIndividualContributorNumberOfDays: types.STRING,
        staledItemPortfolioLevelNumberOfDays: types.STRING,
        staledItemTeamLevelNumberOfDays: types.STRING,
        logoUrl: types.STRING,
        timezone: types.STRING,
        ingestAssignee: {
            type: types.BOOLEAN,
            defaultValue: false,
        },
        ingestTitle: {
            type: types.BOOLEAN,
            defaultValue: false,
        },
        excludeWeekends: {
            type: types.BOOLEAN,
            defaultValue: false,
        },
    },
    {
        timestamps: false,
    },
);

export default async function () {
    const sequelize = await writerConnection();
    return SettingsModel(sequelize);
}
