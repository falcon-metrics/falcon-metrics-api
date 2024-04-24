import { Logger } from 'log4js';
import { MetricModel } from '../models/BusinessScorecard/Metrics';


export default class MetricsDbAurora {
    private logger: Logger;
    private auroraWriter: any;

    constructor(opt: { logger: Logger; auroraWriter: any; }) {
        this.logger = opt.logger;
        this.auroraWriter = opt.auroraWriter;
    }

    async getAllMetrics(orgId: string): Promise<any[]> {
        const aurora = await this.auroraWriter;
        const model = MetricModel(aurora);
        const metrics = await model.findAll({
            where: {
                org_id: orgId
            }
        });
        return metrics;
    }

    async getMetric(metricId: string, orgId: string): Promise<any | null> {
        const aurora = await this.auroraWriter;
        const model = MetricModel(aurora);
        const metric = await model.findOne({
            where: {
                org_id: orgId,
                metric_id: metricId
            }
        });
        return metric;
    }

    async updateMetrics(metrics: any): Promise<any[]> {
        const aurora = await this.auroraWriter;
        const model = MetricModel(aurora);
        const results = await model.bulkCreate(metrics, {
            fields: ["metric_id", "metric_name", "metric_type",
                "target", "lower_limit", "upper_limit",
                "context_id", "perspective_id", "org_id", "metric_values",
                "metric_unit", "metric_trend_direction",
                "createdAt"],
            updateOnDuplicate: ["metric_name", "metric_type",
                "target", "lower_limit", "upper_limit",
                "context_id", "perspective_id", "org_id", "metric_values",
                "metric_unit", "metric_trend_direction"],
            logging: console.log
        });
        return results;
    }

    async removeMetrics(metrics: any): Promise<number> {
        const aurora = await this.auroraWriter;
        const model = MetricModel(aurora);
        const results = await model.destroy({ where: { metric_id: metrics.map((i: any) => i.id.toString()) } });
        return results;
    }
}
