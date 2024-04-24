import pgp from 'pg-promise';
import { QueryTypes, Sequelize } from 'sequelize';
import { Relationship, entityTypes } from './handler';

export default class RelationshipsDbAurora {
    readonly auroraWriter: Sequelize;

    constructor(opt: { auroraWriter: any; }) {
        this.auroraWriter = opt.auroraWriter;
    }

    async removeRelationships(entityId: string | number, entityType: string, orgId: string): Promise<boolean> {
        try {
            const aurora = await this.auroraWriter;
            const query = pgp.as.format(
                `
            DELETE 
            from "relationships" r
            where "orgId" = $<orgId>
                and (("fromId" = $<entityId> and "fromType" = $<entityType>) or  ("toId" = $<entityId> and "toType" = $<entityType>))
            `,
                {
                    orgId: orgId,
                    entityId,
                    entityType
                }
            );
            const result = await aurora.query(query, {
                type: QueryTypes.DELETE,
                logging: console.log
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    async getRelationshipCount(entityId: string | number, entityType: string, orgId: string): Promise<number> {
        try {
            const aurora = await this.auroraWriter;
            const query = pgp.as.format(
                `
            SELECT COUNT(*) 
            from "relationships" r
            where "orgId" = $<orgId>
                and (("fromId" = $<entityId> and "fromType" = $<entityType>) or  ("toId" = $<entityId> and "toType" = $<entityType>))
            `,
                {
                    orgId: orgId,
                    entityId,
                    entityType
                }
            );
            type resultType = {
                count: number;
            };
            const result: resultType[] = await aurora.query(query, {
                type: QueryTypes.SELECT,
                logging: console.log
            }) as any;
            console.log(result[0].count);
            return result[0].count;
        } catch (e) {
            return 0;
        }
    }

    async getRelationships(orgId: string, entityId: string, entityType: string): Promise<Relationship[]> {
        const aurora = await this.auroraWriter;
        const joinStatement = entityTypes.map(i => 'left join ' + i.datasourceStatement).join('\n');
        const query = pgp.as.format(
            `
                SELECT 
                * 
                from "relationships" r
                ${joinStatement}
                where "orgId" = $<orgId>
                    and (("fromId" = $<entityId> and "fromType" = $<entityType>) or  ("toId" = $<entityId> and "toType" = $<entityType>))
                `,
            {
                orgId: orgId,
                entityId,
                entityType
            }
        );
        let results = await aurora.query(query, {
            type: QueryTypes.SELECT,
        });
        const relationships = results.map((result: any) => {
            if (result.toId === entityId && result.toType === entityType) {
                return {
                    id: result.id,
                    fromId: result.toId,
                    fromType: result.toType,
                    fromName: result[result.toType + '_name'],
                    toId: result.fromId,
                    toType: result.fromType,
                    toName: result[result.fromType + '_name'],
                    orgId: result.orgId,
                    linkType: result.linkType
                };
            }
            return {
                id: result.id,
                fromId: result.fromId,
                fromType: result.fromType,
                fromName: result[result.fromType + '_name'],
                toId: result.toId,
                toType: result.toType,
                toName: result[result.toType + '_name'],
                orgId: result.orgId,
                linkType: result.linkType
            };
        });
        return relationships;
    }
}
