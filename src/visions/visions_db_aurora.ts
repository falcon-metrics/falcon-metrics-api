import { Sequelize } from 'sequelize';
import { VisionsModel } from '../models/VisionModel';
import { Op, QueryTypes } from 'sequelize';
import { StrategicDriver, TimeHorizon, VisionItem } from './interfaces';
import { Interval } from 'luxon';
import { VisionStrategicDriverModel } from '../models/VisionStrategicDrivers';
import { TimeHorizonModel } from '../models/TimeHorizon';
import RelationshipsDbAurora from '../relationships/relationships_db_aurora';
import { StrategyItem, HorizonItem } from '../strategies/interfaces';
import _ from 'lodash';

export class VisionsDbAurora {
    private aurora: Promise<Sequelize>;
    private relationshipsDbAurora: RelationshipsDbAurora;

    constructor(opt: {
        aurora: Promise<Sequelize>;
        relationshipsDbAurora: RelationshipsDbAurora;
    }) {
        this.aurora = opt.aurora;
        this.relationshipsDbAurora = opt.relationshipsDbAurora;
    }

    datePredicates(dateRange: Interval, sequelize: Sequelize) {
        const from = dateRange.start.toISO();
        const to = dateRange.end.toISO();
        return {
            [Op.gte]: sequelize.fn('DATE', from),
            [Op.lte]: sequelize.fn('DATE', to),
        };
    }

    async getAllHorizons(orgId: string): Promise<HorizonItem[]> {
        const aurora = await this.aurora;
        const query = `
            SELECT *
                FROM time_horizons
            WHERE time_horizons."orgId" = :orgId
        `;

        const result: Array<HorizonItem> = await aurora.query(query, {
            replacements: {
                orgId,
            },
            type: QueryTypes.SELECT,
        });

        return result;
    }

    async getAllVisions(orgId: string): Promise<VisionItem[]> {
        const aurora = await this.aurora;
        const query = `
            SELECT *
                FROM visions
            WHERE visions."orgId" = :orgId
        `;

        let visions: Array<VisionItem> = await aurora.query(query, {
            replacements: {
                orgId,
            },
            type: QueryTypes.SELECT,
        });

        if (visions?.length) {
            const auroraDb = await this.aurora;
            const strategicDriversQuery =
                'select * from vision_strategic_drivers where vision_id in (:visionIds)';
            const strategicDriverResult: Array<StrategicDriver> = await auroraDb.query(
                strategicDriversQuery,
                {
                    replacements: {
                        visionIds: (visions || []).map((i) => i.id),
                    },
                    type: QueryTypes.SELECT,
                },
            );

            const horizonsQuery =
                'select * from time_horizons where "visionId" in (:visionIds)';
            const horizonsResult: Array<any> = await auroraDb.query(
                horizonsQuery,
                {
                    replacements: {
                        visionIds: (visions || []).map((i) => String(i.id)),
                    },
                    type: QueryTypes.SELECT,
                },
            );
            visions.forEach(v => {
                v.horizons = horizonsResult
                    .filter((i) => i.visionId === String(v.id))
                    .map((i) => ({ ...i, ...{ uuid: i.id } }));
            });

            const aurora = await this.aurora;
            /*
             * Fecthing strategy related with strategic drivers
             * whey need to have parentStrategicDriverId to be related with a current strategic driver
             */
            if (strategicDriverResult.length > 0) {
                const query = `
                    SELECT *
                        FROM strategies
                    WHERE strategies."orgId" = :orgId
                        AND strategies."parentStrategicDriverId" in (:strategicDriversIds)
                    ORDER BY strategies."id" DESC
                `;

                const strategicDriversIds = strategicDriverResult.map((i) => i.id);
                const strategies: Array<StrategyItem> = await aurora.query(
                    query,
                    {
                        replacements: {
                            orgId,
                            strategicDriversIds,
                        },
                        type: QueryTypes.SELECT,
                    },
                );

                visions.forEach(v => {
                    v.strategicDrivers = strategicDriverResult
                        .filter((i) => i.vision_id === v.id)
                        .map((i) => ({ ...i, uuid: i.id.toString() }));

                    v.strategicDrivers.forEach(sd => {
                        sd.strategy = _
                            .chain(strategies)
                            .orderBy(s => s.id)
                            .find(s => s.parentStrategicDriverId === sd.id)
                            .value();
                    });
                });
            }
        }

        return visions;
    }

