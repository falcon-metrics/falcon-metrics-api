import { asClass, Lifetime } from "awilix";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { Logger } from 'log4js';
import { DateTime } from "luxon";
import { BaseHandler } from "../common/base_handler";
import { SecurityContext } from "../common/security";
import { Secrets } from "../secrets/secretsmanager_client";
import { GroupCrud, GroupUsersCrud } from "../user_groups/database";
import { v4 } from "uuid";
import { UsersHandler } from "../users/handler";
import { UserProfile } from "./types";



export type UserGroup = {
    name: string;
    orgId: string;
    description?: string;
    id: string;
    createdAt: DateTime;
    createdBy: string;
};

export type GroupUser = {
    orgId: string;
    userId: string;
    addedAt: DateTime;
    addedBy: string;
    groupId: string;
};

class UserGroupsHandler extends BaseHandler {
    private orgId: string;
    private logger: Logger;
    private secretsManager: Secrets;
    security: SecurityContext;
    groupCrud: GroupCrud;
    groupUserCrud: GroupUsersCrud;
    usersHandler: UsersHandler;

    GROUPS_PER_PAGE = 10;
    GROUP_USERS_PER_PAGE = 10;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            groupCrud: asClass(GroupCrud, {
                lifetime: Lifetime.SCOPED
            }),
            groupUserCrud: asClass(GroupUsersCrud, {
                lifetime: Lifetime.SCOPED
            }),
        });
        this.security = this.dependencyInjectionContainer.cradle.security;
        if (this.security.organisation === undefined) throw new Error('orgId is undefined');
        this.orgId = this.security.organisation;
        this.logger = this.dependencyInjectionContainer.cradle.logger;
        this.secretsManager = new Secrets({ logger: this.logger });
        this.groupCrud = this.dependencyInjectionContainer.cradle.groupCrud;
        this.groupUserCrud = this.dependencyInjectionContainer.cradle.groupUserCrud;
        this.usersHandler = new UsersHandler(event);
    }

    async createGroupHandler(event: APIGatewayProxyEventV2): Promise<any> {
        try {
            const { body } = event;
            const { name, description, } = JSON.parse(body ?? '{}');
            const newGroup = await this.groupCrud.createGroup({
                name,
                orgId: this.orgId,
                description,
                createdBy: this.security.email
            });

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(newGroup),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async updateGroupHandler(event: APIGatewayProxyEventV2): Promise<any> {
        try {
            const { body, pathParameters } = event;
            const { groupId } = pathParameters ?? {};
            if (!groupId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Group ID is required' }),
                };
            }

            const group = await this.groupCrud.getGroup(groupId, this.orgId);
            if (!group) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'Group not found' }),
                };
            }

            const { name, description } = JSON.parse(body ?? '{}');

            const updatedCount = await this.groupCrud.updateGroup(groupId, this.orgId, name, description);

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ message: `${updatedCount} group(s) updated` })
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async getGroupsHandler(event: APIGatewayProxyEventV2): Promise<any> {
        try {
            const { queryStringParameters } = event;
            const page = Number.parseInt((queryStringParameters as any)?.page ?? '0') ?? 1;

            const [groups, totals] = await Promise.all([
                this.groupCrud.getGroups(this.orgId, page),
                this.groupCrud.getGroupCount(this.orgId)
            ]);

            const userCounts = await this.groupUserCrud.getUsersCount(this.orgId, groups.map(g => g.id));
            groups.forEach(g => {
                const obj = userCounts.find(uc => uc.groupId === g.id);
                g.userCount = Number.parseInt(obj?.count ?? '0');
            });

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ groups, totals }),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async deleteGroupHandler(event: APIGatewayProxyEventV2): Promise<any> {
        try {
            const { pathParameters } = event;
            const { groupId } = pathParameters ?? {};
            if (!groupId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Group ID is required' }),
                };
            }

            const group = await this.groupCrud.getGroup(groupId, this.orgId);
            if (!group) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'Group not found' }),
                };
            }

            await this.groupCrud.deleteGroup(groupId, this.orgId);

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async addUserToGroupHandler(event: APIGatewayProxyEventV2): Promise<any> {
        try {
            const { body, pathParameters } = event;
            const { userIds } = JSON.parse(body ?? '{}');
            const groupId = pathParameters?.groupId ?? '';

            if (!Array.isArray(userIds)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'userIds must be an array' }),
                };
            }

            const group = await this.groupCrud.getGroup(groupId, this.orgId);
            if (!group) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'Group not found' }),
                };
            }

            const groupUser = await this.groupUserCrud.addUsersToGroup(
                userIds,
                groupId,
                this.orgId,
                this.security.email
            );

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(groupUser),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async removeUserFromGroupHandler(event: APIGatewayProxyEventV2): Promise<any> {
        try {
            const { pathParameters } = event;
            const groupId = pathParameters?.groupId ?? '';
            const userId = pathParameters?.userId ?? '';

            const group = await this.groupCrud.getGroup(groupId, this.orgId);
            if (!group) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'Group not found' }),
                };
            }

            await this.groupUserCrud.removeUserFromGroup(userId, groupId, this.orgId);

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async getGroupUsersHandler(event: APIGatewayProxyEventV2): Promise<any> {
        try {
            const { pathParameters, queryStringParameters } = event;
            const { groupId } = pathParameters ?? {};
            if (!groupId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Group ID is required' }),
                };
            }

            const group = await this.groupCrud.getGroup(groupId, this.orgId);
            if (!group) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'Group not found' }),
                };
            }

            const page = Number.parseInt((queryStringParameters as any)?.page ?? '1') ?? 1;
            const getAllIds = queryStringParameters?.get_all_ids?.toLocaleLowerCase() === 'true';

            const { users: groupUsers, count: totals } = await this.groupUserCrud.getUsersInGroup(
                groupId,
                this.orgId,
                page,
                this.GROUP_USERS_PER_PAGE,
                getAllIds
            );

            let auth0Users: UserProfile[] = [];
            let result: any = groupUsers;
            if (!getAllIds && totals > 0) {
                const { users } = await this.usersHandler.getAuth0Users({ userIds: groupUsers.map(u => u.userId) });
                auth0Users = users;
                result = groupUsers
                    .map(gu => {
                        const user = auth0Users.find(u => u.user_id === gu.userId);
                        return {
                            ...gu,
                            user
                        };
                    })
                    .filter(obj => obj.user !== undefined);
            } else {
                result = groupUsers.map(gu => gu.userId);
            }

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ users: result, totals: result.length }),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }


}

