import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import _ from 'lodash';
import { Logger } from 'log4js';
import { Op, Sequelize } from 'sequelize';
import { v4 } from 'uuid';
import { BaseHandler } from '../common/base_handler';
import { IContextQueries } from '../context/context_queries';
import { MetricModel } from '../models/BusinessScorecard/Metrics';
import { KeyResultsModel } from '../models/KeyResultModel';
import { LinkMapLayoutModel } from '../models/LinkMapLayout';
import { ObeyaRoomModel } from '../models/ObeyaRoomModel';
import { ObjectivesModel } from '../models/ObjectiveModel';
import { Strategies } from '../models/Strategies';
import { VisionsModel } from '../models/VisionModel';
import { VisionStrategicDriverModel } from '../models/VisionStrategicDrivers';
import { OKRKeyResult, OKRObjective } from '../obeya/objectives/calculations';
import { getRelationships } from '../relationships/handler';
import { WidgetInformationUtils } from '../utils/getWidgetInformation';
import { IInsightsPatterns } from '../value_stream_management/continuous_improvements/actionable_insights/pattern_matcher';

export type Relationship = {
    id: string;
    orgId: string;
    fromId: string;
    fromType: string;
    toId: string;
    toType: string;
    fromName: string;
    toName: string;
    linkType: string;
};

class LinkMapHandler extends BaseHandler {
    readonly sequelize: Promise<Sequelize>;
    readonly orgId: string;
    readonly logger: Logger;
    readonly insightsPatterns: IInsightsPatterns;
    readonly contextQueries: IContextQueries;
    readonly widgetInformationUtils: WidgetInformationUtils;
    readonly event: APIGatewayProxyEventV2;

