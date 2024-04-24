import { Logger } from 'log4js';
import {
    Sequelize,
    Transaction,
} from 'sequelize';

import { InsightsViews } from '../models/InsightsViews';
import { InsightItem } from './interfaces';

export class InsightsDbAurora {
    private logger: Logger;
    private aurora: Promise<Sequelize>;

    constructor(opt: { logger: Logger; aurora: Promise<Sequelize>; }) {
        this.logger = opt.logger;
        this.aurora = opt.aurora;
    }

    async getAllInsightsViews(orgId: string): Promise<any[]> {
        const aurora = await this.aurora;
        const model = InsightsViews(aurora);

        const insightItems = await model.findAll({
            where: {
                orgId,
            },
        });

        return insightItems;
    }

    async saveInsightView(
        orgId: string,
        insight: InsightItem,
        sequelize: Sequelize,
        transaction: Transaction,
    ) {
        const insightData = {
            orgId,
            ...insight,
        };
        const model = InsightsViews(sequelize);
        return await model.upsert(insightData, {
            transaction,
        });
    }
}
