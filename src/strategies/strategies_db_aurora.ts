import { Sequelize } from 'sequelize';
import { Strategies as StrategyModel } from '../models/Strategies';
import { Op, QueryTypes } from 'sequelize';
import { StrategyItem } from './interfaces';
import { Interval } from 'luxon';

export class StrategyDbAurora {
    private aurora: Promise<Sequelize>;

    constructor(opt: { aurora: Promise<Sequelize>; }) {
        this.aurora = opt.aurora;
    }

    datePredicates(dateRange: Interval, sequelize: Sequelize) {
        const from = dateRange.start.toISO();
        const to = dateRange.end.toISO();
        return {
            [Op.gte]: sequelize.fn('DATE', from),
            [Op.lte]: sequelize.fn('DATE', to),
        };
    }

    async getAllStrategies(
        orgId: string,
        contextId?: string,
        horizonId?: string,
        parentStrategicDriverId?: string,
    ): Promise<StrategyItem[]> {
        const aurora = await this.aurora;
        let replacements: {
            orgId: string;
            contextId?: string;
            horizonId?: string;
        } = {
            orgId,
        };
        let query = `
            SELECT *
                FROM strategies
            WHERE strategies."orgId" = :orgId AND strategies."parentStrategicDriverId" IS NULL
            
        `;
        if (contextId && !horizonId) {
            query = `
                SELECT *
                    FROM strategies
                WHERE strategies."orgId" = :orgId
                AND strategies."contextId" = :contextId
                AND strategies."parentStrategicDriverId" IS NULL
                AND strategies."horizonId" IS NULL
            `;
            replacements = {
                orgId,
                contextId,
            };
        }
        if (horizonId && !contextId) {
            query = `
                SELECT *
                    FROM strategies
                WHERE strategies."orgId" = :orgId
                AND strategies."horizonId" = :horizonId
                AND strategies."parentStrategicDriverId" IS NULL
            `;
            replacements = {
                orgId,
                contextId,
                horizonId,
            };
        }
        if (horizonId && contextId) {
            query = `
                SELECT *
                    FROM strategies
                WHERE strategies."orgId" = :orgId
                and strategies."contextId" = :contextId AND strategies."parentStrategicDriverId" IS NULL
                AND strategies."horizonId" = :horizonId
            `;
            replacements = {
                orgId,
                contextId,
                horizonId,
            };
        }
        const result: Array<StrategyItem> = await aurora.query(query, {
            replacements,
            type: QueryTypes.SELECT,
            logging: console.log,
        });
        return result;
    }

    async getStrategyFromStrategicDriver(
        parentStrategicDriverId: string,
        orgId: string,
    ): Promise<StrategyItem[]> {
        const aurora = await this.aurora;

        const query = `
            SELECT *
                FROM strategies
            WHERE strategies."orgId" = :orgId
                AND strategies."parentStrategicDriverId" = :parentStrategicDriverId
            ORDER BY strategies."updatedAt" DESC limit 1
        `;

        const result: Array<StrategyItem> = await aurora.query(query, {
            replacements: {
                orgId,
                parentStrategicDriverId,
            },
            type: QueryTypes.SELECT,
        });
        return result;
    }

    async getStrategy(
        id: string | number,
        orgId: string,
    ): Promise<StrategyItem[]> {
        const aurora = await this.aurora;
        const query = `
            SELECT *
                FROM strategies
            WHERE
            strategies."id" = :id
                AND strategies."orgId" = :orgId
        `;

        const result: Array<StrategyItem> = await aurora.query(query, {
            replacements: {
                orgId,
                id,
                // startDate: dateRange.start.toISO(),
                // endDate: dateRange.end.toISO(),
            },
            type: QueryTypes.SELECT,
        });
        return result;
    }

    async updateStrategy(
        orgId: string,
        strategyObject: StrategyItem,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const { id, ...rawObject } = strategyObject;
        rawObject.orgId = orgId;
        const model = StrategyModel(sequelize);
        return model.update(rawObject, {
            where: {
                orgId,
                id,
            } as any,
        } as any);
    }

    async saveStrategy(
        orgId: string,
        rawStrategy: StrategyItem,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const strategyData: StrategyItem = {
            ...rawStrategy,
            orgId,
        };
        const model = StrategyModel(sequelize);
        return await model.upsert(strategyData, {
            conflictFields: ['id'],
        });
    }

    async deleteStrategy(
        id: number,
        orgId: string,
        sequelize: Sequelize,
    ): Promise<unknown> {
        const query = `
            DELETE from strategies
                WHERE id = :id
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
