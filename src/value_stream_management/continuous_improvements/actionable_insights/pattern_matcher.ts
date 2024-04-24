
import { Logger } from 'log4js';
import { QueryTypes, Sequelize } from 'sequelize';
import { InsightsPatternsModel } from '../../../models/insights/InsightsPatternsModel';
import { WidgetInformation, WidgetInformationUtils } from '../../../utils/getWidgetInformation';

export type InsightsSnapshot = {
    insights_view_id: number;
    orgId: string;
    snapshot_date: Date;
    lead_time_85: number;
    wip_count: number;
    wip_age_85: number;
    fitness_level: number;
    lead_time_predictability: string;
    flow_efficiency: number;
    value_demand: number;
    demand: number;
    capacity: number;
    inflow: number;
    outflow: number;
    current_productivity: number;
    stale_work: number;
    blockers: number;
    discarded_after_start: number;
    average_throughput: number;
    delayed_items_count: number;
    expedite_pcnt: number;
    quantile_first: number;
    quantile_second: number;
    quantile_third: number;
    quantile_fourth: number;
};

export type InsightsPattern = {
    id: number;
    title: string;
    iql: string;
    sql: string;

    descriptives?: Array<InsightsDescriptive>;
    diagnostics?: Array<InsightsDiagnostic>;
    prescriptions?: Array<InsightsPrescription>;
    widgetInfo?: WidgetInformation[];
};

export type InsightsEvidence = {
    id: number;
    description: string;
};

export type InsightsDescriptive = {
    id: number;
    title: string;

    evidence?: Array<InsightsEvidence>;
};

export type InsightsDiagnostic = {
    id: number;
    title: string;

    evidence?: Array<InsightsEvidence>;
};

export type InsightsPrescription = {
    id: number;
    title: string;
};

export type InsightsResults = {
    patterns: Array<InsightsPattern>;
};

export interface IInsightsPatterns {
    getTruePatterns(orgId: string, contextId: string | undefined): Promise<InsightsResults>;

    getDescriptivesForPattern(patternId: number, snapshot: InsightsSnapshot): Promise<Array<InsightsDescriptive>>;

    getDiagnoticsForPattern(patternId: number, snapshot: InsightsSnapshot): Promise<Array<InsightsDiagnostic>>;

    getPrescriptionsForPattern(patternId: number, snapshot: InsightsSnapshot): Promise<Array<InsightsPrescription>>;
}

export class InsightsPatternMatcher implements IInsightsPatterns {

    private aurora: Promise<Sequelize>;
    private logger: Logger;
    private readonly REGEX_FIELDS = /\[(.*?)\]/g;
    private REGEX_EXPRESSION = /\((.*)\)/g;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(opts: {
        aurora: Promise<Sequelize>;
        logger: Logger;
        widgetInformationUtils: WidgetInformationUtils;
    }) {
        this.aurora = opts.aurora;
        this.logger = opts.logger;
        this.widgetInformationUtils = opts.widgetInformationUtils;
    }

    async getTruePatterns(orgId: string, contextId: string | undefined): Promise<InsightsResults> {
        const aurora = await this.aurora;

        const patternModel = InsightsPatternsModel(aurora);

        const allPatterns = await patternModel.findAll();

        const insightsResults: InsightsResults = {
            patterns: []
        };

        for (const pattern of allPatterns) {
            const insightsPattern = (pattern as any).toJSON() as InsightsPattern;

            let select = `
            select	*
            from	insights_snapshots
            where   ${insightsPattern.sql}
            and     "orgId" = :orgId
            `;

            let contextCondition = contextId ?
                `
            and     context_id = :contextId
            ` :
                `
            and     context_id is null
            `;

            let orderBy = `
            order by snapshot_date desc
            limit 1
            `;

            const replacements: any = {
                orgId,
            };

            if (contextId) {
                replacements.contextId = contextId;
            }

            const patternSnapshotQuery = `${select}${contextCondition}${orderBy}`;

            const insightsSnapshots = await aurora.query(
                patternSnapshotQuery,
                {
                    replacements,
                    type: QueryTypes.SELECT,
                },
            );

            const latestMatchingSnapshotsDb = insightsSnapshots as Array<InsightsSnapshot>;

            if (latestMatchingSnapshotsDb.length) {
                const currentSnapshot = latestMatchingSnapshotsDb[0];
                //this pattern is matched
                // console.log('***matched snapshot for pattern: ', insightsPattern.sql);

                //get the descriptive analysis / and evidence

                // Transform pattern title to predefined widget type keys
                const patternTitle = insightsPattern.title.replace(/ /g, '-').replace('\'', '');

                const results = await Promise.all([
                    this.getDescriptivesForPattern(insightsPattern.id, currentSnapshot),
                    this.getDiagnoticsForPattern(insightsPattern.id, currentSnapshot),
                    this.getPrescriptionsForPattern(insightsPattern.id, currentSnapshot),
                    this.getWidgetInformation(patternTitle.toLowerCase())
                ]);

                insightsPattern.descriptives = results[0];
                insightsPattern.diagnostics = results[1];
                insightsPattern.prescriptions = results[2];
                insightsPattern.widgetInfo = results[3];

                insightsResults.patterns.push(insightsPattern);
            }
        }

        // console.log('--matched patterns--');
        // console.log(JSON.stringify(insightsResults, null, 6));

        return insightsResults;
    }