    async getVision(id: string | number, orgId: string): Promise<VisionItem[]> {
        const aurora = await this.aurora;
        const query = `
            SELECT *
                FROM visions
            WHERE
                visions."id" = :id
                AND visions."orgId" = :orgId
        `;

        const result: Array<VisionItem> = await aurora.query(query, {
            replacements: {
                orgId,
                id
            },
            type: QueryTypes.SELECT,
        });
        const strategicDriversQuery =
            'select * from vision_strategic_drivers where vision_id in (:visionIds)';
        const strategicDriverResult: Array<StrategicDriver> = await aurora.query(
            strategicDriversQuery,
            {
                replacements: {
                    visionIds: result.map(i => i.id),
                },
                type: QueryTypes.SELECT,
            },
        );
        // await Promise.all(strategicDriverResult.map(async (strategicDriver) => {
        //     const relationshipCount = await this.relationshipsDbAurora.getRelationshipCount(strategicDriver.id, 'strategicDriver', orgId);
        //     strategicDriver.relationshipCount = relationshipCount;

        // }));
        result.forEach((vision) => {
            vision.strategicDrivers = (strategicDriverResult || [])
                .filter((i) => i.vision_id === vision.id)
                .map((i) => {
                    return { ...i, ...{ uuid: i.id.toString() } };
                });
        });
        return result;
    }

    async updateVision(
        orgId: string,
        visionObject: VisionItem,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const { id, ...rawObject } = visionObject;
        const model = VisionsModel(sequelize);
        const result = model.update(rawObject, {
            where: {
                orgId,
                id,
            } as any,
        } as any);
        const strategicDriverModel = VisionStrategicDriverModel(sequelize);
        const ids: string[] = [];
        visionObject.strategicDrivers.forEach((i) => {
            i.id = i.uuid || '';
            i.org_id = orgId;
            i.vision_id = Number(visionObject.id);
            ids.push(i.uuid || '');
        });
        const deleteQuery = `
                DELETE FROM vision_strategic_drivers
                WHERE
                vision_strategic_drivers.vision_id = :visionId
                AND vision_strategic_drivers.org_id = :orgId
                ${ids.length > 0 ? 'AND id not in (:ids)' : ''} 
               RETURNING id
            `;
        const deletedIdResults: Array<{ id: string; }> = await sequelize.query(
            deleteQuery,
            {
                replacements: {
                    orgId,
                    visionId: visionObject.id,
                    ids,
                },
                type: QueryTypes.SELECT,
            },
        );
        await Promise.all(
            deletedIdResults.map(async (deletedIdResult) => {
                await this.relationshipsDbAurora.removeRelationships(
                    deletedIdResult.id,
                    'strategicDriver',
                    orgId,
                );
            }),
        );
        await strategicDriverModel.bulkCreate(visionObject.strategicDrivers, {
            fields: [
                'id',
                'colour',
                'description',
                'name',
                'org_id',
                'vision_id',
                'icon_name',
                'oneLineSummary',
            ],
            updateOnDuplicate: [
                'colour',
                'description',
                'name',
                'org_id',
                'vision_id',
                'icon_name',
                'oneLineSummary',
            ],
            logging: console.log,
        });

        /**
         * Time horizons
         */
        const timeHorizonModel = TimeHorizonModel(sequelize);
        (visionObject.horizons || []).forEach((i) => {
            i.id = i.uuid || '';
            i.orgId = orgId;
            i.visionId =
                typeof visionObject.id === 'number'
                    ? `${visionObject.id}`
                    : null;
        });

        await timeHorizonModel.destroy({
            where: {
                visionId: `${visionObject.id}`,
                orgId: orgId,
            } as any,
            logging: console.log,
        } as any);
        await timeHorizonModel.bulkCreate(visionObject.horizons, {
            fields: [
                'id',
                'orgId',
                'contextId',
                'visionId',
                'title',
                'startDate',
                'endDate',
            ],
            updateOnDuplicate: [
                'contextId',
                'title',
                'orgId',
                'visionId',
                'startDate',
                'endDate',
            ],
            logging: console.log,
        });
        return result;
    }

