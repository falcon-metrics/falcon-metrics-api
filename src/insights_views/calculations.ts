import { Logger } from 'log4js';
import { Sequelize } from 'sequelize';

import { IQueryFilters } from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import { InsightsDbAurora } from './insights_db_aurora';
import { InsightItem } from './interfaces';

export class Calculations {
    readonly orgId?: string;
    readonly logger: Logger;
    readonly filters?: IQueryFilters;
    readonly insightsDbAurora: InsightsDbAurora;
    readonly auroraWriter: Promise<Sequelize>;

    constructor(opts: {
        auroraWriter: Promise<Sequelize>;
        security: SecurityContext;
        logger: Logger;
        filters?: IQueryFilters;
        insightsDbAurora: InsightsDbAurora;
    }) {
        this.auroraWriter = opts.auroraWriter;
        this.orgId = opts.security.organisation!;
        this.logger = opts.logger;
        this.filters = opts.filters;
        this.insightsDbAurora = opts.insightsDbAurora;
    }

    async getInsights(): Promise<InsightItem[]> {
        const insightItems: any[] = await this.insightsDbAurora.getAllInsightsViews(
            this.orgId!,
        );
        return insightItems;
    }

    async createOrUpdateInsightsView(
        insightObject: InsightItem,
    ): Promise<InsightItem> {
        const aurora: Sequelize = await this.auroraWriter;
        const transaction = await aurora.transaction();
        try {
            const [result]: any[] = await this.insightsDbAurora.saveInsightView(
                this.orgId!,
                insightObject,
                aurora,
                transaction,
            );
            await transaction.commit();
            return result.dataValues as InsightItem;
        } catch (error) {
            await transaction.rollback();
            const message =
                error instanceof Error && error.message
                    ? error.message
                    : 'An error occured on createOrUpdateInsightsViews';
            console.debug('Error create Or Update InsightsView: ', message);
        }
        return insightObject;
    }
}
