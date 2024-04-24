import { APIGatewayProxyEventV2 } from 'aws-lambda';
import slugify from 'slugify';
import { BaseHandler } from '../common/base_handler';
import Organisation from '../models/OrganisationModel';
import { Sequelize } from 'sequelize';
import Profile, { ProfileType } from '../profile';
import { asClass } from 'awilix';
import { Users } from '../models/UsersModel';
import { DateTime } from 'luxon';
import { IHubspot } from '../hubspot/Hubspot';
import { Logger } from 'log4js';
import SettingsModel from '../models/SettingsModel';

import { getLogger } from 'log4js';
import MailChimpSecret from '../contact_us/MailChimpSecret';

const mailChimpSecret = new MailChimpSecret({ logger: getLogger() });
const mailchimpGetter = require('@mailchimp/mailchimp_transactional');

class SignUpHandler extends BaseHandler {
    private signUp: SignUp;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            signUp: asClass(SignUp),
        });

        this.signUp = this.dependencyInjectionContainer.cradle.signUp;
    }

    async signup(event: APIGatewayProxyEventV2) {
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
            const organisation = await this.signUp.performSignUp(
                payload,
                profile,
            );

            return {
                statusCode: 201,
                body: JSON.stringify(organisation),
            };
        } catch (error) {
            console.error(error);
            const errors = JSON.stringify(error.errors);
            return {
                statusCode: 500,
                body: JSON.stringify(errors),
            };
        }
    }

    async resendemail(event: APIGatewayProxyEventV2) {
        if (!event.requestContext.authorizer?.jwt) {
            return {
                statusCode: 401,
                body: JSON.stringify('Not Authorized'),
            };
        }

        const {
            requestContext: {
                authorizer: { jwt },
            },
        } = event;
        try {
            const profile = await Profile(jwt.claims.sub as string);
            await this.signUp.resendVerificationEmail(profile);
            return {
                statusCode: 201,
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

export const signup = async (event: APIGatewayProxyEventV2) => {
    return await new SignUpHandler(event).signup(event);
};

export const resendemail = async (event: APIGatewayProxyEventV2) => {
    return await new SignUpHandler(event).resendemail(event);
};
const FLOMATIKA_DEFAULT_ROLE_ID = '#########';
export class SignUp {
    private logger: Logger;
    private auroraWriter: any;
    private hubspot: IHubspot;
    readonly DEMO_ORG_ID = 'falcon-metrics-demo';

    constructor(opts: {
        logger: Logger;
        auroraWriter: any;
        hubspot: IHubspot;
    }) {
        this.logger = opts.logger;
        this.auroraWriter = opts.auroraWriter;
        this.hubspot = opts.hubspot;
    }

    async performSignUp(payload: any, profile: ProfileType) {
        const user = profile.getUser();
        const orgData = this.extractOrganisationDetails(payload, user);
        const userData = this.extractUserDetails(payload, orgData.id, user);
        const aurora = await this.auroraWriter;
        const transaction = await aurora.transaction();

        try {
            await this.createUser(userData, aurora, transaction);
            const organisation: any = await this.createOrganisation(
                orgData,
                aurora,
                transaction,
            );
            await this.createSetting(orgData.id, aurora, transaction);
            await profile.updateEmailVerified(false);
            await profile.updateAppMetadata({
                //users default to the demo data org id
                user_organisation: this.DEMO_ORG_ID,
            });
            // await profile.sendEmailVerification(); //Auth0 will send one automatically
            await profile.assignUserRole(FLOMATIKA_DEFAULT_ROLE_ID);
            await transaction.commit();

            if (process.env.NODE_ENV === 'production') {
                try {
                    await this.hubspot.createInHubspot(orgData, userData);

                    /*
                     * if hubspot creation is successful, notify product owner for any new sign ups
                     */

                    if (orgData && userData) {
                        await this.sendEmail(orgData, userData);
                    }
                } catch (hubspotError) {
                    this.logger.error(
                        'error creating organisation in Hubspot.',
                        hubspotError,
                    );
                }
            } else {
                console.log('skipping Hubspot integration locally');
            }

            return organisation;
        } catch (error) {
            await transaction.rollback();
            console.debug(
                'Error saving User and Organisation: ',
                error.message,
            );
            throw error;
        }
    }

    async resendVerificationEmail(profile: any) {
        await profile.sendEmailVerification();
    }

    private async createUser(data: any, sequelize: any, transaction: any) {
        const model = Users(sequelize, Sequelize);
        const newUser = await model.create(data, { transaction });
        return newUser;
    }

    private async createOrganisation(
        data: any,
        sequelize: any,
        transaction: any,
    ) {
        const model = await Organisation();
        return await model.create(data, { transaction });
    }
    private async createSetting(
        orgId: string,
        sequelize: any,
        transaction: any,
    ) {
        const model = await SettingsModel();
        const defaultSetting = {
            orgId,
            rollingWindowPeriodInDays: 30,
            staledItemNumberOfDays: 30,
            portfolioDisplayName: 'Portfolio',
            initiativeDisplayName: 'Initiative',
            teamDisplayName: 'Team',
        };
        return await model.create(defaultSetting, { transaction });
    }

    extractUserDetails(payload: any, orgId: string, user: string) {
        const {
            userFirstName,
            userLastName,
            userEmail,
            userRole,
            userAcceptTermsAndConditions,
            userOptInNewsletter,
            contactForDemo,
            orgName,
        } = payload;
        return {
            orgId,
            userId: user,
            firstName: userFirstName,
            lastName: userLastName,
            email: userEmail,
            role: userRole,
            optInNewsletter: userOptInNewsletter,
            contactForDemo: contactForDemo,
            termsAndCondSignedAt: userAcceptTermsAndConditions
                ? DateTime.utc()
                : null,
            companyName: orgName,
            analyticsDashboardUrl: '/value-stream-management',
            hideProductTour: true,
        };
    }

    extractOrganisationDetails(payload: any, user: string) {
        const {
            userEmail,
            orgName,
            orgEnterprise,
            referenceCode,
            orgCompanySize,
            needHelp,
        } = payload;
        const domain = userEmail.slice(
            userEmail.lastIndexOf('@') === -1
                ? userEmail.length
                : userEmail.lastIndexOf('@') + 1,
            userEmail.length,
        );

        const prefix = domain.slice(
            domain.indexOf('.') === -1 ? domain.length : 0,
            domain.indexOf('.'),
        );
        const orgId = slugify(
            prefix.toLowerCase() + '-' + orgName.toLowerCase(),
        );

        const data = {
            name: orgName,
            id: orgId,
            enterprise: orgEnterprise,
            companySize: orgCompanySize,
            referenceCode: referenceCode,
            needHelp: needHelp,
            trialStartDate: DateTime.utc(),
            trialEndDate: DateTime.utc().plus({ days: 7 }).toUTC(),
            isOnTrial: true,
            isOnFreemium: false,
            createdByUser: user,
            createdDate: DateTime.utc(),
            isPayingAccount: false,
            companyDomain: domain,
            seeSampleData: true,
        };

        return data;
    }

    async sendEmail(orgData: any, userData: any) {
        const secret = await mailChimpSecret.getApiKey();
        const mailchimp = mailchimpGetter(secret);

        try {
            const result = await mailchimp.messages.send({
                message: {
                    from_email: 'support@falcon-metrics.com',
                    subject: 'New Falcon Metrics Sign Up',
                    html: `
                        <p><b>New Falcon Metrics Sign Up</b></p>
                        <pre>${JSON.stringify(
                        { Organisation: orgData, User: userData },
                        null,
                        4,
                    )}</pre>`,
                    to: [
                        {
                            email: 'owner@falcon-metrics.com',
                            type: 'to',
                        },
                    ],
                },
            });

            if (result?.response?.data?.status === 'error') {
                return {
                    statusCode: 500,
                    body: result?.response?.data?.message,
                };
            }

            return {
                statusCode: 200,
                body: JSON.stringify(result),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(error),
            };
        }
    }
}
