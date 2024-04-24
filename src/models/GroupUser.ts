import { DataTypes, Sequelize } from 'sequelize';


export const GroupUser = (sequelize: Sequelize) => {
    return sequelize.define('group_users', {
        userId: {
            type: DataTypes.STRING,
            allowNull: false,
            primaryKey: true
        },
        groupId: {
            type: DataTypes.UUID,
            allowNull: false,
            primaryKey: true
        },
        orgId: {
            type: DataTypes.STRING,
            allowNull: false,
            primaryKey: true
        },
        addedBy: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false,
        },
        deletedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    });
};


