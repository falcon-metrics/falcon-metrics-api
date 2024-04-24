import { Logger } from 'log4js';
import { Sequelize } from 'sequelize';
import { IQueryFilters } from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import { MetricsDbAurora } from './metrics_db_aurora';
import {
    RawMetric,
    FilterWithId,
} from './interfaces';
import _ from 'lodash';

type GroupedFilter = {
    displayName: string;
    key: string;
    fields: FilterWithId[];
};

export class Calculations {
    readonly orgId?: string;
    readonly logger: Logger;
    readonly filters?: IQueryFilters;
    readonly metricsDbAurora: MetricsDbAurora;
    readonly auroraWriter: Promise<Sequelize>;

    constructor(opts: {
        auroraWriter: Promise<Sequelize>;
        security: SecurityContext;
        logger: Logger;
        filters?: IQueryFilters;
        metricsDbAurora: MetricsDbAurora;
    }) {
        this.auroraWriter = opts.auroraWriter;
        this.orgId = opts.security.organisation!;
        this.logger = opts.logger;
        this.filters = opts.filters;
        this.metricsDbAurora = opts.metricsDbAurora;
    }

    async getFiltersWithIds(): Promise<GroupedFilter[]> {
        const filters: Partial<FilterWithId>[] = await this.metricsDbAurora.getFilters(
            ['id', 'tags', 'displayName'],
            this.orgId!,
        );
        const res: GroupedFilter[] = [];
        filters.map(filter => {
            const formattedFilter = {
                ...filter,
                display_on_benchmarking: false,
                display_on_checkpoints: false,
            };
            if (filter.tag) {
                const idx = res.findIndex(x => x.key === filter.tag);
                if (idx >= 0) {
                    res[idx].fields.push(formattedFilter);
                } else {
                    res.push({
                        displayName: filter.tag.split('-').join(' '),
                        key: filter.tag,
                        fields: [formattedFilter]
                    });
                }
            }
        });
        console.log(JSON.stringify(res));
        return res;
    }

    async getMetrics() {
        const rawMetric = await this.metricsDbAurora.getAllMetrics(
            this.orgId!,
        );
        return rawMetric;
    }

    async createOrUpdateMetric(metricObject: RawMetric): Promise<RawMetric> {
        // console.log("🚀 ~ Calculations ~ createOrUpdateMetric ~ metricObject:", metricObject);

        const aurora: Sequelize = await this.auroraWriter;
        const transaction = await aurora.transaction();
        try {
            const [result] = await this.metricsDbAurora.saveMetric(
                this.orgId!,
                metricObject,
                aurora,
                transaction,
            ) as any;
            await transaction.commit();
            return result.dataValues as RawMetric;
        } catch (error) {
            await transaction.rollback();
            const message =
                error instanceof Error && error.message
                    ? error.message
                    : 'An error occured on createOrUpdateMetric';
            console.debug('Error create Or Update Metric: ', message);
        }
        // console.log("🚀 ~ Calculations ~ createOrUpdateMetric ~ metricObject:", metricObject);
        return metricObject;
    }

    async deleteMetric(metricId: string): Promise<void> {
        const aurora = await this.auroraWriter;
        const transaction = await aurora.transaction();
        try {
            // Delete the checkpoint metric
            await this.metricsDbAurora.delete(
                metricId,
                this.orgId!,
                aurora,
                transaction,
            );

            await transaction.commit();
        } catch (error) {
            console.log('error calculations deleteMetric ==>', error);
            await transaction.rollback();
            throw error;
        }
    }
}
