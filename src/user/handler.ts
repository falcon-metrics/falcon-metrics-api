import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { DateTime } from 'luxon';
import { BaseHandler } from '../common/base_handler';
import { asClass, Lifetime } from 'awilix';
import axios from 'axios';
import { SecurityContext } from '../common/security';
import { IUserDBOp } from '../database_operations/user_db_op';
import Profile from '../profile';
import { Op } from 'sequelize';
export const DemoOrgId = 'falcon-metrics-demo';
class UserHandler extends BaseHandler {
    private user: User;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            user: asClass(User, { lifetime: Lifetime.SCOPED }),
        });

        this.user = this.dependencyInjectionContainer.cradle.user;
    }

    async updateUserSettings(event: APIGatewayProxyEventV2) {
        if (!event.requestContext.authorizer?.jwt) {
            return {
                statusCode: 401,
                body: JSON.stringify('Not Authorized'),
            };
        }

        const {
            body,
            requestContext: {
                authorizer: { jwt },
            },
        } = event;

        try {
            const payload = body ? JSON.parse(body) : '';
            const profile = await Profile(jwt.claims.sub as string);
            const userProfile = await profile.getUserInfo();
            const hideProductTour = payload?.hideProductTour;
            const userId = payload?.userId;

            if (userId && hideProductTour !== undefined) {
                await this.user.updateHideProductTour(
                    userProfile.data,
                    Boolean(hideProductTour),
                );

                return {
                    statusCode: 201,
                    body: JSON.stringify(userId),
                };
            }
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(error.errors || error),
            };
        }
    }

    async getUserTermsInfo(event: any) {
        const {
            requestContext: {
                authorizer: { jwt },
            },
        } = event;
        try {
            const userId = jwt.claims.sub;
            const currentUser = await this.user.getInfo(userId);

            return {
                statusCode: 201,
                body: JSON.stringify(currentUser),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(error.errors || error),
            };
        }
    }

    async switchUserDashboard(event: any) {
        const {
            requestContext: {
                authorizer: { jwt },
            },
        } = event;

        try {
            const userId = jwt.claims.sub;
            const currentUser = await this.user.getInfo(userId);

            let newDashboardUrl;

            if (currentUser.analyticsDashboardUrl === '/analytics-dashboard') {
                newDashboardUrl = '/value-stream-management';
            } else {
                newDashboardUrl = '/analytics-dashboard';
            }

            await this.user.switchDashboard(userId, newDashboardUrl);

            return {
                statusCode: 200,
                body: JSON.stringify({
                    newDashboardUrl,
                }),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(error.errors || error),
            };
        }
    }

    async saveUser(event: any) {
        const {
            body,
            requestContext: {
                authorizer: { jwt },
            },
        } = event;

        try {
            const userId = jwt.claims.sub;
            const payload = body ? JSON.parse(body) : '';
            const currentUser = await this.user.saveInfo(payload, userId);

            return {
                statusCode: 201,
                body: JSON.stringify(currentUser),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(error.errors || error),
            };
        }
    }

    async sendPasswordReset(event: APIGatewayProxyEventV2) {
        const { body } = event;

        try {
            const payload = body ? JSON.parse(body) : '';
            const emails = payload.map((user: { email: string; }) => user.email);

            if (!emails || emails.length === 0) {
                return {
                    statusCode: 400,
                    body: 'No emails provided',
                };
            }

            const auth0ChangePasswordUrl =
                'https://example.auth0.com/dbconnections/change_password';

            const successResults = [];

            for (const email of emails) {
                const userPasswordReset = {
                    client_id: process.env.AUTH0_CLIENT_ID,
                    email,
                    connection: 'Username-Password-Authentication',
                };

                const auth0Response = await axios.post(
                    auth0ChangePasswordUrl,
                    JSON.stringify(userPasswordReset),
                    {
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    },
                );

                successResults.push({
                    email,
                    status: auth0Response.status === 200 ? 'ok' : 'failed',
                });
            }

            return {
                statusCode: 200,
                body: JSON.stringify(successResults),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(error.errors || error),
            };
        }
    }
}

export const switchUserDashboard = async (event: APIGatewayProxyEventV2) => {
    return await new UserHandler(event).switchUserDashboard(event);
};

export const updateUserSettings = async (event: APIGatewayProxyEventV2) => {
    return await new UserHandler(event).updateUserSettings(event);
};

