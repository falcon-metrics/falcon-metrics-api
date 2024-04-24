import { Logger } from 'log4js';
import { Sequelize } from 'sequelize';
import { IQueryFilters } from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import { UpdatesDbAurora } from './updates_db_aurora';
import { UpdateItem, UpdateItemWithSilentOption, UpdatesAggregatedByTime } from './interfaces';
import { DateTime } from 'luxon';

export class Calculations {
    readonly orgId?: string;
    readonly logger: Logger;
    readonly filters?: IQueryFilters;
    readonly updatesDbAurora: UpdatesDbAurora;
    readonly auroraWriter: Promise<Sequelize>;

    constructor(opts: {
        auroraWriter: Promise<Sequelize>;
        security: SecurityContext;
        logger: Logger;
        filters?: IQueryFilters;
        updatesDbAurora: UpdatesDbAurora;
    }) {
        this.auroraWriter = opts.auroraWriter;
        this.orgId = opts.security.organisation!;
        this.logger = opts.logger;
        this.filters = opts.filters;
        this.updatesDbAurora = opts.updatesDbAurora;
    }

    async getUpdates(
        initiativeId: string,
        updateType?: string,
    ): Promise<UpdatesAggregatedByTime> {
        const rawUpdates: Array<UpdateItem> = await this.updatesDbAurora.getAll(
            this.orgId!,
            initiativeId,
            updateType,
        );

        const updates: UpdatesAggregatedByTime = rawUpdates.reduce(
            (acc: any, updateItem: UpdateItem) => {
                const today = DateTime.utc();

                const weekNumber = today.weekNumber;

                const updateInfoWeek = DateTime.fromJSDate(
                    new Date(updateItem?.updatedAt),
                )?.weekNumber;

                const isCurrentWeek = updateItem?.updatedAt
                    ? updateInfoWeek === weekNumber
                    : false;

                const lastWeek = weekNumber - 1;

                const isLastWeek = updateItem?.updatedAt
                    ? updateInfoWeek === lastWeek
                    : false;

                const previous = updateItem?.updatedAt
                    ? updateInfoWeek < lastWeek
                    : false;

                if (isCurrentWeek) {
                    acc.thisWeek.push(updateItem);
                    return acc;
                }

                if (isLastWeek) {
                    acc.lastWeek.push(updateItem);
                    return acc;
                }

                if (previous) {
                    acc.previous.push(updateItem);
                    return acc;
                }
                return acc;
            },
            {
                thisWeek: [],
                lastWeek: [],
                previous: [],
            },
        );
        return updates;
    }

    async getReplies(id: string, initiativeId: string): Promise<UpdateItem[]> {
        return await this.updatesDbAurora.getWithReplies(
            this.orgId!,
            id,
            initiativeId,
        );
    }

    async saveUpdateItem(updateObject: UpdateItem): Promise<UpdateItem> {
        const aurora: Sequelize = await this.auroraWriter;
        try {
            const result = await this.updatesDbAurora.save(
                this.orgId!,
                updateObject,
                aurora,
            );
            return result as UpdateItem;
        } catch (error) {
            console.log('Error in saveUpdateItem: ', error);
            throw error;
        }
    }

    async patchUpdateItem(updateObject: UpdateItemWithSilentOption): Promise<UpdateItem> {
        const aurora: Sequelize = await this.auroraWriter;
        try {
            const [result] = await this.updatesDbAurora.patch(
                this.orgId!,
                updateObject,
                aurora,
            ) as any;
            return result.dataValues as UpdateItem;
        } catch (error) {
            console.error('error in patchUpdateItem: ', error);
            throw error;
        }
    }

    async deleteUpdateItem(updateId: string): Promise<void> {
        const aurora = await this.auroraWriter;
        try {
            await this.updatesDbAurora.delete(
                updateId,
                this.orgId!,
                aurora,
            );

        } catch (error) {
            console.log('error calculations deleteUpdate ==>', error);
            throw error;
        }
    }
}
