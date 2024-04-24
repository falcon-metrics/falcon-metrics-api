import _ from "lodash";
import { DateTime } from "luxon";
import { Sequelize } from "sequelize";
import { v4 } from "uuid";
import { SecurityContext } from "../common/security";
import { Context } from "../context/context_db_aurora";
import { ContextItem, IContext } from "../context/context_interfaces";
import { MetricModel } from "../models/BusinessScorecard/Metrics";
import { PerspectivesModel } from "../models/BusinessScorecard/Perspectives";
import { CheckpointsViews } from "../models/CheckpointsViews";
import { MetricsConfig } from "../models/MetricsConfig";
import { ObeyaRoomModel } from "../models/ObeyaRoomModel";
import { PortfolioModel } from "../models/PortfolioModel";


const isDev = false;

export class SeedDataCreator {
    context: IContext;
    private orgId: string;
    private aurora: Promise<Sequelize>;
    private security: SecurityContext;
    private contexts: ContextItem[] = [];

    constructor(opts: {
        security: SecurityContext;
        context: Context;
        auroraWriter: Promise<Sequelize>;
    }) {
        this.context = opts.context;
        this.orgId = opts.security.organisation!;
        this.aurora = opts.auroraWriter;
        this.security = opts.security;
    }

    private async createPortfolios() {
        const sequelize = await this.aurora;
        const portfolioModel = PortfolioModel(sequelize);
        const initiativeModel = ObeyaRoomModel(sequelize);
        const orgId = this.orgId;
        const [portfolios, initiatives] = await Promise.all([
            portfolioModel.findAll({ where: { orgId } }),
            initiativeModel.findAll({ where: { orgId } })
        ]);
        const createPortfolios = isDev || (portfolios.length === 0);
        if (createPortfolios) {
            const id1 = v4();
            const id2 = v4();
            const portfolio1 = {
                orgId,
                // id: id1,
                order: 0,
                columnId: id1,
                columnName: 'Discovery',
                colour: '#54A7D1'
            };
            const portfolio2 = {
                orgId,
                // id: id1,
                order: 0,
                columnId: id2,
                columnName: 'Delivery',
                colour: '#54DEBD'
            };

            const initiativesPromises: Promise<any>[] = [];
            this.contexts.forEach(c => {
                const filtered = initiatives.filter(i => (i as any).contextId === c.id);
                const createInitiatives = isDev || (filtered.length === 0);
                if (createInitiatives) {
                    const roomId1 = v4();
                    const initiative1 = {
                        columnId: id1,
                        orgId,
                        roomName: 'Customer feedback surveys',
                        beginDate: DateTime.now().minus({ month: 1 }).toISO(),
                        endDate: DateTime.now().toISO(),
                        datasourceId: '-',
                        filterId: undefined,
                        flomatikaQuery: `WorkItemType = 'Feature'`,
                        parsedQuery: `LOWER("flomatikaWorkItemTypeName")= 'feature'`,
                        roomId: roomId1,
                        type: 'initiative',
                        goal: 'Conduct customer feedback surveys to identify desired features',
                        includeRelated: false,
                        includeChildren: false,
                        includeChildrenOfRelated: false,
                        includeChildrenOfChildren: false,
                        hierarchyLevel: 0,
                        excludeQuery: undefined,
                        parsedExcludeQuery: undefined,
                        linkTypes: [],
                        order: 1,
                        isFinished: false,
                        isArchived: false,
                        baselines: undefined,
                        constraintType: undefined,
                        constratintDate: undefined,
                        dependencies: undefined,
                        contextId: c.id,
                    };
                    const roomId2 = v4();
                    const initiative2 = {
                        columnId: id2,
                        orgId,
                        roomName: 'Proof of Concept',
                        beginDate: DateTime.now().minus({ month: 2 }).toISO(),
                        endDate: DateTime.now().minus({ month: 1 }).toISO(),
                        datasourceId: '-',
                        filterId: undefined,
                        flomatikaQuery: `WorkItemType = 'Feature'`,
                        parsedQuery: `LOWER("flomatikaWorkItemTypeName")= 'feature'`,
                        roomId: roomId2,
                        type: 'initiative',
                        goal: 'Dedicate a development sprint solely for the development of Proof Of Concept for the new features',
                        includeRelated: false,
                        includeChildren: false,
                        includeChildrenOfRelated: false,
                        includeChildrenOfChildren: false,
                        hierarchyLevel: 0,
                        excludeQuery: undefined,
                        parsedExcludeQuery: undefined,
                        linkTypes: [],
                        order: 2,
                        isFinished: false,
                        isArchived: false,
                        baselines: undefined,
                        constraintType: undefined,
                        constratintDate: undefined,
                        dependencies: undefined,
                        contextId: c.id,
                    };

                    initiativesPromises.push(initiativeModel.upsert(initiative1));
                    initiativesPromises.push(initiativeModel.upsert(initiative2));
                }
            });

            await Promise.all([
                portfolioModel.upsert(portfolio1),
                portfolioModel.upsert(portfolio2),
                ...initiativesPromises,
            ]);

        }
    }

