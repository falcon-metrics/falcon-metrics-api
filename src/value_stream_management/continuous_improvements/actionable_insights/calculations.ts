import { Sequelize } from "sequelize";
import { IQueryFilters } from "../../../common/filters_v2";
import { SecurityContext } from "../../../common/security";
import { IInsightsPatterns, InsightsResults } from "./pattern_matcher";

export class Calculations {
    readonly orgId: string;
    readonly queryParameters: {
        [name: string]: string;
    };
    readonly aurora: Promise<Sequelize>;
    readonly filters: IQueryFilters;
    readonly insightsPatterns: IInsightsPatterns;

    constructor(opts: {
        security: SecurityContext;
        filters: IQueryFilters;
        aurora: Promise<Sequelize>;
        insightsPatterns: IInsightsPatterns;
    }) {
        this.orgId = opts.security.organisation!;
        this.queryParameters = opts.filters.queryParameters!;
        this.aurora = opts.aurora;
        this.filters = opts.filters;
        this.insightsPatterns = opts.insightsPatterns;
    }

    async getResponse(): Promise<InsightsResults> {

        const patterns = this.insightsPatterns.getTruePatterns(this.orgId, this.filters.getContextId() ?? '');

        return patterns;
    }
}
