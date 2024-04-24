import { Logger } from 'pino';
import { Op, Sequelize, Transaction, fn } from 'sequelize';
import { GroupUser as GroupUserModel } from '../models/GroupUser';
import { UserGroup as UserGroupModel } from '../models/UserGroup';
import { GroupUser, UserGroup } from './types';
import _ from 'lodash';
import { CustomDashboardDataModel } from '../models/CustomDashboard/CustomDashboardModel';

export class GroupCrud {
    private database: Promise<Sequelize>;
    private logger: Logger;
    GROUPS_PER_PAGE = 10;

    constructor(opts: { aurora: Promise<Sequelize>; logger: Logger }) {
        this.database = opts.aurora;
        this.logger = opts.logger;
    }

    private async getGroupModel() {
        const sequelize = await this.database;
        return UserGroupModel(sequelize);
    }

    private async getCustomDashboardModel() {
        const sequelize = await this.database;
        return CustomDashboardDataModel(sequelize);
    }

    async createGroup({
        name,
        orgId,
        description,
        createdBy,
    }: {
        name: string;
        orgId: string;
        description?: string;
        createdBy?: string;
    }): Promise<UserGroup | undefined> {
        try {
            const Group = await this.getGroupModel();
            const group = await Group.create({
                name,
                orgId,
                description,
                createdBy,
            });

            this.logger.info({
                message: 'Group created',
                orgId,
            });

            return group.toJSON();
        } catch (error) {
            this.logger.error({
                message: 'Error creating group',
                orgId,
                errorMessage: error.message,
                errorStack: error.stack,
            });

            throw error;
        }
    }

    async getGroup(
        groupId: string,
        orgId: string,
    ): Promise<UserGroup | undefined> {
        try {
            const Group = await this.getGroupModel();
            const group = await Group.findOne({
                where: {
                    id: groupId,
                    orgId,
                },
            });

            this.logger.info({
                message: 'Group retrieved',
                orgId,
            });

            return group?.toJSON();
        } catch (error) {
            this.logger.error({
                message: 'Error retrieving group',
                orgId,
                errorMessage: error.message,
                errorStack: error.stack,
            });

            throw error;
        }
    }

    async updateGroup(
        groupId: string,
        orgId: string,
        name?: string,
        description?: string,
    ): Promise<number> {
        try {
            const Group = await this.getGroupModel();
            const [updatedCount] = await Group.update(
                {
                    name,
                    description,
                },
                {
                    where: {
                        id: groupId,
                        orgId,
                    },
                },
            );

            this.logger.info({
                message: 'Group updated',
                orgId,
            });

            return updatedCount;
        } catch (error) {
            this.logger.error({
                message: 'Error updating group',
                orgId,
                errorMessage: error.message,
                errorStack: error.stack,
            });

            throw error;
        }
    }

    async deleteGroup(groupId: string, orgId: string): Promise<number> {
        try {
            const Group = await this.getGroupModel();
            const deletedCount = await Group.destroy({
                where: {
                    id: groupId,
                    orgId,
                },
            });

            this.logger.info({
                message: 'Group deleted',
                orgId,
            });

            return deletedCount;
        } catch (error) {
            this.logger.error({
                message: 'Error deleting group',
                orgId,
                errorMessage: error.message,
                errorStack: error.stack,
            });

            throw error;
        }
    }

    async getGroups(orgId: string, page: number): Promise<UserGroup[]> {
        try {
            const Group: any = await this.getGroupModel();
            const CustomDashboardDataModel: any = await this.getCustomDashboardModel(); 

            const offset = page * this.GROUPS_PER_PAGE;
            const groups = await Group.findAll({
                where: { orgId },
                order: [['name', 'ASC']],
                limit: this.GROUPS_PER_PAGE,
                offset,
            });

            const dashboardMap: any = {};

            for (const group of groups) {
                const dashboardData = await CustomDashboardDataModel.findOne({
                    where: {
                        userGroupId: group.id,
                    },
                    attributes: ['dashboardId'],
                    order: [['createdAt', 'DESC']], // this can be omitted since dashboard to group is now 1:1
                });

                dashboardMap[group.id] = dashboardData
                    ? dashboardData.dashboardId
                    : null;
            }

            const groupsWithDashboardIds = groups.map((group: any) => ({
                ...group.toJSON(),
                dashboardId: dashboardMap[group.id] || null,
            }));

            return groupsWithDashboardIds;
        } catch (error) {
            this.logger.error({
                message: 'Error retrieving groups in organization',
                orgId,
                errorMessage: error.message,
                errorStack: error.stack,
            });

            throw error;
        }
    }

    async getGroupCount(orgId: string): Promise<number> {
        try {
            const Group = await this.getGroupModel();

            const count = await Group.count({
                where: {
                    orgId,
                },
            });

            this.logger.info({
                message: 'Group count in organization retrieved',
                orgId,
                count,
            });

            return count;
        } catch (error) {
            this.logger.error({
                message: 'Error retrieving group count in organization',
                orgId,
                errorMessage: error.message,
                errorStack: error.stack,
            });

            throw error;
        }
    }
}

export class GroupUsersCrud {
    private database: Promise<Sequelize>;
    private logger: Logger;

    constructor(opts: { aurora: Promise<Sequelize>; logger: Logger }) {
        this.database = opts.aurora;
        this.logger = opts.logger;
    }

    private async getGroupUsersModel() {
        const sequelize = await this.database;
        return GroupUserModel(sequelize);
    }

    private async getGroupModel() {
        const sequelize = await this.database;
        return UserGroupModel(sequelize);
    }

