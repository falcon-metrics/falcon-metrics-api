import { asClass, Lifetime } from "awilix";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { String } from "aws-sdk/clients/appstream";
import axios from "axios";
import jwt, { JwtPayload } from 'jsonwebtoken';
import _ from "lodash";
import { getLogger, Logger } from 'log4js';
import { v4 } from "uuid";
import { BaseHandler } from "../common/base_handler";
import { SecurityContext } from "../common/security";
import MailChimpSecret from "../contact_us/MailChimpSecret";
import { Secrets } from "../secrets/secretsmanager_client";
import { GroupCrud, GroupUsersCrud } from "../user_groups/database";
import { UserProfile } from "../user_groups/types";
import { auth0 } from '../profile';


const mailChimpSecret = new MailChimpSecret({ logger: getLogger() });
const mailchimpGetter = require('@mailchimp/mailchimp_transactional');
type GetAdminsResponse = Array<{
    user_id: string,
    email: string,
    picture: string,
    name: string,
}>;

type Auth0Role = {
    id: string;
    name: string;
    description: string;
};

export class UsersHandler extends BaseHandler {
    private orgId: string;
    private logger: Logger;
    private secretsManager: Secrets;
    AUTH0_M2M_TOKEN = 'AUTH0_M2M_TOKEN';
    USERS_PER_PAGE = 10;
    USER_ADMIN_ROLE_ID = 'rol_mWNxe3QQyt2WGtem';
    USER_ADMIN = 'user_admin';
    USERS_FETCH_CHUNK_SIZE = 5;
    groupCrud: GroupCrud;
    groupUserCrud: GroupUsersCrud;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            groupCrud: asClass(GroupCrud, {
                lifetime: Lifetime.SCOPED
            }),
            groupUserCrud: asClass(GroupUsersCrud, {
                lifetime: Lifetime.SCOPED
            }),
        });
        const security: SecurityContext = this.dependencyInjectionContainer.cradle.security;
        if (security.organisation === undefined) throw new Error('orgId is undefined');
        this.orgId = security.organisation;
        this.logger = this.dependencyInjectionContainer.cradle.logger;
        this.secretsManager = new Secrets({ logger: this.logger });
        this.groupCrud = this.dependencyInjectionContainer.cradle.groupCrud;
        this.groupUserCrud = this.dependencyInjectionContainer.cradle.groupUserCrud;
    }

    async createAuth0User(email: string, name: string) {
        const headers = await this.getHeaders();
        const body = JSON.stringify({
            email,
            name,
            user_metadata: {},
            blocked: false,
            email_verified: false,
            app_metadata: {
                user_organisation: this.orgId,
                "demo_data": false,
            },
            connection: "Username-Password-Authentication",
            password: v4(),
            verify_email: false,
        });
        const response = await axios.post(
            'https://example.auth0.com/api/v2/users',
            body,
            { headers }
        );
        return response.data;
    }
    async updateAuth0User(user: Record<any, any>, name: string, appMetadata?: Record<any, any>) {
        const headers = await this.getHeaders();
        const user_id: string = user.user_id;
        const body: any = {};
        if (!user_id.includes('google-oauth')) {
            body.name = name;
        }
        if (appMetadata) {
            body.app_metadata = appMetadata;
        }
        if (Object.keys(body).length > 0) {
            const url = `https://example.auth0.com/api/v2/users/${user_id}`;
            const response = await axios.patch(
                url,
                JSON.stringify(body),
                { headers }
            );
            return response.data;
        }
    }

    async getAuth0User(
        userId: string
    ): Promise<UserProfile> {
        const headers = await this.getHeaders();
        let query = `https://example.auth0.com/api/v2/users/${userId}`;
        const response = await axios.get(
            query,
            { headers }
        );
        return response.data;
    }

    async deleteAuth0User(
        userId: string
    ): Promise<UserProfile> {
        const headers = await this.getHeaders();
        let query = `https://example.auth0.com/api/v2/users/${userId}`;
        try {

            const response = await axios.delete(
                query,
                { headers }
            );
            return response.data;
        } catch (e) {
            console.log("error when deleting user", e);
            throw e;
        }
    }
    async getAuth0Users({
        page = 0,
        nameSearchPrefix,
        emailSearchPrefix,
        email,
        perPage = this.USERS_PER_PAGE,
        userIds,
        searchTerm,
        roles,
        withoutOrgId = false
    }: {
        page?: number;
        nameSearchPrefix?: string;
        emailSearchPrefix?: string;
        email?: string;
        searchTerm?: string;
        perPage?: number;
        userIds?: string[];
        roles?: string[];
        /**
         * To be used only in exceptional cases
         */
        withoutOrgId?: boolean;
    }): Promise<{ users: UserProfile[]; totals: number; }> {
        const headers = await this.getHeaders();
        let query = `https://example.auth0.com/api/v2/users?page=${page}&per_page=${perPage}&include_totals=true&sort=email:1`;
        const queries = [];
        if (!withoutOrgId) {
            queries.push(`app_metadata.user_organisation="${this.orgId}"`);
        }
        if (nameSearchPrefix) {
            queries.push(`name:${nameSearchPrefix}*`);
        }
        if (emailSearchPrefix && email) {
            throw new Error('Cannot use email prefix search and exact search together');
        }
        if (emailSearchPrefix) {
            queries.push(`email:${emailSearchPrefix}*`);
        }
        if (email) {
            // Encoding here to be able to handle special chars like +
            // Will not work without encoding
            const searchStr = encodeURIComponent(`${email}`);
            queries.push(`email:"${searchStr}"`);
        }
        if (userIds) {
            queries.push(`user_id:(${userIds.join(' ')})`);
        }
        if (searchTerm) {
            const encoded = encodeURIComponent(`${searchTerm}`);
            queries.push(`(email:*${encoded}* OR name:*${encoded}*)`);
        }
        if (roles) {
            const formattedRoles = roles.map(r => `"${r}"`).join(' ');
            queries.push(`app_metadata.roles:(${formattedRoles})`);
        }
        query = query.concat(`&q=${queries.join(' AND ')}`);

        const response = await axios.get(
            query,
            { headers }
        );
        return response.data;
    }

    private async cacheM2MToken(token: string) {
        return await this.secretsManager.setSecret(
            this.AUTH0_M2M_TOKEN,
            JSON.stringify({ token })
        );
    }

    private async getCachedM2MToken(): Promise<string | undefined> {
        try {
            return await this.secretsManager.getSecret(this.AUTH0_M2M_TOKEN, 'token');
        } catch (e) {
            this.logger.error(JSON.stringify({
                message: 'Error getting the cached M2M token',
                errorMessage: (e as Error).message
            }));
        }
    }

    private async getNewM2MToken(): Promise<string> {
        const response = await axios.post(
            'https://example.auth0.com/oauth/token',
            auth0
        );
        if (typeof response.data?.access_token !== 'string') {
            throw new Error('Invalid response. access_token not found in the response');
        }
        const access_token = response.data?.access_token;
        return access_token;
    }

    private isTokenExpired(token: string): boolean {
        try {
            const tokenExpiry = (jwt.decode(token) as JwtPayload).exp;
            if (Number.isInteger(tokenExpiry)) {
                return Date.now() >= ((tokenExpiry as number) * 1000);
            }
        } catch (e) {
            this.logger.error(JSON.stringify({
                message: 'Error when checking expiry'
            }));
        }

        return true;
    }


    async getM2MToken() {
        const cachedToken = await this.getCachedM2MToken();
        if (!cachedToken || this.isTokenExpired(cachedToken)) {
            const token = await this.getNewM2MToken();
            await this.cacheM2MToken(token);
            return token;
        } else {
            return cachedToken;
        }
    }

    async getHeaders() {
        const token = await this.getM2MToken();
        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${token}`
        };
    }

    async getPasswordResetLink(userId: string) {
        const token = await this.getM2MToken();
        const headers = {
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.5",
            "authorization": `Bearer ${token}`,
            "content-type": "application/json",
        };

        const body = {
            "user_id": userId,
            "result_url": "https://example.auth0.com/login",
            "ttl_sec": 0,
            "mark_email_as_verified": true,
            "includeEmailInRedirect": false
        };

        const response = await axios.post(
            "https://example.auth0.com/api/v2/tickets/password-change",
            body,
            { headers }
        );
        if (!response?.data?.ticket) throw new Error('ticket not found in response');
        return response.data.ticket + 'type=invite';
    }

    private validate(body: Record<any, any>): {
        payload: { name: string; email: string; isAdmin: boolean; };
        errors?: string[];
    } {
        const { name, email, isAdmin } = body;
        const errors: any[] = [];
        if (name === undefined || email === undefined) {
            errors.push('Invalid payload');
        }
        return {
            payload: { name, email, isAdmin }, errors
        };
    }
    private validatePathBody(body: Record<any, any>): {
        payload: { firstName: string; lastName: string; };
        errors?: string[];
    } {
        const { firstName, lastName } = body;
        const errors: any[] = [];
        if (firstName === undefined || lastName === undefined) {
            errors.push('Invalid payload');
        }
        return {
            payload: { firstName, lastName }, errors
        };
    }

    async sendMail(emailId: string, passwordResetLink: string) {
        const secret = await mailChimpSecret.getApiKey();
        const mailchimp = mailchimpGetter(secret);
        try {
            const response = await mailchimp.messages.send({
                message: {
                    from_email: 'support@falcon-metrics.com',
                    subject: 'Invitation to Falcon metrics',
                    html: `
                        <h4>You have been invited to Falcon metrics</h4>
                        <a href="${passwordResetLink}">Click here</a> to set your password.`,
                    to: [
                        {
                            email: emailId,
                            type: 'to',
                        },
                    ],
                },
            });

            if (response?.response?.data?.status === 'error') {
                throw new Error(response?.response?.data?.message ?? 'Error when sending an email');
            }
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async getRoles(): Promise<Auth0Role[]> {
        const headers = await this.getHeaders();
        let query = `https://example.auth0.com/api/v2/roles`;
        const response = await axios.get(
            query,
            { headers }
        );
        return response.data;
    }

    async assignRoles(userId: string, roleIds: string[]) {
        const headers = await this.getHeaders();
        let query = `https://example.auth0.com/api/v2/users/${userId}/roles`;
        const body = { roles: roleIds };
        const response = await axios.post(
            query,
            body,
            { headers }
        );
        return response.data;
    }
    async removeRoles(userId: string, roleIdsToRemove: string[]) {
        if (roleIdsToRemove.length === 0) return;
        const headers = await this.getHeaders();
        let query = `https://example.auth0.com/api/v2/users/${userId}/roles`;
        const body = { roles: roleIdsToRemove };
        const response = await axios.delete(
            query,
            {
                headers,
                data: body
            }
        );
        return response.data;
    }

    async getUsersRoles(userId: string): Promise<Auth0Role[]> {
        const headers = await this.getHeaders();
        let query = `https://example.auth0.com/api/v2/users/${userId}/roles`;
        const response = await axios.get(
            query,
            { headers }
        );
        return response.data;
    }

    async getAdminRole(): Promise<Auth0Role> {
        const roles = await this.getRoles();
        const adminRole = roles.find((r: any) => r.name === this.USER_ADMIN);
        if (!adminRole) {
            throw new Error(`Could not find the ${this.USER_ADMIN} role.`);
        }
        return adminRole;
    }

    async assignAdminRole(user: Record<any, any>) {
        const adminRole = await this.getAdminRole();
        const existingRoles = await this.getUsersRoles(user.user_id);
        const roleIds = Array.from(new Set([...existingRoles.map(r => r.id), adminRole.id]));
        await this.assignRoles(user.user_id, roleIds);

        const roles = await this.getUsersRoles(user.user_id);
        const appMetadata = user.app_metadata;
        appMetadata.roles = Array
            .from(
                new Set([
                    ...roles.map((r: any) => r.name),
                    ...appMetadata.roles ?? []
                ])
            );
        await this.updateAuth0User(user, user.name, user.app_metadata);
    }

    async getUserByEmail(email: string, withoutOrgId = false): Promise<UserProfile | undefined> {
        try {
            const result = await this.getAuth0Users({ email, withoutOrgId });
            const user = result.users[0];
            return user;
        } catch (e) {
            this.logger.error({
                message: 'Error fetching user by email',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            });
        }
    }

    async getUserById(userId: string): Promise<UserProfile | undefined> {
        try {
            const result = await this.getAuth0Users({
                userIds: [userId]
            });
            const user = result.users[0];
            return user;
        } catch (e) {
            this.logger.error({
                message: 'Error fetching user by email',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            });
        }
    }

    async getAllAdminUsers(page = 0): Promise<UserProfile[]> {
        const headers = await this.getHeaders();
        let query = `https://example.auth0.com/api/v2/roles/${this.USER_ADMIN_ROLE_ID}/users?page=${page}&per_page=${this.USERS_PER_PAGE}&include_totals=true`;
        const response = await axios.get(
            query,
            { headers }
        );
        const result = _.omit(response?.data, ['users']);
        const adminUsers: GetAdminsResponse = response?.data?.users ?? [];
        const chunks = _.chunk(adminUsers, this.USERS_FETCH_CHUNK_SIZE);
        const users = [];
        for (const chunk of chunks) {
            const results = await Promise.all(chunk.map(u => this.getAuth0User(u.user_id)));
            users.push(...results);
        }
        result.users = users;
        return result as any;
    }

    async createUser(event: APIGatewayProxyEventV2) {
        try {
            const { body } = event;
            const { payload: { name, email, isAdmin }, errors } = this.validate(
                JSON.parse(body ?? '{}')
            );
            if (errors?.length && errors.length > 0) {
                return {
                    statusCode: 400,
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ message: 'Invalid payload' }),
                };
            }

            const existingUser = await this.getUserByEmail(email, true);

            if (existingUser) {
                if (existingUser.app_metadata.user_organisation) {
                    // Users with user_organisation configured, cannot be deleted
                    let message = "A user with the same email address already exists. Please contact the administrator";

                    // user already exists in the same org
                    if (existingUser.app_metadata?.user_organisation === this.orgId) {
                        message = "A user with the same email address already exists in this tenant";
                    }
                    return {
                        statusCode: 409,
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ message }),
                    };
                } else {
                    // The user was created, but does not have the user_organisation configured. 
                    // This user can be deleted safely
                    this.logger.info({
                        message: 'Found an existing user with the same email id, deleting the user',
                        existingUser,
                        email,
                        body,
                        event
                    });
                    const deletedUser = await this.deleteAuth0User(existingUser.user_id);
                }
            }

            const user = await this.createAuth0User(email, name);

            this.logger.info({
                message: 'Created the auth0 user',
                user
            });

            if (isAdmin) {
                this.assignAdminRole(user);
                this.logger.info({
                    message: 'Assigned the admin role',
                    user
                });
            }
            const passwordResetLink = await this.getPasswordResetLink(user.user_id);
            this.logger.info({
                message: 'Generated the password reset link',
                user
            });
            await this.sendMail(user.email, passwordResetLink);
            this.logger.info({
                message: 'Sent an email',
                user
            });

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            };
        } catch (error) {
            const parsedError: Error = error instanceof Error
                ? error
                : new Error(
                    `Unexpected error object of type "${typeof error}"`,
                );
            console.log('error : ', parsedError);

            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async getUsers(event: APIGatewayProxyEventV2) {
        try {
            const { queryStringParameters } = event;
            const page = Number.parseInt((queryStringParameters as any)?.page ?? '0') ?? 1;
            const perPage = Number.parseInt(
                (queryStringParameters as any)?.per_page ?? this.USERS_PER_PAGE.toString()
            ) ?? this.USERS_PER_PAGE;
            const nameSearchPrefix = (queryStringParameters as any)?.name_prefix;
            const emailSearchPrefix = (queryStringParameters as any)?.email_prefix;
            const adminsOnly = (queryStringParameters as any)?.admins_only === 'true';
            const searchTerm = (queryStringParameters as any)?.search;
            let roles = undefined;
            if (adminsOnly) {
                roles = [this.USER_ADMIN];
            }
            const response = await this.getAuth0Users({
                page,
                nameSearchPrefix,
                emailSearchPrefix,
                searchTerm,
                perPage,
                roles
            });

            // const usersGroups = await this.groupUserCrud.getGroupsOfUsers(
            //     response.users.map(u => u.user_id),
            //     this.orgId
            // );
            // response.users.forEach(u => {
            //     const groups = usersGroups.filter(ug => ug.userId === u.user_id);
            //     (u as any).groups = groups;
            // });

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ ...response }),
            };
        } catch (error) {
            const parsedError: Error = error instanceof Error
                ? error
                : new Error(
                    `Unexpected error object of type "${typeof error}"`,
                );
            console.log('error : ', parsedError);

            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async getUser(event: APIGatewayProxyEventV2) {
        try {
            const { pathParameters } = event;
            const { userId } = pathParameters ?? {};
            if (!userId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'User ID is required' }),
                };
            }

            const [user, groups] = await Promise.all([
                this.getUserById(userId),
                this.groupUserCrud.getGroupsOfUsers([userId], this.orgId)
            ]);

            if (!user) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'Could not find user' }),
                };
            }
            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ ...user, groups }),
            };
        } catch (error) {
            const parsedError: Error = error instanceof Error
                ? error
                : new Error(
                    `Unexpected error object of type "${typeof error}"`,
                );
            console.log('error : ', parsedError);

            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async updateUser(event: APIGatewayProxyEventV2) {
        try {
            const { body, pathParameters } = event;
            const { userId } = pathParameters ?? {};
            if (!userId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'UserId is required' }),
                };
            }

            const user = await this.getUserById(userId);
            if (!user) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'Could not find user' }),
                };
            }
            const { name, isAdmin } = JSON.parse(body ?? '{}');
            let appMetadata = user.app_metadata;
            const isAlreadyAdmin = !!(user.app_metadata?.roles?.find((r: any) => r === this.USER_ADMIN));

            if (!isAdmin && isAlreadyAdmin) {
                const roles = await this.getUsersRoles(userId);
                const roleIdsToRemove = roles
                    .filter((r: any) => r.name === this.USER_ADMIN)
                    .map(r => r.id);
                await this.removeRoles(userId, roleIdsToRemove);

                appMetadata.roles = (appMetadata.roles ?? []).filter((r: any) => r !== this.USER_ADMIN);
                await this.updateAuth0User(user, name, appMetadata);
            }

            if (isAdmin && !isAlreadyAdmin) {
                await this.assignAdminRole(user);
            }

            await this.updateAuth0User(user, name);

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            };
        } catch (error) {
            const parsedError: Error = error instanceof Error
                ? error
                : new Error(
                    `Unexpected error object of type "${typeof error}"`,
                );
            console.log('error : ', parsedError);

            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async deleteUser(event: APIGatewayProxyEventV2) {
        try {
            const { pathParameters } = event;
            const { userId } = pathParameters ?? {};
            if (!userId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'UserId is required' }),
                };
            }

            await this.deleteAuth0User(userId);

            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            };
        } catch (error) {
            const parsedError: Error = error instanceof Error
                ? error
                : new Error(
                    `Unexpected error object of type "${typeof error}"`,
                );
            console.log('error : ', parsedError);

            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

}

export const createUser = async (
    event: APIGatewayProxyEventV2,
): Promise<any> => {
    return new UsersHandler(event).createUser(event);
};

export const deleteUser = async (
    event: APIGatewayProxyEventV2,
): Promise<any> => {
    return new UsersHandler(event).deleteUser(event);
};

export const updateUser = async (
    event: APIGatewayProxyEventV2,
): Promise<any> => {
    return new UsersHandler(event).updateUser(event);
};

export const getUsers = async (
    event: APIGatewayProxyEventV2,
): Promise<any> => {
    return new UsersHandler(event).getUsers(event);
};

export const getUser = async (
    event: APIGatewayProxyEventV2,
): Promise<any> => {
    return new UsersHandler(event).getUser(event);
};