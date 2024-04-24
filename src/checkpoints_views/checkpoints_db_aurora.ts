import { Logger } from 'log4js';
import {
    Op,
    Sequelize,
    Transaction,
} from 'sequelize';

import { CheckpointsSnapshot } from '../models/CheckpointsSnapshot';
import { CheckpointsViews } from '../models/CheckpointsViews';
import { CheckpointItem, CheckpointSnapshotItem } from './interfaces';

export default class CheckpointsDbAurora {
    private logger: Logger;
    private aurora: any;

    constructor(opt: { logger: Logger; aurora: any; }) {
        this.logger = opt.logger;
        this.aurora = opt.aurora;
    }

    async getAllCheckpoints(orgId: string): Promise<any[]> {
        const aurora = await this.aurora;
        const model = CheckpointsViews(aurora);

        const checkpointItems = await model.findAll({
            where: {
                orgId,
            },
            order: [['start_date', 'ASC']],
        });

        return checkpointItems;
    }

    private isNumber(s: string) {
        return isNaN(Number(s)) === false;
    }

    /**
     * Workaround for this issue 
     * https://github.com/sequelize/sequelize/issues/4523
     * 
     * Sequelize returns strings instead of numbers
     */
    private stringsToNumbers(obj: Record<any, any>) {
        Object.keys(obj).forEach(k => {
            // Check if number
            if (this.isNumber(obj[k])) {
                // Parse string to nubmer
                obj[k] = Number(obj[k]);
            }
        });
        return obj;
    }

    // get last one checkpoint snapshot
    async getOneCheckpointSnapshot(
        orgId: string,
        checkpointId: string,
        contextId: string,
    ): Promise<CheckpointSnapshotItem> {
        const aurora = await this.aurora;
        const model = CheckpointsSnapshot(aurora);

        const checkpointSnapshotItem = await model.findOne({
            where: {
                [Op.and]: {
                    orgId,
                    checkpoints_view_id: Number(checkpointId),
                    context_id: contextId,
                },
            },
            order: [['snapshot_date', 'DESC']],
        });

        return this.stringsToNumbers((checkpointSnapshotItem as any)?.toJSON() ?? {}) as CheckpointSnapshotItem;
    }

    async getCheckpointsByIds(orgId: string, checkpointIds: string[]) {
        const aurora = await this.aurora;
        const model = CheckpointsViews(aurora);

        const checkpointViews = await model.findAll({
            where: {
                orgId,
                id: { [Op.in]: checkpointIds },
            },
            order: [['start_date', 'ASC']],
            raw: true,
        });
        return checkpointViews;
    }

    async saveCheckpointView(
        orgId: string,
        checkpointItem: CheckpointItem,
        sequelize: Sequelize,
        transaction: Transaction,
    ) {
        const checkpointView = {
            ...checkpointItem,
            orgId,
        };
        const model = CheckpointsViews(sequelize);
        return await model.upsert(checkpointView, { transaction });
    }

    async delete(
        id: string,
        orgId: string,
        sequelize: Sequelize,
        transaction: Transaction,
    ) {
        const model = CheckpointsViews(sequelize);
        return model.destroy({
            where: {
                orgId,
                id,
            },
            transaction,
        });
    }
    async deleteCheckpointsSnapshots(
        checkpointsViewId: string,
        orgId: string,
        sequelize: Sequelize,
        transaction: Transaction,
    ) {
        const model = CheckpointsSnapshot(sequelize);
        return model.destroy({
            where: {
                orgId,
                checkpoints_view_id: parseInt(checkpointsViewId),
            },
            transaction,
        });
    }
}