    async addUsersToGroup(
        userIds: string[],
        groupId: string,
        orgId: string,
        addedBy?: string,
    ) {
        const database = await this.database;
        const transaction = await database.transaction();

        try {
            for (const userId of userIds) {
                await this.addOrUpdateUserToGroup(
                    userId,
                    groupId,
                    orgId,
                    addedBy,
                    transaction,
                );
            }
            await transaction?.commit();
        } catch (e) {
            await transaction?.rollback();
            this.logger.error(
                JSON.stringify({
                    message: 'Error when adding users',
                    errorMessage: (e as Error).message,
                    errorStack: (e as Error).stack,
                }),
            );
            throw e;
        }
    }

    async addOrUpdateUserToGroup(
        userId: string,
        groupId: string,
        orgId: string,
        addedBy?: string,
        transaction?: Transaction,
    ): Promise<GroupUser> {
        try {
            const Group = await this.getGroupModel();
            const group = await Group.findOne({
                where: {
                    id: groupId,
                    orgId,
                },
                transaction,
            });

            if (!group) {
                this.logger.error({
                    message: 'Group not found',
                    orgId,
                });

                throw new Error('Group not found');
            }

            const groupUserModel = await this.getGroupUsersModel();
            const [groupUser, created] = await groupUserModel.findOrCreate({
                where: {
                    userId,
                    groupId,
                    orgId,
                },
                defaults: {
                    addedBy,
                },
                transaction,
            });

            if (created) {
                this.logger.info({
                    message: 'User added to group',
                    orgId,
                });
            } else {
                this.logger.info({
                    message: 'User already in the group',
                    orgId,
                });
            }

            return groupUser.toJSON();
        } catch (error) {
            this.logger.error({
                message: 'Error adding or updating user to group',
                orgId,
                errorMessage: error.message,
                errorStack: error.stack,
            });

            throw error;
        }
    }

    async removeUserFromGroup(
        userId: string,
        groupId: string,
        orgId: string,
    ): Promise<number> {
        try {
            const Group = await this.getGroupModel();
            const group = await Group.findOne({
                where: {
                    id: groupId,
                    orgId,
                },
            });

            if (!group) {
                this.logger.error({
                    message: 'Group not found',
                    orgId,
                });

                throw new Error('Group not found');
            }

            const GroupUsers = await this.getGroupUsersModel();
            const deletedCount = await GroupUsers.destroy({
                where: {
                    userId,
                    groupId,
                    orgId,
                },
            });

            if (deletedCount > 0) {
                this.logger.info({
                    message: 'User removed from group',
                    orgId,
                });
            } else {
                this.logger.info({
                    message:
                        'User not found in the group (idempotent operation)',
                    orgId,
                });
            }

            return deletedCount;
        } catch (error) {
            this.logger.error({
                message: 'Error removing user from group',
                orgId,
                errorMessage: error.message,
                errorStack: error.stack,
            });

            throw error;
        }
    }

    async getUsersInGroup(
        groupId: string,
        orgId: string,
        page: number,
        pageSize: number,
        getAllIds = false,
    ): Promise<{ users: GroupUser[]; count: number }> {
        try {
            const Group = await this.getGroupModel();
            const group = await Group.findOne({
                where: {
                    id: groupId,
                    orgId,
                },
            });

            if (!group) {
                this.logger.error({
                    message: 'Group not found',
                    orgId,
                });

                throw new Error('Group not found');
            }

            const GroupUsers = await this.getGroupUsersModel();
            const offset = page * pageSize;
            const where = {
                groupId,
                orgId,
            };
            const usersInGroup = await GroupUsers.findAll({
                where,
                limit: getAllIds ? undefined : pageSize,
                offset: getAllIds ? undefined : offset,
                attributes: getAllIds ? ['userId'] : undefined,
            });

            const count = await GroupUsers.count({ where });

            this.logger.info({
                message: 'Users in group retrieved',
                orgId,
            });

            return { users: usersInGroup.map((m) => m.toJSON()), count };
        } catch (error) {
            this.logger.error({
                message: 'Error retrieving users in group',
                orgId,
                errorMessage: error.message,
                errorStack: error.stack,
            });

            throw error;
        }
    }

    async getGroupsOfUsers(
        userIds: string[],
        orgId: string,
    ): Promise<
        (GroupUser & { id: string; name: string; description: string })[]
    > {
        const GroupUsers = await this.getGroupUsersModel();
        const rows = await GroupUsers.findAll({
            where: {
                userId: {
                    [Op.in]: userIds,
                },
                orgId,
            },
        });
        const groupIds = rows.map((r) => r.toJSON().groupId);

        const Group = await this.getGroupModel();
        const groups = await Group.findAll({
            where: {
                id: {
                    [Op.in]: groupIds,
                },
                orgId,
            },
        });
        return groups.map((g) => {
            const obj = g.toJSON();
            const row = rows.find((r) => r.toJSON().groupId === obj.id);
            const group = _.pick(g.toJSON(), ['id', 'name', 'description']);
            return { ...group, ...row?.toJSON() } as any;
        });
    }

    async getUsersCount(
        orgId: string,
        groupIds: string[],
    ): Promise<Record<any, any>[]> {
        try {
            const model = await this.getGroupUsersModel();

            const rows = await model.findAll({
                where: {
                    orgId,
                    groupId: {
                        [Op.in]: groupIds,
                    },
                },
                attributes: ['groupId', [fn('COUNT', 'groupId'), 'count']],
                group: ['groupId'],
            });

            // this.logger.info({
            //     message: 'Group count in organization retrieved',
            //     orgId,
            //     count,
            // });

            return rows.map((r) => r.toJSON());
        } catch (error) {
            this.logger.error({
                message: 'Error retrieving group count in organization',
                orgId,
                errorMessage: error.message,
                errorStack: error.stack,
            });

            throw error;
        }
    }
}