    async createCheckpoints() {
        const sequelize = await this.aurora;
        const checkpointsModel = CheckpointsViews(sequelize);
        const orgId = this.orgId;
        const checkpoints = await checkpointsModel.findAll({ where: { orgId } });
        const createCheckpoints = isDev || (checkpoints.length === 0);
        if (createCheckpoints) {
            const d = DateTime
                .now()
                .setZone('utc')
                .startOf('month')
                .minus({ month: 1 });

            const checkpoints: any[] = [];
            for (let i = 0; i < 4; i++) {
                const start = d.minus({ month: i });
                const end = start.endOf('month');
                const name = _.capitalize(start.monthLong);
                checkpoints.push({
                    name,
                    start_date: start.toISO(),
                    end_date: end.toISO(),
                    orgId,
                });
            }

            await Promise.all(checkpoints.map(c => checkpointsModel.upsert(c)));
        }
    }

    /**
     * Disabling create metrics because it causes a lot of noise in the UI
     * 
     * The top level context shows all the metrics. Hence disabling seed data for metrics
     */
    async createMetrics() {
        const sequelize = await this.aurora;
        const metricModel = MetricModel(sequelize);
        const perspectiveModel = PerspectivesModel(sequelize);
        const orgId = this.orgId;
        const [metrics, perspectives] = await Promise.all([
            metricModel.findAll({ where: { org_id: orgId } }),
            perspectiveModel.findAll({ where: { org_id: orgId } }),
        ]);
        const createPerspectives = isDev || (perspectives.length === 0);
        const newPerspectives: any[] = [];
        const OPERATIONS = 'Operations';
        const PRODUCT = 'Product';
        if (createPerspectives) {
            const names = [PRODUCT, OPERATIONS];
            names.forEach(n => newPerspectives.push({
                perspective_id: v4(),
                perspective_name: n,
                org_id: orgId,
                createdAt: DateTime.now().toISO(),
                updatedAt: DateTime.now().toISO(),
            }));

            await Promise.all(newPerspectives.map(p => perspectiveModel.upsert(p)));
        }

        const promises: any[] = [];
        this.contexts.forEach(c => {
            const filtered = metrics.filter(m => (m as any).context_id === c.id);
            const createMetrics = isDev || (filtered.length === 0);
            if (createMetrics) {
                const productMetrics = [
                    {
                        name: 'New features released',
                        type: 'health-indicator',
                        metric_unit: '%',
                        upper_limit: 60,
                        lower_limit: 20,
                    },
                    {
                        name: 'Social media engagement rate',
                        type: 'vanity-metric',
                        metric_unit: '%',
                        upper_limit: 60,
                        lower_limit: 20,
                    },
                    {
                        name: 'Average customer ticket response time',
                        type: 'improvement-driver',
                        metric_unit: 'units',
                        target: 20,
                    },
                    {
                        name: 'Number of new clients acquired',
                        type: 'health-indicator',
                        metric_unit: '%',
                        upper_limit: 60,
                        lower_limit: 20,
                    }
                ];
                const operationsMetrics = [
                    {
                        name: 'Database cost',
                        type: 'health-indicator',
                        metric_unit: 'units',
                        upper_limit: 500,
                        lower_limit: 300,
                    },
                    {
                        name: 'Uptime',
                        type: 'health-indicator',
                        metric_unit: '%',
                        upper_limit: 100,
                        lower_limit: 95,
                    },
                    {
                        name: 'Number of bug reports',
                        type: 'improvement-driver',
                        metric_unit: 'units',
                        target: 20,
                    },
                ];
                newPerspectives.forEach(p => {
                    let metrics;
                    if (p.perspective_name === OPERATIONS) {
                        metrics = operationsMetrics;
                    } else if (p.perspective_name === PRODUCT) {
                        metrics = productMetrics;
                    } else {
                        return;
                    }
                    promises.push(
                        ...metrics
                            .map(({ name, type, upper_limit, lower_limit, target }) => metricModel.upsert({
                                metric_id: v4(),
                                metric_name: name,
                                metric_type: type,
                                context_id: c.id,
                                perspective_id: p.perspective_id,
                                org_id: orgId,
                                upper_limit,
                                lower_limit,
                                target
                            }))
                    );
                });
            }
        });
        await Promise.all(promises);
    }

