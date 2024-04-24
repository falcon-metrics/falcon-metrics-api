import { Lifetime, asClass } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import _ from 'lodash';
import { Logger } from 'log4js';
import { DateTime } from 'luxon';
import pgp from 'pg-promise';
import { Model, Op, QueryTypes, Sequelize } from 'sequelize';
import { RawComment } from '../comments/interfaces';
import { BaseHandler } from '../common/base_handler';
import { IContextQueries } from '../context/context_queries';
import { RawEvent } from '../events/interfaces';
import { MetricModel } from '../models/BusinessScorecard/Metrics';
import { Events } from '../models/Events';
import { KeyResultsModel } from '../models/KeyResultModel';
import { Relationship as RelationshipModel } from '../models/RelationshipModel';
import { OKRKeyResult } from '../obeya/objectives/calculations';
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

type PostPayload = Omit<Relationship, 'orgId'>;

export const entityTypes = [
    {
        label: 'Comment',
        value: 'comment',
        datasourceStatement: '(select id as comment_id , context_id as comment_context_id, title as comment_name from comments) as comments_table on (comments_table.comment_id::text  = r."fromId" or comments_table.comment_id::text = r."toId")'
    },
    {
        label: 'Event',
        value: 'event',
        datasourceStatement: '(select id as event_id , context_id as event_context_id, event_name from events where "orgId" = $<orgId>) as events_table on (events_table.event_id::text = r."fromId" or events_table.event_id::text = r."toId")'
    },
    // {
    //     label: 'Widget',
    //     value: 'widget'
    // },
    // {
    //     label: 'Pattern',
    //     value: 'pattern'
    // },
    // {
    //     label: 'Checkpoint View',
    //     value: 'checkpointView'
    // },
    // {
    //     label: 'Custom View',
    //     value: 'customView'
    // },
    {
        label: 'Metric',
        value: 'metric',
        datasourceStatement: '(select metric_id , context_id as metric_context_id , metric_name from business_scorecard_metrics where org_id = $<orgId>) as metrics_table on (metrics_table.metric_id = r."fromId" or metrics_table.metric_id = r."toId")'
    },
    {
        label: 'Strategy',
        value: 'strategy',
        datasourceStatement: '(select id as strategy_id , "contextId" as strategy_context_id ,  "strategyStatement" as strategy_name from strategies where "orgId" = $<orgId>) as strategy_table on (strategy_table.strategy_id::text = r."fromId" or strategy_table.strategy_id::text = r."toId")'
    },
    {
        label: 'Strategic Driver',
        value: 'strategicDriver',
        datasourceStatement: '(select id as "strategicDriver_id" , \'\' as "strategicDriver_context_id" ,   name as "strategicDriver_name" from vision_strategic_drivers where org_id = $<orgId>) as strategic_driver_table on (strategic_driver_table."strategicDriver_id" = r."fromId" or strategic_driver_table."strategicDriver_id" = r."toId")'
    },
    {
        label: 'Initiative',
        value: 'obeyaRoom',
        datasourceStatement: '(select "roomId" as "obeyaRoom_id", "contextId" as "obeyaRoom_context_id" , "roomName" as "obeyaRoom_name" from obeya_rooms where "orgId" = $<orgId>) as obeya_room_table on (obeya_room_table."obeyaRoom_id" = r."fromId" or obeya_room_table."obeyaRoom_id" = r."toId")'
    },
    {
        label: 'Strategy Objective',
        value: 'strategicObjective',
        datasourceStatement: '(select "objectiveId" as "strategicObjective_id" , \'\' as "strategicObjective_context_id" , "objectiveDescription" as "strategicObjective_name" from obeya_objectives where "orgId" = $<orgId>) as strategic_objective_table on (strategic_objective_table."strategicObjective_id" = r."fromId" or strategic_objective_table."strategicObjective_id" = r."toId")'
    },
    {
        label: 'Strategy Key Result',
        value: 'strategyKeyResult',
        datasourceStatement: '(select "keyResultId" as "strategyKeyResult_id" , \'\' as "strategyKeyResult_context_id" , "keyResultDescription" as "strategyKeyResult_name" from "obeya_keyResults" where "orgId" = $<orgId>) as strategic_key_result_table on (strategic_key_result_table."strategyKeyResult_id" = r."fromId" or strategic_key_result_table."strategyKeyResult_id" = r."toId")'
    }
];


