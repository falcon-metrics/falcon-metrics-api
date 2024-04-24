import { Sequelize, DataTypes } from 'sequelize';

export const LinkMapLayoutModel = (sequelize: Sequelize) =>
    sequelize.define(
        'link_map_layout',
        {
            id: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
            orgId: DataTypes.STRING,
            mapLayout: DataTypes.JSONB
        },
        {
            timestamps: false,
        },
    );