    async savePerformanceMetricsConfig() {
        const orgId = this.orgId;
        const sequelize = await this.aurora;
        // TODO: Find a better way to implement this
        // This is hardcoded here. If we change the column names, its going to break the seed data creator
        const Unit = {
            BLANK: '',
            PERCENTAGE: 'PERCENTAGE',
            DAYS: 'DAYS',
            FLOW_ITEMS: 'FLOW_ITEMS'
        };

        const TrendComparison = {
            UP_IS_GOOD: 'up is good',
            DOWN_IS_GOOD: 'down is good'
        };

        const metricsConfig = [
            {
                columnName: "lead_time_portfolio_85",
                displayName: "Lead Time portfolio items (85th)",
                unit: Unit.DAYS,
                isBenchmarkingRecommended: false,
                trendComparison: TrendComparison.DOWN_IS_GOOD,
                display_on_checkpoints: true,
                display_on_benchmarking: false
            },
            {
                columnName: "lead_time_85",
                displayName: "Lead Time team level items (85th)",
                unit: Unit.DAYS,
                isBenchmarkingRecommended: false,
                trendComparison: TrendComparison.DOWN_IS_GOOD,
                display_on_checkpoints: true,
                display_on_benchmarking: true
            },
            {
                columnName: "lead_time_target_met",
                displayName: "Lead Time Target Met (%)",
                unit: Unit.PERCENTAGE,
                isBenchmarkingRecommended: true,
                trendComparison: TrendComparison.UP_IS_GOOD,
                display_on_checkpoints: false,
                display_on_benchmarking: false
            },
            {
                columnName: "total_throughput",
                displayName: "Throughput (count)",
                unit: Unit.FLOW_ITEMS,
                isBenchmarkingRecommended: false,
                trendComparison: TrendComparison.UP_IS_GOOD,
                display_on_checkpoints: true,
                display_on_benchmarking: false
            },
            {
                columnName: "flow_efficiency",
                displayName: "Flow Efficiency (%)",
                unit: Unit.PERCENTAGE,
                isBenchmarkingRecommended: true,
                trendComparison: TrendComparison.UP_IS_GOOD,
                display_on_checkpoints: true,
                display_on_benchmarking: true
            },
            {
                columnName: "flow_debt",
                displayName: "Productivity Debt (%)",
                unit: Unit.PERCENTAGE,
                isBenchmarkingRecommended: true,
                trendComparison: TrendComparison.DOWN_IS_GOOD,
                display_on_checkpoints: true,
                display_on_benchmarking: true
            },
            {
                columnName: "throughput_predictability",
                displayName: "Throughput Predictability",
                unit: Unit.BLANK,
                isBenchmarkingRecommended: false,
                trendComparison: TrendComparison.DOWN_IS_GOOD,
                display_on_checkpoints: false,
                display_on_benchmarking: false
            },
            {
                columnName: "lead_time_predictability",
                displayName: "Lead Time Predictability",
                unit: Unit.BLANK,
                isBenchmarkingRecommended: false,
                trendComparison: TrendComparison.DOWN_IS_GOOD,
                display_on_checkpoints: true,
                display_on_benchmarking: true
            },
            {
                columnName: "fitness_level",
                displayName: "% of work within SLE",
                unit: Unit.PERCENTAGE,
                isBenchmarkingRecommended: true,
                trendComparison: TrendComparison.UP_IS_GOOD,
                display_on_checkpoints: true,
                display_on_benchmarking: true
            },
            {
                columnName: "stale_work",
                displayName: "Stale Work",
                unit: Unit.FLOW_ITEMS,
                isBenchmarkingRecommended: false,
                trendComparison: TrendComparison.DOWN_IS_GOOD,
                display_on_checkpoints: true,
                display_on_benchmarking: true
            },
            {
                columnName: "average_throughput",
                displayName: "Average Throughput",
                unit: Unit.FLOW_ITEMS,
                isBenchmarkingRecommended: false,
                trendComparison: TrendComparison.UP_IS_GOOD,
                display_on_checkpoints: false,
                display_on_benchmarking: false
            },
            {
                columnName: "lead_time_team_avg",
                displayName: "Average Lead Time - Team",
                unit: Unit.DAYS,
                isBenchmarkingRecommended: true,
                trendComparison: TrendComparison.DOWN_IS_GOOD,
                display_on_checkpoints: false,
                display_on_benchmarking: false
            },
            {
                columnName: "lead_time_portfolio_avg",
                displayName: "Average Lead Time - Portfolio",
                unit: Unit.DAYS,
                isBenchmarkingRecommended: false,
                trendComparison: TrendComparison.DOWN_IS_GOOD,
                display_on_checkpoints: false,
                display_on_benchmarking: false
            },
        ];

        const perfMetricsModel = MetricsConfig(sequelize);
        const config = await perfMetricsModel.findAll({
            where: { orgId }
        });

        const createConfig = isDev || (config.length === 0);

        if (createConfig) {
            const obj = {
                orgId,
                metrics: JSON.stringify(metricsConfig),
                customViews: []
            };

            await perfMetricsModel.upsert(
                obj,
                { conflictFields: ['orgId'] }
            );
        }

    }

    async createSeedData() {
        try {
            const contexts = await this.context.getAllExceptArchived(this.orgId);
            this.contexts.push(...contexts);

            // TODO: Implement this with a transaction
            await Promise.all([
                this.createPortfolios(),
                this.createCheckpoints(),
                this.savePerformanceMetricsConfig()
            ]);
        } catch (e) {
            console.error('Error in createSeedData', e);
            throw e;
        }
    };
}