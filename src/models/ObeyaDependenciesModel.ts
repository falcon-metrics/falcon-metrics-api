import { Sequelize, DataTypes } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const ObeyaDependenciesModel = (sequelize: Sequelize, _type?: any) =>
    sequelize.define(
        'obeya_dependencies',
        {
            name: types.STRING,
            summary: types.STRING,
            roomId: types.STRING,
            blockedContextAddress: types.STRING,
            blockedName: types.STRING,
            blockerContextAddress: types.STRING,
            blockerName: types.STRING,
            severity: types.STRING,
            status: types.STRING,
            createdBy: types.STRING,
            orgId: types.STRING,
            dependencyId: {
                type: types.STRING,
                primaryKey: true,
            },
            dateOfImpact: types.DATE,
            createdAt: types.DATE,
            modifiedAt: types.DATE,
            deletedAt: types.DATE,
            enabledAssociatedItems: types.BOOLEAN,
        },
        {
            timestamps: false,
        },
    );