    async getPrescriptionsForPattern(patternId: number, snapshot: InsightsSnapshot): Promise<InsightsPrescription[]> {

        const aurora = await this.aurora;

        const diagnosticQuery = `
        select	ip.id		as	pattern_id,
                ip.title	as	pattern_title,
                ipa.id		as	prescriptive_id,
                ipa.title	as	prescriptive_title

        from	insights_patterns					ip

        join	insights_pattern_prescriptive_maps	ippm
        on	(	ip.id	=	ippm.pattern_id)

        join	insights_prescriptive_analysis		ipa
        on	(	ipa.id	=	ippm.prescriptive_id)

        where	ip.id = :patternId
        `;

        const prescriptionsForPatternDb: Array<Record<any, any>> = await aurora.query(
            diagnosticQuery,
            {
                replacements: {
                    patternId,
                },
                type: QueryTypes.SELECT,
            },
        );

        const precsriptions: Array<InsightsPrescription> = [];
        for (const prescriptionDb of prescriptionsForPatternDb) {
            let prescriptiveDynamic = prescriptionDb.prescriptive_title;

            const fields = prescriptiveDynamic.match(this.REGEX_FIELDS);

            if (fields && fields.length) {
                for (const field of fields) {
                    const prop = field.replace('[', '').replace(']', '');
                    const value = snapshot[prop as keyof InsightsSnapshot];

                    prescriptiveDynamic = prescriptiveDynamic.replace(field, value);
                }
            }

            precsriptions.push({
                id: prescriptionDb.prescriptive_id,
                title: prescriptiveDynamic,
            });
        }

        return precsriptions;
    }

    async getDiagnoticsForPattern(patternId: number, snapshot: InsightsSnapshot): Promise<InsightsDiagnostic[]> {
        const aurora = await this.aurora;

        const diagnosticQuery = `
        select	ip.id		as	pattern_id,
                ip.title	as	pattern_title,
                ida.id		as	diagnostic_id,
                ida.title	as	diagnostic_title,
                idae.id		as	diagnostic_evidence_id,
                idae.description as	diagnostic_evidence
        from	insights_patterns					ip

        join	insights_pattern_diagnostic_maps	ipdm
        on	(	ip.id	=	ipdm.pattern_id)

        join	insights_diagnostic_analysis		ida
        on	(	ida.id	=	ipdm.diagnostic_id)

        join	insights_diagnostic_analysis_evidence	idae
        on	(	idae.diagnostic_id	=	ida.id)

        where	ip.id = :patternId
        `;

        const diagnosticsForPatternDb: Array<Record<any, any>> = await aurora.query(
            diagnosticQuery,
            {
                replacements: {
                    patternId,
                },
                type: QueryTypes.SELECT,
            },
        );

        const maps: Map<string, InsightsDiagnostic> = new Map();
        for (const diagnosticDb of diagnosticsForPatternDb) {

            const evidenceTemplate = diagnosticDb.diagnostic_evidence;

            let evidenceDynamic = evidenceTemplate;

            const fields = evidenceTemplate.match(this.REGEX_FIELDS);

            if (fields && fields.length) {
                for (const field of fields) {
                    const prop = field.replace('[', '').replace(']', '');
                    const value = snapshot[prop as keyof InsightsSnapshot];

                    evidenceDynamic = evidenceDynamic.replace(field, value);
                }
            }

            if (maps.has(diagnosticDb.diagnostic_id)) {
                const existingDiagnostic = maps.get(diagnosticDb.diagnostic_id);

                existingDiagnostic?.evidence?.push({
                    id: diagnosticDb.diagnostic_evidence_id,
                    description: evidenceDynamic,
                });

            } else {
                maps.set(diagnosticDb.diagnostic_id, {
                    id: diagnosticDb.diagnostic_id,
                    title: diagnosticDb.diagnostic_title,
                    evidence: [{
                        id: diagnosticDb.diagnostic_evidence_id,
                        description: evidenceDynamic,
                    }]
                });
            }

        }

        return [...maps.values()];
    }

