import { Sequelize, DataTypes } from 'sequelize';
import { writerConnection } from './sequelize';

const types: typeof DataTypes = Sequelize as any;

export const Organisation = (
    sequelize: Sequelize,
    _type?: any
) =>
    sequelize.define(
        'organisation',
        {
            id: {
                type: types.STRING,
                primaryKey: true,
            },
            name: types.STRING,
            isOnTrial: types.BOOLEAN,
            accountAnniversaryDate: types.DATE,
            trialStartDate: types.DATE,
            trialEndDate: types.DATE,
            createdByUser: types.STRING,
            createdDate: types.DATE,
            isPayingAccount: types.BOOLEAN,
            currentTier: types.STRING,
            numberOfBoardsAndAggAvailable: types.STRING,
            companySize: types.STRING,
            country: types.STRING,
            state: types.STRING,
            enterprise: types.STRING,
            customerReference: types.STRING,
            businessRegNumber: types.STRING,
            technicalContact: types.STRING,
            billingContact: types.STRING,
            referenceCode: types.STRING,
            needHelp: types.BOOLEAN,
            MSASignedBy: types.STRING,
            MSASignedAt: types.DATE,
            companyDomain: types.STRING,
            addressLine1: types.STRING,
            addressLine2: types.STRING,
            city: types.STRING,
            zipcode: types.STRING,
            seeSampleData: types.BOOLEAN,
        },
        {
            timestamps: false,
        },
    );

export default async function () {
    const sequelize = await writerConnection();
    return Organisation(sequelize);
}
