import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import Profile, { ProfileType } from '../profile';
import { asClass, Lifetime } from 'awilix';
import Organisation from '../models/OrganisationModel';
import { DateTime } from 'luxon';
import Datasource from '../models/DatasourceModel';
import { SecurityContext } from '../common/security';
import { DemoOrgId, User } from '../user/handler';
import { Sequelize } from 'sequelize';

class TrialHandler extends BaseHandler {
    private trial: Trial;
    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            trial: asClass(Trial),
            user: asClass(User, { lifetime: Lifetime.SCOPED }),
        });

        this.trial = this.dependencyInjectionContainer.cradle.trial;
    }

    async getTrialInfo(event: APIGatewayProxyEventV2) {
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
            const trialInfo = await this.trial.getTrialInfo(
                await Profile(jwt.claims.sub as string),
            );
            return {
                statusCode: 201,
                body: JSON.stringify(trialInfo),
            };
        } catch (error) {
            console.error({
                message: 'Error in trial handler',
                errorMessage: (error as any).response.data
            });
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }
}

export const getTrialInfo = async (event: any) => {
    return await new TrialHandler(event).getTrialInfo(event);
};

export class Trial {
    private aurora: Promise<Sequelize>;
    private orgId: string;
    private user: User;
    constructor(opts: { aurora: Promise<Sequelize>; security: SecurityContext; user: User; }) {
        this.aurora = opts.aurora;
        this.orgId = opts.security.organisation!;
        this.user = opts.user!;
    }

    async getTrialInfo(profile: any) {
        type TrialInfo = {
            isTrial: boolean;
            endOfTrial?: string;
            daysRemaining?: number;
            blockAccess: boolean;
            sampleDataOptionIsVisible: boolean;
            hasDatasource: boolean;
        };

        const noTrial: TrialInfo = {
            isTrial: false,
            blockAccess: false,
            sampleDataOptionIsVisible: true,
            hasDatasource: false,
        };
        if (profile !== null) {
            const userId = (profile as ProfileType).getUser();
            const userOrg =
                this.orgId !== DemoOrgId
                    ? this.orgId
                    : await this.getNotDemoOrg(userId);
            const orgInfo: any = await this.getOrgItems(userOrg);

            if (orgInfo) {
                const sampleDataOptionIsVisible = orgInfo.seeSampleData ?? true;
                const hasDatasource = await this.datasourceExists();
                if (orgInfo.isOnTrial) {
                    const now = DateTime.now();
                    const endOfTrial = DateTime.fromJSDate(
                        orgInfo.trialEndDate ?? new Date(2100, 1, 1),
                    );

                    const diff = endOfTrial.diff(now);
                    const daysRemaining = Math.round(diff.as('days'));
                    const trialHasEnded = diff.as('minutes') <= 0;
                    const trialReturn: TrialInfo = {
                        isTrial: orgInfo.isOnTrial,
                        hasDatasource,
                        endOfTrial: endOfTrial.toUTC().toISO(),
                        daysRemaining,
                        blockAccess: orgInfo.isOnTrial && trialHasEnded,
                        sampleDataOptionIsVisible,
                    };

                    return trialReturn;
                } else {
                    const orgInfo: TrialInfo = {
                        ...noTrial,
                        sampleDataOptionIsVisible,
                        hasDatasource,
                    };
                    return orgInfo;
                }
            }
        }
        return noTrial;
    }
    async getNotDemoOrg(userId: string): Promise<string> {
        const aurora = await this.aurora;
        const notDemoUser = await this.user.getNotDemoInfo(userId);
        return notDemoUser.orgId || this.orgId;
    }
    private async getOrgItems(orgId: string) {
        const aurora = await this.aurora;
        const model = await Organisation();
        const orgInfo = await model.findOne({
            where: { id: orgId },
            /// when user sign up this will be the demo orgId
            // what we need is use userId to query user table, get the actual orgId of user
        });
        return orgInfo;
    }

    private async datasourceExists() {
        try {
            const model = await Datasource();

            const datasources = await model.findAll({
                where: { orgId: this.orgId } as any,
            });

            return !!datasources.length;
        } catch {
            return false;
        }
    }
}
