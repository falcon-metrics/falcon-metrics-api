import { Logger } from 'log4js';
import { DateTime } from 'luxon';
import { Sequelize, Transaction } from 'sequelize';
import { v4 as uuidV4 } from 'uuid';

import { SecurityContext } from '../../common/security';
import { ObeyaRisksModel } from '../../models/ObeyaRisksModel';
import { RiskItem } from './types';

export class Calculations {
    readonly orgId?: string;
    readonly logger: Logger;
    readonly auroraWriter: Promise<Sequelize>;

    constructor(opts: {
        security: SecurityContext;
        logger: Logger;
        auroraWriter: Promise<Sequelize>;
        calculations: any;
    }) {
        this.orgId = opts?.security?.organisation;
        this.logger = opts.logger;
        this.auroraWriter = opts.auroraWriter;
    }

    async createOrUpdate(risk: RiskItem): Promise<RiskItem | unknown> {
        const aurora: Sequelize = await this.auroraWriter;
        const transaction: Transaction = await aurora.transaction();

        const createOfUpdateFn = risk?.riskId ? this.updateRisk : this.saveRisk;

        try {
            const riskItem = await createOfUpdateFn(
                risk,
                aurora,
                transaction,
                this.orgId,
            );
            await transaction.commit();
            return riskItem;
        } catch (error) {
            await transaction.rollback();
            throw (error as any)?.message;
        }
    }

    async saveRisk(
        risk: RiskItem,
        aurora: Sequelize,
        transaction: Transaction,
        orgId?: string,
    ) {
        const receivedObject = {
            ...risk,
            riskId: risk?.riskId,
            name: risk.name,
            orgId: risk?.orgId || orgId,
            roomId: risk?.roomId,
            createdAt: DateTime.now().toISODate(),
            createdBy: risk?.createdBy,
        };

        if (
            risk.riskId === '' ||
            risk.riskId === null ||
            risk.riskId === undefined
        ) {
            const guid = uuidV4();
            receivedObject.riskId = guid;
            receivedObject.orgId = orgId;
        }

        const model = ObeyaRisksModel(aurora, Sequelize);

        return model.create(receivedObject, { transaction });
    }

    async updateRisk(
        risk: RiskItem,
        aurora: Sequelize,
        transaction: Transaction,
        orgId?: string,
    ) {
        const model = ObeyaRisksModel(aurora, Sequelize);

        const newRisk = {
            ...risk,
            riskId: risk?.riskId,
            name: risk.name,
            orgId: risk?.orgId || orgId,
            roomId: risk?.roomId,
            modifiedAt: DateTime.now().toISODate(),
        };

        return model.update(newRisk, {
            transaction,
            where: {
                orgId: newRisk.orgId,
                roomId: newRisk.roomId,
                riskId: newRisk?.riskId,
            } as any,
        } as any);
    }

    async getAllRisks(obeyaRoomId?: string): Promise<any> {
        const orgId = this.orgId;
        const aurora = await this.auroraWriter;
        const model = ObeyaRisksModel(aurora, Sequelize);
        const allRisks: any = await model.findAll({
            where: {
                orgId,
                roomId: obeyaRoomId,
            },
        });
        return allRisks;
    }

    async deleteRisk(riskId: string) {
        const aurora = await this.auroraWriter;
        const transaction = await aurora.transaction();

        try {
            const model = ObeyaRisksModel(aurora, Sequelize);
            await model.destroy({
                where: {
                    orgId: this.orgId,
                    riskId,
                },
            });
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw (error as any)?.message;
        }
    }
}