export const createGroupHandler = async (
    event: APIGatewayProxyEventV2,
): Promise<any> => {
    return new UserGroupsHandler(event).createGroupHandler(event);
};

export const updateGroupHandler = async (
    event: APIGatewayProxyEventV2,
): Promise<any> => {
    return new UserGroupsHandler(event).updateGroupHandler(event);
};

export const getGroupsHandler = async (
    event: APIGatewayProxyEventV2,
): Promise<any> => {
    return new UserGroupsHandler(event).getGroupsHandler(event);
};

export const deleteGroupHandler = async (
    event: APIGatewayProxyEventV2,
): Promise<any> => {
    return new UserGroupsHandler(event).deleteGroupHandler(event);
};


export const getGroupUsersHandler = async (
    event: APIGatewayProxyEventV2,
): Promise<any> => {
    return new UserGroupsHandler(event).getGroupUsersHandler(event);
};

export const addUserToGroupHandler = async (
    event: APIGatewayProxyEventV2,
): Promise<any> => {
    return new UserGroupsHandler(event).addUserToGroupHandler(event);
};

export const removeUserFromGroupHandler = async (
    event: APIGatewayProxyEventV2,
): Promise<any> => {
    return new UserGroupsHandler(event).removeUserFromGroupHandler(event);
};


