import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const ObeyaRisksModel = (sequelize: Sequelize, _type?: any) =>
    sequelize.define(
        'obeya_risks',
        {
            description: types.STRING,
            name: types.STRING,
            roomId: types.STRING,
            owner: types.STRING,
            ownerName: types.STRING,
            status: types.STRING,
            likelihood: types.NUMBER,
            impactOnCost: types.NUMBER,
            impactOnSchedule: types.NUMBER,
            riskExposureDays: types.NUMBER,
            riskExposureAmount: types.NUMBER,
            createdBy: types.STRING,
            orgId: types.STRING,
            riskId: {
                type: types.STRING,
                primaryKey: true,
            },
            createdAt: types.DATE,
            modifiedAt: types.DATE,
            deletedAt: types.DATE,
        },
        {
            timestamps: false,
        },
    );
