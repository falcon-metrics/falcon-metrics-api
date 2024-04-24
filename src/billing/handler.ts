import { asClass } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { DateTime } from 'luxon';
import { Sequelize } from 'sequelize';
import slugify from 'slugify';

import { BaseHandler } from '../common/base_handler';
import Organisation from '../models/OrganisationModel';
import { Users } from '../models/UsersModel';
import Profile from '../profile';

class BillingHandler extends BaseHandler {
    private billing: Billing;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            billing: asClass(Billing),
        });

        this.billing = this.dependencyInjectionContainer.cradle.billing;
    }

    async billingCheckout(event: APIGatewayProxyEventV2) {
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
            const organisation = await this.billing.performSignUpBilling(
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
}

export const billingCheckout = async (event: APIGatewayProxyEventV2) => {
    return await new BillingHandler(event).billingCheckout(event);
};

export class Billing {
    private auroraWriter: Promise<Sequelize>;

    constructor(opts: { auroraWriter: Promise<Sequelize>; }) {
        this.auroraWriter = opts.auroraWriter;
    }

    async performSignUpBilling(payload: any, profile: any) {
        const user = profile.getUser();
        const orgData = this.extractOrganisationDetails(payload, user);
        const userData = this.extractUserDetails(payload, orgData.id, user);
        await this.createUser(userData);
        const organisation: any = await this.createOrganisation(orgData);
        await profile.updateEmailVerified(false);
        await profile.updateAppMetadata({ user_organisation: organisation.id });
        await profile.sendEmailVerification();
        return organisation;
    }

    async resendVerificationEmail(profile: any) {
        await profile.sendEmailVerification();
    }

    private async createUser(data: any) {
        const aurora = await this.auroraWriter;
        const model = Users(aurora, Sequelize);
        const newUser = await model.create(data);
        return newUser;
    }

    private async createOrganisation(data: any) {
        const model = await Organisation();
        return await model.create(data);
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
        } = payload;
        const data = {
            orgId,
            userId: user,
            firstName: userFirstName,
            lastName: userLastName,
            email: userEmail,
            role: userRole,
            optInNewsletter: userOptInNewsletter,
        };
        return data;
    }

    extractOrganisationDetails(payload: any, user: string) {
        const {
            orgName,
            orgCountry,
            orgState,
            orgEnterprise,
            referenceCode,
            orgCompanySize,
            needHelp,
            customerReference,
            businessRegNumber,
            technicalContact,
            billingContact,
            companyDomain,
            addressLine1,
            addressLine2,
            city,
            zipcode,
        } = payload;
        const data = {
            name: orgName,
            id: slugify(orgName).toLowerCase(),
            country: orgCountry,
            state: orgState,
            enterprise: orgEnterprise,
            companySize: orgCompanySize,
            referenceCode: referenceCode,
            needHelp: needHelp,
            trialStartDate: DateTime.utc(),
            trialEndDate: DateTime.utc().plus({ days: 14 }).toUTC(),
            isOnTrial: true,
            isOnFreemium: false,
            createdByUser: user,
            createdDate: DateTime.utc(),
            isPayingAccount: false,
            customerReference: customerReference,
            businessRegNumber: businessRegNumber,
            technicalContact: technicalContact,
            billingContact: billingContact,
            companyDomain: companyDomain,
            addressLine1: addressLine1,
            addressLine2: addressLine2,
            city: city,
            zipcode: zipcode,
        };
        return data;
    }
}
