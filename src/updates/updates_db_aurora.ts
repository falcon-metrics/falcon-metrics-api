import { Sequelize, QueryTypes, Op } from 'sequelize';

import { Updates } from '../models/Updates';
import { UpdateItem, UpdateItemWithSilentOption } from './interfaces';

export class UpdatesDbAurora {
    private aurora: Promise<Sequelize>;

    constructor(opt: { aurora: Promise<Sequelize>; }) {
        this.aurora = opt.aurora;
    }

    async getAll(
        orgId: string,
        initiativeId: string,
        updateType?: string,
    ): Promise<UpdateItem[]> {
        const updateTypes = updateType && updateType !== 'all'
            ? [updateType]
            : [
                'general',
                'initiative',
                'objective',
                'key result',
                'risk',
                'dependency',
            ];

        const aurora = await this.aurora;
        const query = `
            WITH updates_temp AS (
                SELECT
                    "parentId",
                    json_agg(row_to_json(replies)) as replies,
                    count('replies')
                FROM
                    "temp_updates" AS replies
                GROUP BY
                    "parentId"
            ) SELECT
                u."id",
                u."orgId", 
                u."initiativeId", 
                u."userId", 
                u."username", 
                u."name", 
                u."feedType",
                u."updateType",
                u."updatedAt",
                u."feedImages",
                u."updateMetadata",
                u."updateText",
                u."updateNotes",
                u."reactions",
                "updates_temp"."count" as "replies_count"
                FROM "temp_updates" u
                LEFT JOIN updates_temp ON u.id = updates_temp."parentId"
            WHERE
                u."parentId" IS NULL
                AND u."orgId" = :orgId
                AND u."initiativeId" = :initiativeId
                AND u."updateType" in (${updateTypes.map(
            (type) => "'" + type + "'",
        )})
        `;

        const updateItems: UpdateItem[] = await aurora.query(query, {
            replacements: {
                orgId,
                initiativeId,
                updateTypes: updateType,
            },
            type: QueryTypes.SELECT,
        });
        return updateItems;
    }

    async getWithReplies(
        orgId: string,
        updateId: string,
        initiativeId: string,
    ): Promise<UpdateItem[]> {
        const aurora = await this.aurora;
        const query = `
            WITH replies_temp AS (
                SELECT
                    "parentId",
                    json_agg(row_to_json(replies)) as replies
                FROM
                    "temp_updates" AS replies
                GROUP BY
                    "parentId"
            )
            SELECT *
                FROM "temp_updates" u
                LEFT JOIN replies_temp ON u.id = replies_temp."parentId"
            WHERE
                u."parentId" IS NULL
                AND u."orgId" = :orgId
                AND u."id" = :updateId
                AND u."initiativeId" = :initiativeId
        `;

        const result: Array<UpdateItem> = await aurora.query(query, {
            replacements: {
                orgId,
                updateId,
                initiativeId,
            },
            type: QueryTypes.SELECT,
        });
        return result;
    }

    async save(
        orgId: string,
        updateItem: UpdateItem,
        sequelize: Sequelize,
    ): Promise<unknown> {

        const updateItemData: UpdateItem = {
            ...updateItem,
            orgId,
        };
        const model = Updates(sequelize);
        return model.create(updateItemData);
    }

    async patch(
        orgId: string,
        updateItem: UpdateItemWithSilentOption,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const updateItemData: UpdateItemWithSilentOption = {
            ...updateItem,
            orgId,
        };
        const { id, silent, ...rawObject } = updateItemData;
        const model = Updates(sequelize);
        return await model.update(rawObject, {
            where: {
                orgId,
                userId: updateItem.userId,
                id,
            } as any,
            silent: silent || false
        } as any);
    }

    async delete(
        id: string,
        orgId: string,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const model = Updates(sequelize);
        return model.destroy({
            where: {
                orgId,
                [Op.or]: [
                    { id },
                    { parentId: id },
                ],
            } as any,
            logging: console.log
        } as any);
    }
}
