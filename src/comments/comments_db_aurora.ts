import { Sequelize } from 'sequelize';
import { Comments } from '../models/CommentsModel';
import { Op, QueryTypes } from 'sequelize';
import { RawComment } from './interfaces';
import { Interval } from 'luxon';

export class CommentsDbAurora {
    private aurora: Promise<Sequelize>;

    constructor(opt: { aurora: Promise<Sequelize>; }) {
        this.aurora = opt.aurora;
    }

    datePredicates(dateRange: Interval, sequelize: any) {
        const from = dateRange.start.toISO();
        const to = dateRange.end.toISO();
        return {
            [Op.gte]: sequelize.fn('DATE', from),
            [Op.lte]: sequelize.fn('DATE', to),
        };
    }

    async getCommentWithReplies(
        orgId: string,
        id: string,
    ): Promise<RawComment[]> {
        const aurora = await this.aurora;
        const query = `
            WITH replies_temp AS (
                SELECT
                    "parentId",
                    json_agg(row_to_json(replies)) as replies
                FROM
                    "comments" AS replies
                GROUP BY
                    "parentId"
            )
            SELECT *
                FROM "comments" c
                LEFT JOIN replies_temp ON c.id = replies_temp."parentId"
            WHERE
                c."parentId" IS NULL
                AND c."orgId" = :orgId
                AND c."id" = :id
        `;

        const result: Array<RawComment> = await aurora.query(query, {
            replacements: {
                orgId,
                id,
            },
            type: QueryTypes.SELECT,
        });
        return result;
    }

    async getComment(
        id: number,
        orgId: string,
        contextId: string,
        dateRange: Interval,
    ): Promise<RawComment[]> {
        const aurora = await this.aurora;

        const query = `
            SELECT *
                FROM "comments" c
            WHERE
                c."id" = :id
                AND c."context_id" = :contextId
                AND c."orgId" = :orgId
                AND c."effective_date" >= :startDate
                AND c."effective_date" <= :endDate
        `;
        const comment: Array<RawComment> = await aurora.query(query, {
            replacements: {
                id,
                orgId,
                contextId,
                startDate: dateRange.start.toISO(),
                endDate: dateRange.end.toISO(),
            },
            type: QueryTypes.SELECT,
        });
        return comment.map((c: RawComment) => c);
    }

    async getAllComments(
        orgId: string,
        contextId: string,
        dateRange: Interval,
    ): Promise<RawComment[]> {
        const aurora = await this.aurora;
        const query = `
            WITH replies_temp AS (
                SELECT
                    "parentId",
                    json_agg(row_to_json(replies)) as replies,
                    count('replies')
                FROM
                    "comments" AS replies
                GROUP BY
                    "parentId"
            ) SELECT
                c."id",
                c."username", 
                c."context_id", 
                c."comment", 
                c."title", 
                c."effective_date",
                c."user_id",
                c."elementFields",
                c."parentId",
                "replies_temp"."count" as "replies_count"
                FROM "comments" c
                LEFT JOIN replies_temp ON c.id = replies_temp."parentId"
            WHERE
                c."parentId" IS NULL
                AND c."context_id" = :contextId
                AND c."orgId" = :orgId
                AND c."effective_date" >= :startDate
                AND c."effective_date" <= :endDate
        `;

        const comments: RawComment[] = await aurora.query(query, {
            replacements: {
                orgId,
                contextId,
                startDate: dateRange.start.toISO(),
                endDate: dateRange.end.toISO(),
            },
            type: QueryTypes.SELECT,
        });
        return comments.map((c: RawComment) => c);
    }

    async updateComment(
        orgId: string,
        commentObject: RawComment,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const { id, ...rawObject } = commentObject;
        const model = Comments(sequelize);
        return model.update(rawObject, {
            where: {
                orgId,
                user_id: commentObject.user_id,
                id,
            } as any,
        } as any);
    }

    async saveComment(
        orgId: string,
        rawEvent: RawComment,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const commentData: RawComment = {
            orgId,
            ...rawEvent,
        };
        const model = Comments(sequelize);
        return await model.upsert(commentData, {
            conflictFields: ['id'],
        });
    }

    async delete(
        id: number,
        orgId: string,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const query = `
            DELETE from comments
                WHERE id = :id
                OR "parentId" = :id
                AND "orgId" = :orgId
        `;
        return sequelize.query(query, {
            replacements: {
                orgId,
                id,
            },
            type: QueryTypes.DELETE,
        });
    }
}