export const getUserTermsInfo = async (event: APIGatewayProxyEventV2) => {
    return await new UserHandler(event).getUserTermsInfo(event);
};

export const saveUser = async (event: APIGatewayProxyEventV2) => {
    return await new UserHandler(event).saveUser(event);
};

export const sendPasswordReset = async (event: APIGatewayProxyEventV2) => {
    return await new UserHandler(event).sendPasswordReset(event);
};

export interface IInfo {
    getInfo(identifier: any): Promise<any>;
    saveInfo(payload: any, identifier: any): Promise<any>;
    switchDashboard(userId: string, newDashboardUrl: string): Promise<any>;
}

type UserInfo = {
    user: string;
    termsAndCondSignedAt?: Date;
    signed: boolean;
    showBanner: boolean;
    hideProductTour: boolean;
    analyticsDashboardUrl: string;
    enableDashboardBanner: boolean;
    orgId?: string;
};
export class User implements IInfo {
    private orgId: string;
    private userDBOp: IUserDBOp;

    constructor(opts: { security: SecurityContext; userDBOp: IUserDBOp; }) {
        this.orgId = opts.security.organisation!;
        this.userDBOp = opts.userDBOp;
    }

    async switchDashboard(
        userId: string,
        newDashboardUrl: string,
    ): Promise<any> {
        await this.userDBOp.switchDashboard(
            this.orgId,
            userId,
            newDashboardUrl,
        );
    }
    async getInfo(identifier: any) {
        return await this.getNotDemoInfo(identifier);
    }

    async getNotDemoInfo(identifier: any): Promise<UserInfo> {
        const userId = identifier;
        /// get the user org, if the org in auth0 is not demo
        const auth0OrgIdFilter =
            this.orgId === DemoOrgId
                ? {}
                : {
                    [Op.and]: {
                        [Op.eq]: this.orgId,
                    },
                };
        const currentUser: any = await this.userDBOp.get(userId, {
            orgId: {
                [Op.ne]: 'falcon-metrics-demo', //make sure we get the user info in their actual org but not the demo org
                ...auth0OrgIdFilter,
            },
        });
        //need to get user row in not demo org


        if (currentUser) {
            const today = DateTime.now();
            const acceptedDate = DateTime.fromJSDate(
                currentUser.termsAndCondSignedAt,
            );
            const diff = today.diff(acceptedDate).as('years');

            const signedUser: UserInfo = {
                signed: currentUser.termsAndCondSignedAt ? true : false,
                showBanner: !(currentUser.termsAndCondSignedAt && diff < 1),
                ...currentUser.dataValues,
            };

            if (!signedUser.analyticsDashboardUrl) {
                signedUser.analyticsDashboardUrl = '/value-stream-management';
            }

            return signedUser;
        } else {
            const noTermsAndCond: UserInfo = {
                user: userId,
                signed: false,
                showBanner: true,
                hideProductTour: false,
                analyticsDashboardUrl: '/value-stream-management',
                enableDashboardBanner: false,
            };
            return noTermsAndCond;
        }
    }

    async saveInfo(payload: any, identifier: any): Promise<any> {
        const userId = identifier;
        const userData = this.extractUserDetails(payload, this.orgId, userId);
        try {
            const userDB: any = await this.userDBOp.save(userData, userId);
            return userDB;
        } catch (error) {
            console.debug('Error saving User: ', error.message);
            throw error;
        }
    }

    extractUserDetails(payload: any, orgId: string, userId: string) {
        const {
            userFirstName,
            userLastName,
            userEmail,
            userRole,
            userAcceptTermsAndConditions,
            userOptInNewsletter,
            contactForDemo,
            analyticsDashboardUrl,
            enableDashboardBanner,
        } = payload;
        const data = {
            orgId,
            userId: userId,
            firstName: userFirstName,
            lastName: userLastName,
            email: userEmail,
            role: userRole,
            optInNewsletter: userOptInNewsletter ? userOptInNewsletter : false,
            contactForDemo: contactForDemo ? contactForDemo : false,
            termsAndCondSignedAt: userAcceptTermsAndConditions
                ? DateTime.utc()
                : null,
            analyticsDashboardUrl,
            enableDashboardBanner,
        };
        return data;
    }

    async updateHideProductTour(profile: any, hideProductTour: boolean) {
        await this.userDBOp.updateHideProductTour(
            profile,
            this.orgId,
            hideProductTour,
        );
    }
}