    async getDescriptivesForPattern(patternId: number, snapshot: InsightsSnapshot): Promise<InsightsDescriptive[]> {
        const aurora = await this.aurora;

        const descriptiveQuery = `
        select	ip.id		as	pattern_id,
                ip.title	as	pattern_title,
                ida.id		as	descriptive_id,
                ida.title	as	descriptive_title,
                idae.id		as	descriptive_evidence_id,
                idae.description as	descriptive_evidence
        from	insights_patterns					ip

        join	insights_pattern_descriptive_maps	ipdm
        on	(	ip.id	=	ipdm.pattern_id)

        join	insights_descriptive_analysis		ida
        on	(	ida.id	=	ipdm.descriptive_id)

        join	insights_descriptive_analysis_evidence	idae
        on	(	idae.descriptive_id	=	ida.id)

        where	ip.id = :patternId
        `;

        const descriptivesForPatternDb: Array<Record<any, any>> = await aurora.query(
            descriptiveQuery,
            {
                replacements: {
                    patternId,
                },
                type: QueryTypes.SELECT,
            },
        );

        const maps: Map<string, InsightsDescriptive> = new Map();
        for (const descriptiveDb of descriptivesForPatternDb) {

            const evidenceTemplate = descriptiveDb.descriptive_evidence;

            let evidenceDynamic = evidenceTemplate;

            const fields = evidenceTemplate.match(this.REGEX_FIELDS);


            if (fields && fields.length) {
                for (const field of fields) {
                    const prop = field.replace('[', '').replace(']', '');
                    const value = snapshot[prop as keyof InsightsSnapshot];

                    evidenceDynamic = evidenceDynamic.replace(field, value);
                }
            }

            evidenceDynamic = this.evaluateExpressionInString(evidenceDynamic);

            if (maps.has(descriptiveDb.descriptive_id)) {
                const existingDescriptive = maps.get(descriptiveDb.descriptive_id);

                existingDescriptive?.evidence?.push({
                    id: descriptiveDb.descriptive_evidence_id,
                    description: evidenceDynamic,
                });

            } else {
                maps.set(descriptiveDb.descriptive_id, {
                    id: descriptiveDb.descriptive_id,
                    title: descriptiveDb.descriptive_title,
                    evidence: [{
                        id: descriptiveDb.descriptive_evidence_id,
                        description: evidenceDynamic,
                    }]
                });
            }

        }

        return [...maps.values()];
    }

    async getWidgetInformation(type: string) {
        return this.widgetInformationUtils.getWidgetInformation(type);
    }

    /**
     * If there's a expression in the string, evaluate the expression
     * and replace the expression with the result
     *
     * Example:
     *
     * Before
     *
     * `'Ratio WIP vs Delayed Items: (50/2)%'`
     *
     * After
     *
     * `'Ratio WIP vs Delayed Items: 25%'`
     */
    public evaluateExpressionInString(str: string): string {
        // If there are expressions in the template string, evaluate the expression
        // and replace the expression with the result
        // Filter out all expression that contain strings to exclude null, undefined or code injection
        // Code injection cannot happen now, but if we change the implementation in the future
        // the filter prevents those expression from being evaluated
        const exprs = (str
            .match(this.REGEX_EXPRESSION) ?? [])
            .filter(expr => expr.match(/[a-zA-Z]+/) === null);
        if (exprs) {
            for (let expr of exprs) {
                // Replace all strings with NaN

                // Eval isnt safe to use on user input, but since
                // this string comes from the DB its safe to use here
                let exprResult: number | undefined;
                try {
                    exprResult = eval(expr);
                } catch (e) {
                    console.error({
                        message: 'Error in eval()',
                        errorMessage: (e as Error).message,
                        expr,
                        exprResult
                    });
                }
                if (
                    exprResult !== undefined &&
                    exprResult !== null &&
                    Number.isFinite(exprResult) &&
                    !Number.isNaN(exprResult)
                ) {
                    const roundedResult = Math.round(exprResult);
                    str = str.replace(expr, roundedResult.toString());
                } else {
                    console.error({
                        message: 'Result of eval() is not a number',
                        str,
                        expr,
                        exprResult
                    });
                }
            }
        }
        return str;
    }
}