    internalServerError = {
        statusCode: 500,
        body: JSON.stringify({ message: 'Internal Server Error' })
    };
    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.sequelize = this.dependencyInjectionContainer.cradle.auroraWriter;
        this.logger = this.dependencyInjectionContainer.cradle.logger;
        this.orgId = this.dependencyInjectionContainer.cradle.security.organisation!;
        this.insightsPatterns = this.dependencyInjectionContainer.cradle.insightsPatterns;
        this.contextQueries = this.dependencyInjectionContainer.cradle.contextQueries;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
        this.event = event;
    }

    /**
     * Some nodes have implicit links to other nodes. But 
     * metrics, strategies and initiatives could be present without 
     * links
     * 
     * This call fetches these nodes to identify orphan nodes
     */
    private async getNodes() {
        const sequelize = await this.sequelize;
        const metricModel = MetricModel(sequelize);

        const metricsPromise = metricModel.findAll({
            where: {
                org_id: this.orgId
            }
        });

        const strategyModel = Strategies(sequelize);
        const strategiesPromise = strategyModel.findAll({
            where: {
                orgId: this.orgId
            } as any
        });

        const initiativeModel = ObeyaRoomModel(sequelize);
        const initiativesPromise = initiativeModel.findAll({
            where: {
                orgId: this.orgId
            }
        });

        const [metrics, strategies, initiatives] = await Promise.all([
            metricsPromise,
            strategiesPromise,
            initiativesPromise
        ]);

        const allNodes = ([
            ...metrics.map((m: any) => ({ id: m.metric_id, name: m.metric_name, type: 'metric', contextId: m.context_id || '' })),
            ...strategies.map((s: any) => ({ id: s.id, name: s.strategyStatement, type: 'strategy', contextId: s.contextId || '' })),
            ...initiatives.map((i: any) => ({ id: i.roomId, name: i.roomName, type: 'obeyaRoom', contextId: i.contextId || '' }))
        ] as any[])
            .map(n => ({
                id: `${n.id.toString()}`,
                name: n.name,
                type: n.type,
                contextId: n.contextId
            }));

        return allNodes;
    }

    private async getLinks() {
        const links: any[] = [];
        const sequelize = await this.sequelize;

        const visionModel = VisionsModel(sequelize);
        const visions = await visionModel.findAll({
            where: {
                orgId: this.orgId
            } as any
        });

        const visionStrategicDriverModel = VisionStrategicDriverModel(sequelize);
        const strategicDrivers = await visionStrategicDriverModel.findAll({
            where: {
                org_id: this.orgId
            } as any
        });

        visions.forEach(v => {
            links.push({
                fromId: `vision_${v.id?.toString()}`,
                fromType: 'vision',
                fromName: v.visionStatement,
                fromContextId: '',
                toId: `mission_${v.id?.toString()}`,
                toType: 'mission',
                toName: v.missionStatement,
                toContextId: '',
                id: v4(),
                linkType: ''
            });
            strategicDrivers.forEach(sd => {
                links.push({
                    fromId: `mission_${v.id?.toString()}`,
                    fromType: 'mission',
                    fromName: v.missionStatement,
                    fromContextId: '',
                    toId: sd.id.toString(),
                    toType: 'strategicDriver',
                    toName: sd.name,
                    toContextId: '',
                    id: v4(),
                    linkType: ''
                });
            });

        });

        const strategyModel = Strategies(sequelize);
        const strategies = await strategyModel.findAll({
            where: {
                orgId: this.orgId
            } as any
        });

        strategies.filter(strategy => strategy.parentStrategicDriverId).forEach(strategy => {
            console.log({
                fromId: strategy.parentStrategicDriverId,
                fromType: 'strategicDriver',
                fromName: strategicDrivers.find(i => i.id === strategy.parentStrategicDriverId)?.name,
                fromContextId: '',
                toId: strategy.id,
                toType: 'strategy',
                toName: strategy.strategyStatement,
                toContextId: '',
                id: v4(),
                linkType: ''
            });
            links.push({
                fromId: strategy.parentStrategicDriverId,
                fromType: 'strategicDriver',
                fromName: strategicDrivers.find(i => i.id === strategy.parentStrategicDriverId)?.name,
                fromContextId: '',
                toId: strategy.id?.toString(),
                toType: 'strategy',
                toName: strategy.strategyStatement,
                toContextId: '',
                id: v4(),
                linkType: ''
            });
        });

        const ids = strategies
            .map(s => s.id?.toString())
            .filter(id => id !== undefined);
        const objectiveModel = ObjectivesModel(sequelize);
        const allObjectives = await objectiveModel.findAll({
            where: {
                orgId: this.orgId,
                [Op.and]: [
                    {
                        strategyId: {
                            [Op.in]: ids
                        }
                    },
                    {
                        strategyId: {
                            [Op.not]: null
                        }
                    }
                ]
            }
        });

        strategies.forEach(s => {
            const objectives = allObjectives
                .filter((o: any) => o.strategyId !== undefined)
                .filter((o: any) => o.strategyId?.toString() === s.id?.toString());
            objectives.forEach((o: any) => {
                const fromId = s.id?.toString();
                const toId = o.objectiveId?.toString();
                links.push({
                    fromId,
                    fromType: 'strategy',
                    fromName: s.strategyStatement,
                    fromContextId: s.contextId,
                    toId,
                    toType: 'strategicObjective',
                    toName: o.objectiveDescription,
                    toContextId: s.contextId,
                    linkType: '',
                    id: `${fromId}-${toId}`
                });
            });
        });

        const keyResultModel = KeyResultsModel(sequelize);
        const keyResults = await keyResultModel.findAll({
            where: {
                orgId: this.orgId,
                objectiveId: {
                    [Op.in]: allObjectives.map((o: any) => o.objectiveId)
                }
            }
        }) as OKRKeyResult[];

        keyResults.forEach((kr) => {
            const objective: OKRObjective = allObjectives.find((o: any) => o.objectiveId === kr.objectiveId) as any;
            const fromId = objective.objectiveId;
            const toId = kr.keyResultId;
            links.push({
                fromId,
                fromName: objective.objectiveDescription,
                fromType: 'strategicObjective',
                fromContextId: strategies?.find(i => i.id?.toString() === objective.strategyId?.toString())?.contextId,
                toId,
                toName: kr.keyResultDescription,
                toType: 'strategyKeyResult',
                toContextId: strategies?.find(i => i.id?.toString() === objective.strategyId?.toString())?.contextId,
                id: `${fromId}-${toId}`
            });
        });

        return links;
    }

    async getData({ queryStringParameters }: APIGatewayProxyEventV2) {
        try {
            const [nodes, links, relationships] = await Promise.all([
                this.getNodes(),
                this.getLinks(),
                getRelationships(this.event),
            ]);


            JSON.parse(relationships.body ?? '[]').forEach((r: any) => {
                let { fromType, toType } = r;
                const excludedTypes = ['event', 'comment'];
                if (!excludedTypes.includes(fromType) && !excludedTypes.includes(toType)) {
                    const link = _.cloneDeep(r);
                    links.push(link);
                }
            });

            const nodesMap = new Map<string, any>();
            nodes.forEach(n => nodesMap.set(n.id, n));
            console.log(nodes);
            console.log(nodesMap.size);
            links.forEach(l => {
                !nodesMap.has(l.fromId) && nodesMap.set(l.fromId, { id: l.fromId, name: l.fromName, type: l.fromType, contextId: l.fromContextId });
                !nodesMap.has(l.toId) && nodesMap.set(l.toId, { id: l.toId, name: l.toName, type: l.toType, contextId: l.toContextId });
            });
            const allNodes = Array.from(nodesMap.values());

            const sequelize = await this.sequelize;
            const linkMapLayoutModel = LinkMapLayoutModel(sequelize);
            const linkMapLayout = await linkMapLayoutModel.findOne({
                where: {
                    orgId: this.orgId
                },
                raw: true,
                logging: console.log
            }) as any;

            return {
                statusCode: 200,
                body: JSON.stringify({
                    nodes: allNodes,
                    links: links,
                    linkMapLayout: linkMapLayout ? linkMapLayout.mapLayout : null
                })
            };
        } catch (e) {
            console.log(e);
            return this.internalServerError;
        }

    }

    async saveLayout(event: APIGatewayProxyEventV2) {
        const requestBody = event.body;
        if (requestBody) {
            try {
                const sequelize = await this.sequelize;
                const linkMapLayoutModel = LinkMapLayoutModel(sequelize);
                const data = {
                    id: v4(),
                    orgId: this.orgId,
                    mapLayout: requestBody
                };
                await linkMapLayoutModel.destroy({
                    where: {
                        orgId: this.orgId
                    },
                    logging: console.log
                });
                await linkMapLayoutModel.upsert(data, {
                    logging: console.log
                });
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        message: "Layout saved"
                    })
                };
            } catch (e) {
                console.log(e);
                return this.internalServerError;
            }
        } else {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: "Request body is needed to save layout."
                })
            };
        }
    }
}

export const getData = async (event: APIGatewayProxyEventV2) => {
    return await new LinkMapHandler(event).getData(event);
};

export const saveLayout = async (event: APIGatewayProxyEventV2) => {
    return await new LinkMapHandler(event).saveLayout(event);
};