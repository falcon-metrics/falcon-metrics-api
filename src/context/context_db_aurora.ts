import { Redis } from 'ioredis';
import { Logger } from 'log4js';
import { Op, Sequelize } from 'sequelize';
import { getDeletedAtFilterCondition } from '../datasources/delete/delete_functions';
import ContextModel, { asContextItem } from '../models/ContextModel';
import { ContextWorkItemMapFactory } from '../models/ContextWorkItemMapModel';
import { Cacher, ModelNames } from '../sequelize-cache/cacher';
import { ContextItem, IContext } from './context_interfaces';

export class Context implements IContext {
    private logger: Logger;
    private aurora: Promise<Sequelize>;
    private redisClient: Redis | undefined;
    private cacher: Cacher | undefined;

    constructor(opt: { logger: Logger; aurora: Promise<Sequelize>; redisClient: Redis | undefined; }) {
        this.logger = opt.logger;
        this.aurora = opt.aurora;
        this.redisClient = opt.redisClient;
    }

    async getWorkItemKeysForContextBranch(
        orgId: string,
        rootContextId: string,
    ): Promise<string[]> {
        const contexts = await this.getContextBranch(orgId, rootContextId);

        const contextIds: any = contexts.map((context) => context.id);

        //key = `${context.datasourceId}#${id}`
        const workItemKeys = new Array<string>();

        const aurora = await this.aurora;
        const model = ContextWorkItemMapFactory(aurora, Sequelize);

        const cache = await this.getCacher(orgId);
        const contextWorkItems: any = await cache
            .model(model as any, ModelNames.CONTEXTS, orgId)
            .findAll({
                where: getDeletedAtFilterCondition({
                    orgId,
                    contextId: contextIds,
                }) as any,
            });

        for (const contextWorkItem of contextWorkItems) {
            const key = `${contextWorkItem.datasourceId}#${contextWorkItem.contextId}`;
            workItemKeys.push(key);
        }

        return workItemKeys;
    }

    async get(orgId: string, id: string): Promise<ContextItem> {
        return this.getDbItem(orgId, id);
    }

    private async getDbItem(orgId: string, id: string): Promise<ContextItem> {
        const contextModel = await ContextModel();

        const contextDbItem = await contextModel.findOne({
            where: {
                orgId,
                contextId: id,
            } as any,
        });

        let contextItem: ContextItem = {};

        if (contextDbItem) {
            contextItem = asContextItem(contextDbItem);
        }

        return contextItem;
    }

    async getAllExceptArchived(orgId: string): Promise<Array<ContextItem>> {
        if (!orgId || orgId === '') return [];

        const contextModel = await ContextModel();

        const contextDbItems: any = await contextModel.findAll({
            where: {
                [Op.and]: [
                    { orgId },
                    {
                        [Op.or]: [
                            { archived: false },
                            { archived: null }
                        ]
                    },
                    { obeyaId: null }
                ]
            } as any,
        });

        const contextItems: Array<ContextItem> = [];

        for (const contextDbItem of contextDbItems) {
            const contextItem = asContextItem(contextDbItem);
            contextItems.push(contextItem);
        }

        return contextItems;
    }

    async getContextBranch(
        orgId: string,
        id: string,
    ): Promise<Array<ContextItem>> {
        if (id === '') throw new Error('context id cannot be empty');

        const branchStart = await this.getDbItem(orgId, id);

        // Let's not blab everything if by some fluke there branchStart is some sort of an orphan
        if (!branchStart.positionInHierarchy)
            return [asContextItem(branchStart)];

        const contextModel = await ContextModel();

        const contextDbItems = await contextModel.findAll({
            where: {
                [Op.or]: [
                    {
                        positionInHierarchy: {
                            [Op.startsWith]: `${branchStart.positionInHierarchy}.`,
                        },
                    },
                    {
                        positionInHierarchy: branchStart.positionInHierarchy,
                    },
                ],
            } as any,
        });

        const contextItems: Array<ContextItem> = [branchStart];

        for (const contextDbItem of contextDbItems) {
            const contextItem = asContextItem(contextDbItem);
            contextItems.push(contextItem);
        }

        return contextItems;
    }

    async getCacher(orgId: string) {
        if (!this.cacher) {
            const [aurora, redisClient] = await Promise.all([
                this.aurora,
                this.redisClient
            ]);

            this.cacher = new Cacher(aurora, redisClient);
        }

        return this.cacher.ttl(300).orgId(orgId);
    }
}
