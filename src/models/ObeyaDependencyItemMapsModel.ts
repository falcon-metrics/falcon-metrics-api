import {
    Sequelize,
    DataTypes
} from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const ObeyaDependencyItemMapsModel = (sequelize: Sequelize) =>
    sequelize.define(
        'obeya_dependencyItemMaps',
        {
            roomId: types.STRING,
            orgId: types.STRING,
            dependencyMapId: {
                type: types.UUIDV4,
                autoIncrement: true,
                primaryKey: true,
            },
            createdAt: types.DATE,
            modifiedAt: types.DATE,
            deletedAt: types.DATE,
            datasourceId: types.STRING,
            dependencyId: types.STRING,

            blockerContextId: types.STRING,
            blockerWorkItemId: types.STRING,
            blockerContextName: types.STRING,
            blockerWorkItemTitle: types.STRING,

            blockedContextId: types.STRING,
            blockedWorkItemId: types.STRING,
            blockedContextName: types.STRING,
            blockedWorkItemTitle: types.STRING,
        },
        {
            timestamps: false,
        },
    );