export class RelationshipsHandler extends BaseHandler {
    readonly sequelize: Promise<Sequelize>;
    readonly orgId: string;
    readonly logger: Logger;
    readonly insightsPatterns: IInsightsPatterns;
    readonly contextQueries: IContextQueries;
    readonly widgetInformationUtils: WidgetInformationUtils;

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
    }

    private parseAndValidate(bodyString: string): { payload: PostPayload, isValid: boolean; errors?: string[]; } {
        let payload: any | undefined;
        let isValid = true;
        const errors = [];
        try {
            payload = JSON.parse(bodyString);
        } catch (e) {
            const message = 'Error parsing payload';
            this.logger.error(JSON.stringify({
                message
            }));
            isValid = false;
            errors.push(message);
        }
        if (payload) {
            // Check keys
            if (
                _.difference(
                    ['fromType', 'fromId', 'toType', 'toId', 'linkType'],
                    Object.keys(payload)
                ).length !== 0
            ) {
                isValid = false;
                errors.push('Missing keys');
            }

            // All values must be of type string
            if (!Object.values(payload).map(k => typeof k).every(type => type === 'string')) {
                isValid = false;
                errors.push('All values must be strings');
            }

            // Check if valid entity types
            if (
                !entityTypes.map(i => i.value).includes(payload.fromType) ||
                !entityTypes.map(i => i.value).includes(payload.toType)
            ) {
                errors.push('Invalid entity types');
                isValid = false;
            }
        }

        return { payload, isValid, errors };
    }

    async createRelationship({ body }: APIGatewayProxyEventV2) {
        try {
            const sequelize = await this.sequelize;

            const { payload, isValid, errors } = this.parseAndValidate(body ?? '{}');
            if (!isValid) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ errors })
                };
            }
            const now = DateTime.now().toISO();
            const relationship = {
                orgId: this.orgId,
                id: payload.id,
                fromId: payload.fromId,
                fromType: payload.fromType,
                toId: payload.toId,
                toType: payload.toType,
                linkType: payload.linkType
            };


            // PUT request must be idempotent
            // ON CONFLICT condition of Sequelize does not work for this use case, 
            // Hency the SQL query below. A select statement is necessary to return
            // the original ID of the relationship if it already exists
            const query = pgp.as.format(
                `
                INSERT 
                INTO "relationships" ("id","orgId","fromId","fromType","toId","toType", "linkType") 
                VALUES ($<id>,$<orgId>,$<fromId>,$<fromType>,$<toId>,$<toType>,$<linkType>) 
                ON CONFLICT do nothing;

                SELECT 
                * 
                from "relationships"
                where "orgId" = $<orgId>
                    and "fromId" = $<fromId>
                    and "toId" = $<toId>
                    and "fromType" = $<fromType>
                    and "toType" = $<toType>
                `,
                {
                    ...relationship
                }
            );
            let result = await sequelize.query(query, {
                type: QueryTypes.SELECT,
            });

            return {
                statusCode: 201,
                body: JSON.stringify(result[0])
            };
        } catch (e) {
            this.logger.error(JSON.stringify({
                message: 'Error in createRelationship',
                errorMessage: (e as Error).message,
                stack: (e as Error).stack,
            }));

            return this.internalServerError;
        }
    }
    private validateQueryParams(entityId: string | undefined, entityType: string | undefined) {
        let error;

        // Validation
        if (entityId === undefined) {
            error = 'entityId is required';
        } else if (typeof entityId !== 'string') {
            error = 'entityId must be string';
        }
        if (entityType === undefined) {
            error = 'entityType is required';
        } else if (typeof entityType !== 'string') {
            error = 'entityType must be string';
        }

        return error;
    }

    private buildQuery(entityId: string, entityType: string) {
        return {
            [Op.or]: [
                {
                    [Op.and]: [
                        { fromId: entityId },
                        { fromType: entityType },
                    ]
                },
                {
                    [Op.and]: [
                        { toId: entityId },
                        { toType: entityType },
                    ]
                },
            ],
            orgId: this.orgId
        };
    }

    async getRelationships({ queryStringParameters }: APIGatewayProxyEventV2) {
        try {
            const { entityId, entityType } = queryStringParameters ?? {};
            const sequelize = await this.sequelize;

            const joinStatement = entityTypes.map(i => 'left join ' + i.datasourceStatement).join('\n');
            const query = pgp.as.format(
                `
                SELECT 
                * 
                from "relationships" r
                ${joinStatement}
                where "orgId" = $<orgId>` + (
                    (entityId !== undefined && entityType !== undefined)
                        ? `and (("fromId" = $<entityId> and "fromType" = $<entityType>) or  ("toId" = $<entityId> and "toType" = $<entityType>))
                    `
                        : ''
                ),
                {
                    orgId: this.orgId,
                    entityId,
                    entityType
                }
            );
            let results = await sequelize.query(query, {
                type: QueryTypes.SELECT,
            });
            const relationships = results.map((result: any) => {
                if (result.toId === entityId && result.toType === entityType) {
                    return {
                        id: result.id,
                        fromId: result.toId,
                        fromType: result.toType,
                        fromName: result[result.toType + '_name'],
                        fromContextId: result[result.toType + '_context_id'] || '',
                        toId: result.fromId,
                        toType: result.fromType,
                        toName: result[result.fromType + '_name'],
                        toContextId: result[result.fromType + '_context_id'] || '',
                        orgId: result.orgId,
                        linkType: result.linkType
                    };
                }
                return {
                    id: result.id,
                    fromId: result.fromId,
                    fromType: result.fromType,
                    fromName: result[result.fromType + '_name'],
                    fromContextId: result[result.fromType + '_context_id'] || '',
                    toId: result.toId,
                    toType: result.toType,
                    toName: result[result.toType + '_name'],
                    toContextId: result[result.toType + '_context_id'] || '',
                    orgId: result.orgId,
                    linkType: result.linkType
                };
            });
            let indirectRelationships: any[] = [];
            if (entityType === 'strategy' && entityId) {
                const keyResultModel = KeyResultsModel(sequelize);
                const keyResults: Array<OKRKeyResult> = await keyResultModel.findAll({
                    where: {
                        strategyId: parseInt(entityId.toString())
                    },
                    logging: console.log,
                    raw: true
                }) as any;
                const keyResultIds = keyResults.map(i => i.keyResultId);
                if (keyResultIds.length > 0) {
                    const js = pgp.as.format(
                        `${joinStatement}`,
                        {
                            orgId: this.orgId,
                            entityId,
                            entityType
                        }
                    );
                    const query2 = `
                        SELECT 
                        * 
                        from "relationships" r
                        ${js}
                        where "orgId" = :orgId
                        and (("fromId" in (:entityId) and "fromType" = :entityType) 
                        or  ("toId" in (:entityId) and "toType" = :entityType))
                    `;
                    const indirectRelationshipsResult = await sequelize.query(query2,
                        {
                            replacements: {
                                orgId: this.orgId,
                                entityId: keyResultIds,
                                entityType: 'strategyKeyResult'
                            },
                            type: QueryTypes.SELECT,
                            logging: console.log
                        });
                    indirectRelationships = indirectRelationshipsResult.map((result: any) => {
                        if (result.toId === entityId && result.toType === entityType) {
                            return {
                                id: result.id,
                                fromId: result.toId,
                                fromType: result.toType,
                                fromName: result[result.toType + '_name'],
                                fromContextId: result[result.toType + '_context_id'] || '',
                                toId: result.fromId,
                                toType: result.fromType,
                                toName: result[result.fromType + '_name'],
                                toContextId: result[result.fromType + '_context_id'] || '',
                                orgId: result.orgId,
                                linkType: result.linkType
                            };
                        }
                        return {
                            id: result.id,
                            fromId: result.fromId,
                            fromType: result.fromType,
                            fromName: result[result.fromType + '_name'],
                            fromContextId: result[result.fromType + '_context_id'] || '',
                            toId: result.toId,
                            toType: result.toType,
                            toName: result[result.toType + '_name'],
                            toContextId: result[result.toType + '_context_id'] || '',
                            orgId: result.orgId,
                            linkType: result.linkType
                        };
                    }).filter(x => x.toType === 'obeyaRoom').map(x => {
                        return {
                            ...x,
                            isIndirect: true
                        };
                    });
                }
            }

            const combinedRelationships = [...relationships, ...indirectRelationships];
            const filteredRelationships = combinedRelationships.filter((r) => r.fromName !== null && r.toName !== null);

            return {
                statusCode: 200,
                body: JSON.stringify(filteredRelationships)
            };
        } catch (e) {
            this.logger.error(JSON.stringify({
                message: 'Error in get relationships',
                errorMessage: (e as Error).message,
                stack: (e as Error).stack,
            }));

            return this.internalServerError;
        }
    }

    private validateDeleteQueryParams(relationshipId: string | undefined) {
        let error;

        // Validation
        if (relationshipId === undefined) {
            error = 'relationshipId is required';
        } else if (typeof relationshipId !== 'string') {
            error = 'relationshipId must be string';
        }
        return error;
    }

    private buildDeleteQuery(relationshipId: string) {
        return {
            [Op.and]: [
                { id: relationshipId },
                { orgId: this.orgId }
            ]
        };
    }

    /**
     * Delete all relationships from/to the given entity
     */
    async deleteRelationships({ queryStringParameters }: APIGatewayProxyEventV2) {
        let deleteCount;
        try {
            const { relationshipId } = queryStringParameters ?? {};
            let error = this.validateDeleteQueryParams(relationshipId);
            if (error !== undefined) {
                if (error) {
                    return {
                        statusCode: 400,
                        body: JSON.stringify({ error })
                    };
                }
            }

            const sequelize = await this.sequelize;
            const model = RelationshipModel(sequelize);
            deleteCount = await model.destroy({
                where: this.buildDeleteQuery(relationshipId as string)
            });
            return {
                statusCode: 200,
                body: JSON.stringify({ message: `Deleted ${deleteCount} relationships` })
            };
        } catch (e) {
            return this.internalServerError;
        }
    }

    private validateElementType(elementType: string | undefined) {
        let error;
        if (!elementType || typeof elementType !== 'string') {
            error = 'Element type must be string';
        } else if (
            !entityTypes.map(i => i.value).includes(elementType)
        ) {
            error = 'Invalid entity type';
        }
        return error;
    }

    async getElements({ queryStringParameters }: APIGatewayProxyEventV2) {
        try {
            const { elementType } = queryStringParameters ?? {};
            let error = this.validateElementType(elementType);
            if (error !== undefined) {
                if (error) {
                    return {
                        statusCode: 400,
                        body: JSON.stringify({ error })
                    };
                }
            }
            const sequelize = await this.sequelize;
            let result = [];
            if (elementType === 'comment') {
                // Logic for Comment
                const query = `SELECT *
                    FROM "comments" c
                    WHERE
                        c."parentId" IS NULL
                        AND c."orgId" = :orgId`;
                const queryResult: Array<RawComment> = await sequelize.query(query, {
                    replacements: {
                        orgId: this.orgId,
                    },
                    type: QueryTypes.SELECT,
                });
                result = queryResult.map(i => {
                    return {
                        label: i.title,
                        value: i.id
                    };
                });
            } else if (elementType === 'event') {
                // Logic for Event
                const model = Events(sequelize);
                const eventsItems: Model<RawEvent>[] = await model.findAll({
                    where: {
                        orgId: this.orgId
                    },
                });
                result = eventsItems.map(i => {
                    return {
                        label: i.dataValues.event_name,
                        value: i.dataValues.id
                    };
                });
            }
            // else if (elementType === 'pattern') {
            // Logic for Pattern
            // const contexts = await this.contextQueries.getVisibleContextTree();
            // const theArray: HierarchyAsArray | ContextItems = Array.from(
            //     contexts.values(),
            // );
            // const contextArray : { id: string , name: string}[] = [];
            // theArray.forEach((portfolio) => {
            //     contextArray.push(
            //         {
            //             id: portfolio.id,
            //             name: portfolio.displayName
            //         }
            //     );
            //     Array.from(portfolio.children.values()).map(
            //         (initiative) => {
            //             contextArray.push(
            //                 {
            //                     id: initiative.id,
            //                     name: initiative.displayName
            //                 }
            //             );
            //             Array.from(
            //                 initiative.children.values(),
            //             ).map((team) => {
            //                 contextArray.push(
            //                     {
            //                         id: team.id,
            //                         name: team.displayName
            //                     }
            //                 );
            //             });
            //         },
            //     );
            // });
            // result = []
            // await Promise.all(contextArray.map(async (context) => {
            //     const patterns = await this.insightsPatterns.getTruePatterns(this.orgId , context.id)
            //     patterns.patterns.map(pattern => {
            //         result.push(
            //             {
            //                 id: pattern.id
            //             }
            //         )
            //     })
            //   }));
            // } else if (elementType === 'checkpointView') {
            //     // Logic for CheckpointView
            //     const aurora = await this.sequelize;
            //     const model = CheckpointsViews(aurora);

            //     const checkpointItems = await model.findAll({
            //         where: {
            //             orgId: this.orgId,
            //         },
            //         order: [['start_date', 'ASC']],
            //     });

            //     result = checkpointItems.map(checkpointItem => {
            //         return {
            //             label: checkpointItem.dataValues.name,
            //             value: checkpointItem.dataValues.id
            //         };
            //     });
            // } else if (elementType === 'customView') {
            //     // Logic for CustomView
            //     const aurora = await this.sequelize;
            //     const customViews = await getNormalisationCategoryList(aurora, this.orgId);
            //     result = customViews.map(customView => {
            //         return {
            //             label: customView.displayName,
            //             value: customView.id
            //         };
            //     });
            //} 
            else if (elementType === 'metric') {
                // Logic for Metric
                const aurora = await this.sequelize;
                const model = MetricModel(aurora);
                const metrics = await model.findAll({
                    where: {
                        org_id: this.orgId
                    }
                });
                result = metrics.map(metric => {
                    return {
                        label: metric.dataValues.metric_name,
                        value: metric.dataValues.metric_id
                    };
                });
            } else if (elementType === 'strategy') {
                // Logic for Strategy
                const query = `select * from strategies where strategies."deletedAt" IS NULL AND strategies."strategyStatement" <> '' AND strategies."orgId" = :orgId`;
                const queryResult: any = await sequelize.query(query, {
                    replacements: {
                        orgId: this.orgId,
                    },
                    type: QueryTypes.SELECT,
                });
                result = queryResult.map((strategy: { [x: string]: any; }) => {
                    return {
                        label: strategy['strategyStatement'],
                        value: strategy['id']
                    };
                });
            } else if (elementType === 'obeyaRoom') {
                const query = `select "roomId" as "obeyaRoom_id", "roomName" as "obeyaRoom_name" from obeya_rooms where "orgId" = :orgId`;
                const queryResult: any = await sequelize.query(query, {
                    replacements: {
                        orgId: this.orgId,
                    },
                    type: QueryTypes.SELECT,
                });
                result = queryResult.map((obeyaRoom: { [x: string]: any; }) => {
                    return {
                        label: obeyaRoom['obeyaRoom_name'],
                        value: obeyaRoom['obeyaRoom_id']
                    };
                });
            } else if (elementType === 'strategicObjective') {
                const query = `select "objectiveId" as "strategicObjective_id"  , "objectiveDescription" as "strategicObjective_name" from obeya_objectives where "orgId" = :orgId and "strategyId" is not NULL`;
                const queryResult: any = await sequelize.query(query, {
                    replacements: {
                        orgId: this.orgId,
                    },
                    type: QueryTypes.SELECT,
                });
                result = queryResult.map((strategyObjective: { [x: string]: any; }) => {
                    return {
                        label: strategyObjective['strategicObjective_name'],
                        value: strategyObjective['strategicObjective_id']
                    };
                });
            } else if (elementType === 'strategyKeyResult') {
                const query = `select "keyResultId" as "strategyKeyResult_id" , "keyResultDescription" as "strategyKeyResult_name" from "obeya_keyResults" where "orgId" = :orgId and "strategyId" is not NULL`;
                const queryResult: any = await sequelize.query(query, {
                    replacements: {
                        orgId: this.orgId,
                    },
                    type: QueryTypes.SELECT,
                });
                result = queryResult.map((strategyKeyResult: { [x: string]: any; }) => {
                    return {
                        label: strategyKeyResult['strategyKeyResult_name'],
                        value: strategyKeyResult['strategyKeyResult_id']
                    };
                });
            } else if (elementType === 'strategicDriver') {
                const query = `select vs.id as "strategicDriver_id", vs.name as "strategicDriver_name" from vision_strategic_drivers vs inner join visions v on vs.vision_id = v.id where vs.org_id = :orgId`;
                const queryResult: any = await sequelize.query(query, {
                    replacements: {
                        orgId: this.orgId,
                    },
                    type: QueryTypes.SELECT,
                });
                result = queryResult.map((strategicDriver: { [x: string]: any; }) => {
                    return {
                        label: strategicDriver['strategicDriver_name'],
                        value: strategicDriver['strategicDriver_id']
                    };
                });
            }
            return {
                statusCode: 200,
                body: JSON.stringify(result)
            };
        } catch (e) {
            console.log(e);
            return this.internalServerError;
        }

    }
}

export const createRelationship = async (event: APIGatewayProxyEventV2) => {
    return await new RelationshipsHandler(event).createRelationship(event);
};

export const getRelationships = async (event: APIGatewayProxyEventV2) => {
    return await new RelationshipsHandler(event).getRelationships(event);
};

export const deleteRelationships = async (event: APIGatewayProxyEventV2) => {
    return await new RelationshipsHandler(event).deleteRelationships(event);
};

export const getElements = async (event: APIGatewayProxyEventV2) => {
    return await new RelationshipsHandler(event).getElements(event);
};