    async saveVision(
        orgId: string,
        rawVision: VisionItem,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const visionData: VisionItem = {
            ...rawVision,
            orgId,
        };
        const model = VisionsModel(sequelize);
        const result = await model.upsert(visionData, {
            conflictFields: ['id'],
        });
        visionData.id = result?.[0]?.dataValues?.id || 0;
        visionData.strategicDrivers.forEach((i) => {
            i.id = i.uuid || '';
            i.org_id = orgId;
            i.vision_id = Number(visionData.id);
            return i;
        });
        const strategicDriverModel = VisionStrategicDriverModel(sequelize);
        await strategicDriverModel.bulkCreate(visionData.strategicDrivers, {
            fields: [
                'id',
                'colour',
                'description',
                'name',
                'org_id',
                'vision_id',
                'icon_name',
                'oneLineSummary',
            ],
            updateOnDuplicate: [
                'colour',
                'description',
                'name',
                'org_id',
                'vision_id',
                'icon_name',
                'oneLineSummary',
            ],
        });

        /**
         * Create time horizons
         */
        (visionData?.horizons || []).forEach((h: TimeHorizon) => {
            h.id = h.uuid || '';
            h.orgId = orgId;
            h.visionId = Number(visionData.id);
            return h;
        });
        const timeHorizonModel = TimeHorizonModel(sequelize);
        await timeHorizonModel.destroy({
            where: {
                visionId: visionData.id,
                orgId: orgId,
            } as any,
        } as any);
        await timeHorizonModel.bulkCreate(visionData.horizons || [], {
            fields: [
                'id',
                'orgId',
                'visionId',
                'startDate',
                'endDate',
                'title',
                'contextId',
                'updatedAt',
                'deletedAt',
                'createdAt',
            ],
            updateOnDuplicate: [
                'contextId',
                'title',
                'orgId',
                'visionId',
                'startDate',
                'endDate',
            ],
        });
        return result;
    }

    async delete(
        id: number,
        orgId: string,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const query = `
            DELETE from visions
                WHERE id = :id
                AND "orgId" = :orgId
        `;
        const result = sequelize.query(query, {
            replacements: {
                orgId,
                id,
            },
            type: QueryTypes.DELETE,
        });
        const deleteQuery = `
            DELETE FROM vision_strategic_drivers
            WHERE
            vision_strategic_drivers.vision_id = :visionId
            AND vision_strategic_drivers.org_id = :orgId
            RETURNING id
        `;
        const deletedIdResults: Array<{ id: string; }> = await sequelize.query(
            deleteQuery,
            {
                replacements: {
                    orgId,
                    visionId: id,
                },
                type: QueryTypes.SELECT,
                logging: console.log,
            },
        );
        await Promise.all(
            deletedIdResults.map(async (deletedIdResult) => {
                await this.relationshipsDbAurora.removeRelationships(
                    deletedIdResult.id,
                    'strategicDriver',
                    orgId,
                );
            }),
        );
        const timeHorizonModel = TimeHorizonModel(sequelize);
        await timeHorizonModel.destroy({
            where: {
                visionId: id,
                orgId: orgId,
            } as any,
        } as any);
        return result;
    }
}
