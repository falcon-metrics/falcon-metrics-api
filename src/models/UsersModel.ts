import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const Users = (
    sequelize: Sequelize,
    _type?: any
) =>
    sequelize.define(
        'user',
        {
            orgId: {
                type: types.STRING,
                primaryKey: true,
            },
            userId: {
                type: types.STRING,
                primaryKey: true,
            },
            firstName: types.STRING,
            lastName: types.STRING,
            email: types.STRING,
            role: types.STRING,
            optInNewsletter: types.BOOLEAN,
            contactForDemo: types.BOOLEAN,
            termsAndCondSignedAt: types.DATE,
            hideProductTour: types.BOOLEAN,
            analyticsDashboardUrl: types.STRING,
            enableDashboardBanner: types.BOOLEAN,
        },
        {
            timestamps: false,
        },
    );
