import { Sequelize, Transaction, WhereOptions } from 'sequelize';

import { SecurityContext } from '../common/security';
import { Users } from '../models/UsersModel';
import { IDBOp } from './database_op';

export interface IUserDBOp extends IDBOp {
    updateHideProductTour(
        profile: any,
        orgId: string,
        hideProductTour: boolean,
    ): Promise<any>;

    switchDashboard(
        orgId: string,
        userId: string,
        newDashboardUrl: string,
    ): Promise<any>;

    get(identifier: string, orgIdFilter?: WhereOptions): Promise<any>;
}

type UserForm = {
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    hideProductTour: boolean;
    orgId: string;
    optInNewsletter: boolean;
};

export class UserDBOp implements IUserDBOp {
    private auroraWriter: any;

    constructor(opts: { auroraWriter: any; security: SecurityContext; }) {
        this.auroraWriter = opts.auroraWriter;
    }

    async get(identifier: string, orgIdFilter?: WhereOptions) {
        const aurora = await this.auroraWriter;
        const model = Users(aurora, Sequelize);

        const currentUser = await model.findOne({
            where: {
                userId: identifier,
                ...orgIdFilter,
            },
        });
        return currentUser;
    }

    async save(payload: any, identifier: string) {
        const aurora = await this.auroraWriter;
        const transaction = await aurora.transaction();
        try {
            const userDB = await this.createUser(payload, aurora, transaction);

            await this.updateUserInDifferentOrgIds(
                identifier,
                payload.termsAndCondSignedAt,
                aurora,
                transaction,
            );
            await transaction.commit();
            return userDB;
        } catch (error) {
            await transaction.rollback();
            console.debug('Error saving User: ', (error as any).message);
            throw error;
        }
    }

    private async createUser(data: any, sequelize: any, transaction: any) {
        const model = Users(sequelize, Sequelize);
        const newUser = await model.upsert(data, { transaction });
        return newUser;
    }

    private async updateUserInDifferentOrgIds(
        userId: string,
        date: any,
        sequelize: any,
        transaction?: Transaction,
    ) {
        const model = Users(sequelize, Sequelize);
        const termsAndCondSignedAt = { termsAndCondSignedAt: date };
        await model.update(termsAndCondSignedAt, {
            where: { userId } as any,
            transaction,
        } as any);
    }

    async switchDashboard(orgId: string, userId: string, newDashboardUrl: string) {
        const aurora = await this.auroraWriter;

        const model = Users(aurora, Sequelize);

        await model.update(
            {
                analyticsDashboardUrl: newDashboardUrl
            },
            {
                where: {
                    orgId,
                    userId,
                } as any
            } as any);
    }

    async updateHideProductTour(
        profile: any,
        orgId: string,
        hideProductTour: boolean,
    ) {
        const aurora = await this.auroraWriter;
        const transaction = await aurora.transaction();

        try {
            const user: UserForm = {
                userId: profile.user_id,
                firstName: profile.name,
                lastName: profile.nickname,
                email: profile.email,
                hideProductTour: hideProductTour,
                orgId: orgId,
                optInNewsletter: false,
            };
            const userDB = await this.createUser(user, aurora, transaction);
            await transaction.commit();
            return userDB;
        } catch (error) {
            await transaction.rollback();
            console.debug('Error saving User: ', (error as any).message);
            throw error;
        }
    }
}
