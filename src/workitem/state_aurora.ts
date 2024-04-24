import { Logger } from 'log4js';
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { DateTime, Interval } from 'luxon';
import { Op, QueryTypes, Sequelize, Transaction, WhereOptions } from 'sequelize';

import { IQueryFilters, PredefinedFilterTags } from '../common/filters_v2';
import { CustomFieldsService } from '../data_v2/custom_fields_service';
import { getDeletedAtFilterCondition } from '../datasources/delete/delete_functions';
import { FQLService } from '../fql/fql_service';
import {
    ContextWorkItemMapFactory,
    ContextWorkItemMapModelType,
} from '../models/ContextWorkItemMapModel';
import { FQLFilterFactory, FQLFilterModel } from '../models/FilterModel';
import { StateModel } from '../models/StateModel';
import { Normalization } from '../normalization/Normalization';
import { DeliveryRate } from '../obeya/predictive_analysis/types/types';
import {
    CommitmentRate,
    DemandVsCapacityItem,
    ExtendedStateItem,
    ObeyaContextItem,
    StaledDefaultItem,
    StateItem,
    TimeToCommit,
    WorkItemStatesItem,
    StateNumberRecord,
    RetrievalScenario,
} from './interfaces';
import {
    getInventoryAgeInWholeDaysFunc,
    getLeadTimeInWholeDaysFunc,
    getWIPAgeInWholeDaysFunc,
} from './utils';
import { IWorkItemQueries, WorkItemQueries } from './workitem_queries';
import ContextModel, { ContextAttributes } from '../models/ContextModel';
import { Redis } from 'ioredis';
import { Cacher, ModelNames } from '../sequelize-cache/cacher';

export enum StateCategory {
    PRECEDING,
    PROPOSED,
    INPROGRESS,
    COMPLETED,
    REMOVED,
}

export enum StateType {
    ACTIVE,
    QUEUE,
}

export enum RelatedTypes {
    BLOCKS = 'blocks',
    BLOCKED_BY = 'is blocked by',

    CONTRIBUTED_BY = 'contributed by',
    CONTRIBUTED_TO = 'contributed to'
}

export interface IState {
    getObeyaWorkItems(params: {
        orgId: string;
        workItemIds: string;
        includeChildren: boolean;
        includeRelated: boolean;
        includeChildrenOfRelated: boolean;
        relationType?: RelatedTypes;
        hierarchyLevel?: number;
        excludeWorkItemIds?: string;
        linkTypes?: string[];
    }): Promise<StateItem[]>;

    getNormalisedWorkItems(
        orgId: string,
        stateCategory: StateCategory,
        filters?: IQueryFilters,
        fqlFilterTag?: string,
        fqlParsedQuery?: string,
        excludeColumns?: string[],
        disableDiscarded?: boolean,
    ): Promise<Array<StateItem>>;

    getNormalisedExtendedWorkItems(
        orgId: string,
        stateCategories: StateCategory[],
        filters?: IQueryFilters,
        fqlFilterTag?: string,
        fqlParsedQuery?: string,
        columnNames?: string[],
        ignoreDiscardedItems?: boolean,
    ): Promise<ExtendedStateItem[]>;

    getNormalisedExtendedWorkItemsWithScenarios(
        orgId: string,
        scenarios: RetrievalScenario[],
        uiFilters?: IQueryFilters,
        fqlFilterTag?: string,
        fqlParsedQuery?: string,
        forceDelayed?: boolean,
        ignoreDiscardedItems?: boolean,
        columnNames?: string[],
    ): Promise<ExtendedStateItem[]>;

    getWorkItems(
        orgId: string,
        stateCategory?: StateCategory,
        filters?: IQueryFilters,
        fqlFilter?: FQLFilterModel,
        columnNames?: string[],
        isDelayed?: boolean,
        disabledDelayed?: boolean,
        disabledDiscarded?: boolean,
    ): Promise<Array<StateItem>>;

    getExtendedWorkItems(
        orgId: string,
        stateCategories: StateCategory[],
        uiFilters?: IQueryFilters,
        fqlFilter?: FQLFilterModel | string,
        columnNames?: string[],
        ignoreDiscardedItems?: boolean,
        useSnapshotsData?: boolean,
    ): Promise<ExtendedStateItem[]>;

    getExtendedWorkItemDetails(
        orgId: string,
        workItemId: string,
        uiFilters?: IQueryFilters
    ): Promise<ExtendedStateItem[]>;

    getExtendedWorkItemsWithScenarios(
        orgId: string,
        scenarios: RetrievalScenario[],
        uiFilters?: IQueryFilters,
        fqlFilter?: FQLFilterModel | string,
        columnNames?: string[],
        isDelayed?: boolean,
        ignoreDiscardedItems?: boolean,
        useSnapshotsData?: boolean,
        includeArrivalPoint?: boolean,
        workItemIdListToFilter?: string[],
    ): Promise<ExtendedStateItem[]>;

    getWorkItemsToObeya(params: {
        orgId: string,
        fqlFilter?: string,
        columnNames?: string[],
        sprintIds?: string[],
    }): Promise<Array<StateItem>>;

    getContextsItemMapByWorkItemId(
        orgId: string,
        workItemIds: string[],
        contextIds: string[],
    ): Promise<Array<any>>;

    getObeyaContexts(orgId: string): Promise<Array<ObeyaContextItem>>;

    getWorkItemIdsFromContext(
        orgId: string,
        contextId: string | undefined,
        filters?: IQueryFilters,
        sqlOnly?: boolean,
    ): Promise<string[]>;

    countWorkItemStateFromParentId(
        orgId: string,
        parentId: string | undefined,
    ): Promise<WorkItemStatesItem>;

    countWorkItemsByStateCategory(
        workItems: StateItem[],
        workItemStatus: WorkItemStatesItem,
    ): WorkItemStatesItem;

    getWorkItemsStateFromParentId(
        orgId: string,
        parentId: string | undefined,
    ): Promise<StateItem[]>;

    getCompletedItemsEachDayInContexts(
        orgId: string,
        contextId: string[],
        dateRange: Interval,
    ): Promise<Array<DeliveryRate>>;

    getArrivalsByState(
        orgId: string,
        dateRange: Interval,
        timezone: string,
        workItemIdList: string[] | undefined,
        workItemTypeList?: string[],
    ): Promise<StateNumberRecord>;

    getDeparturesByState(
        orgId: string,
        dateRange: Interval,
        timzone: string,
        workItemIdList: string[] | undefined,
        workItemTypeList?: string[],
    ): Promise<StateNumberRecord>;

    getAverageCycleTime(
        orgId: string,
        period: Interval,
        timezone: string,
        workItemIdList: string[],
        workItemTypeList?: string[],
    ): Promise<StateNumberRecord>;

    getCommitmentRate(
        orgId: string,
        uiFilters?: IQueryFilters,
        filterTags?: PredefinedFilterTags | string,
        parsedQuery?: string,
    ): Promise<Array<CommitmentRate>>;

    getObeyaWorkflowsByBoards(
        orgId: string,
        parsedQuery?: string,
    ): Promise<Array<any>>;

    getTimeToCommit(
        orgId: string,
        uiFilters?: IQueryFilters,
        filterTags?: PredefinedFilterTags | string,
        parsedQuery?: string,
    ): Promise<Array<TimeToCommit>>;

    getDemandVsCapacity(
        orgId: string,
        from: DateTime,
        to: DateTime,
        uiFilters?: IQueryFilters,
        filterTags?: PredefinedFilterTags | string,
        parsedQuery?: string,
    ): Promise<Array<DemandVsCapacityItem>>;

    getStaleWorkItems(
        orgId: string,
        uiFilters?: IQueryFilters,
        filterTags?: PredefinedFilterTags | string,
        parsedQuery?: string,
    ): Promise<Array<any>>;

    getStaleWorkItemsForDeliveryGovernance(
        orgId: string,
        uiFilters?: IQueryFilters,
        staledItemNumberOfDays?: number,
    ): Promise<StaledDefaultItem[]>;

    getFQLFilters(orgId: string, tags: string): Promise<Array<FQLFilterModel>>;

    getFQLFilter(orgId: string, filterId: string): Promise<FQLFilterModel>;

    testFqlQuery(
        orgId: string,
        datasourceId: string,
        fqlService: FQLService,
        fql: string,
    ): Promise<boolean>;

    getWorkItemIdsUsingPredicates(
        orgId: string,
        filters: IQueryFilters,
        ignoreDiscardedItems?: boolean
    ): Promise<string[]>;

    /**
     * Get all the link types in the given org
     * 
     * Each row of linkedItems column on the states table contains
     * and array of objects. This method uses `jsonb_to_recordset` 
     * to "expand" the array of objects to rows
     */
    getLinkTypes(orgId: string): Promise<string[]>;

    /**
     * Get distinct rows of the given column.
     * NULL rows are excluded
     */
    getDistinctRows(orgId: string, column: string): Promise<string[]>;

    /**
     * This function accepts the list of workItemIds that are applicable for the obeya currently and fills the context map with those values by inserting and/or deleting the values currently in the map for that obeya's context.
     */
    syncContextWorkItemMapForObeya(contextId: string, obeyaWorkItemsQueryString: string[], orgId: string, datasourceId: string): Promise<string>;

    /**
     * This function receives a list of work items and returns only the items that are discarded items (from the states table) according to the definition of discarded of the org id (from the filters table)
     */
    getDiscardedFromList(orgId: string, workItemIdList: string[]): Promise<string[]>;
}

export class State implements IState {
    private aurora: Promise<Sequelize>;
    private logger: Logger;
    private customFieldsService: CustomFieldsService;
    private normalizationService: Normalization;
    private workItemQueries: IWorkItemQueries;
    private cache: Map<string, any> = new Map();
    private auroraWriter: any;
    private redisClient: Redis | undefined;
    private cacher: Cacher | undefined;

    constructor(opts: {
        aurora: Promise<Sequelize>;
        logger: Logger;
        customFieldsService: CustomFieldsService;
        normalizationService: Normalization;
        workItemQueries: IWorkItemQueries;
        auroraWriter: any;
        redisClient: Redis | undefined;
    }) {
        this.aurora = opts.aurora;
        this.logger = opts.logger;
        this.customFieldsService = opts.customFieldsService;
        this.normalizationService = opts.normalizationService;
        this.workItemQueries = opts.workItemQueries;
        this.auroraWriter = opts.auroraWriter;
        this.redisClient = opts.redisClient;
    }

    getLeadTimeInWholeDays = getLeadTimeInWholeDaysFunc;

    getWIPAgeInWholeDays = getWIPAgeInWholeDaysFunc;

    getInventoryAgeInWholeDays = getInventoryAgeInWholeDaysFunc;

    async getWorkItemIdsFromContext(
        orgId: string,
        contextId: string | undefined,
        filters?: IQueryFilters,
        sqlOnly?: boolean,
    ): Promise<string[]> {

        const aurora = await this.aurora;

        //if this is a parent top level context, we may have to retrieve
        //all child contexts and aggregate this items
        const contextIds = await this.getContextIds(orgId, contextId);
        const contextWorkItemMapModel: any = ContextWorkItemMapFactory(
            aurora,
            Sequelize,
        );

        const customFieldSubQueries: Array<{}> = await this.customFieldsService.generateSubQueryFilters(
            orgId,
            contextWorkItemMapModel,
            filters?.customFields,
        );

        const normalizationQueries = await this.normalizationService.generateFilterQueries(
            filters?.normalization,
        );

        const where: WhereOptions<ContextWorkItemMapModelType> = {
            contextId: contextIds,
            [Op.and]: [...customFieldSubQueries, normalizationQueries],
        } as any;

        if (sqlOnly) {
            const sql = contextWorkItemMapModel.queryInterface.queryGenerator
                .selectQuery('contextWorkItemMaps', {
                    attributes: ['workItemId'],
                    where,
                })
                .slice(0, -1); // removes trailing ';'

            return [sql];
        }

        const cacher = await this.getCacher(orgId);
        const contextWorkItemMaps = await cacher
            .model(contextWorkItemMapModel, ModelNames.CWIMS, orgId)
            .findAll({
                attributes: ['workItemId'],
                where: getDeletedAtFilterCondition(where) as any,
            });

        const workItemIds: string[] = contextWorkItemMaps.map(
            (workItemMap: any) => workItemMap.workItemId,
        );

        return workItemIds;
    }

    //if this is a parent top level context, we may have to retrieve
    //all child contexts and aggregate this items
    //gets all of the child (and this) context id's
    async getContextIds(
        orgId: string,
        contextId?: string,
    ): Promise<string[]> {
        const cacheKey = `getContextIds#${orgId}#${contextId}`;
        let contextIdsForOrg: ContextAttributes[];


        if (this.cache.has(cacheKey)) {
            contextIdsForOrg = await this.cache.get(cacheKey);
        } else {
            const fn = async () => {
                const aurora = await this.aurora;
                const cacher = await this.getCacher(orgId);
                const contextModel = await ContextModel(aurora);

                return cacher.model(contextModel as any, ModelNames.CONTEXTS, orgId).findAll({
                    where: {
                        orgId,
                        archived: false
                    } as any
                });
            };
            const promise = fn();
            this.cache.set(cacheKey, promise);
            contextIdsForOrg = await promise;
        }


        if (!contextId) {
            return contextIdsForOrg.map((context) => context.contextId);
        }

        const thisContext = contextIdsForOrg.find(
            (context) => context.contextId === contextId,
        );

        // If the specified context id does not exist on the database it has been deleted and is unavailable
        if (!thisContext) {
            return [];
        }

        // If this contextId is a leaf with context then it is the target (and it also has no children)
        if (thisContext && thisContext.contextAddress) {
            // The contextAddress attribute only exists when the context is the last of the hierarchy
            return [thisContext.contextId];
        }

        let childrenContextIds: string[] = [];

        // If context address is empty, find the childs of the hierarcy
        if (thisContext && !thisContext.contextAddress) {
            // Append the dot to exclude this parent item from the find below
            let positionHierarchyPrefix = thisContext.positionInHierarchy + '.';
            // Handle the top level "All" context as a special case
            // Set the prefix to be blank so that startsWith filter matches all contexts
            if (thisContext.positionInHierarchy === '0') {
                positionHierarchyPrefix = '';
            }

            const isTopLevelAll = (thisContext.name === 'All' && thisContext.positionInHierarchy === '0');
            const children = contextIdsForOrg.filter(
                (context: any) =>
                    context.positionInHierarchy?.startsWith(
                        positionHierarchyPrefix,
                    ) &&
                    // All context is a special case. If the selected context is a Top Level all context, 
                    // dont check the datasourceId, get children from all datasources
                    (isTopLevelAll || context.datasourceId === thisContext.datasourceId),
            );

            if (children) {
                childrenContextIds = children.map(
                    (context: any) => context.contextId,
                );
            }
        }

        // Make sure we also include the selected context id
        if (!childrenContextIds.includes(contextId)) {
            childrenContextIds.push(contextId);
        }

        return childrenContextIds;
    }

    //
    //this is the new getNormalisedWorkItems
    //
    async getNormalisedWorkItems(
        orgId: string,
        stateCategory: StateCategory,
        uiFilters?: IQueryFilters,
        fqlFilterTag?: string,
        fqlParsedQuery?: string,
        excludeColumns?: string[],
        disableDiscarded?: boolean,
    ): Promise<StateItem[]> {
        let allNormalisedWorkItems: StateItem[] = [];

        if (fqlFilterTag) {
            const fqlFilters = await this.getFQLFilters(orgId, fqlFilterTag);
            const filteredWorkItemResults = await Promise.all(
                fqlFilters.map(async (fqlFilter) => {
                    return this.getWorkItems(
                        orgId,
                        stateCategory,
                        uiFilters,
                        fqlFilter,
                        undefined,
                        undefined,
                        undefined,
                        disableDiscarded,
                    );
                }),
            );

            allNormalisedWorkItems = filteredWorkItemResults.reduce(
                (a, v) => a.concat(v),
                [],
            );
        } else if (fqlParsedQuery) {
            allNormalisedWorkItems = await this.getWorkItems(
                orgId,
                stateCategory,
                uiFilters,
                fqlParsedQuery,
                undefined,
                //excludeColumns,
            );
        }

        return allNormalisedWorkItems;
    }

    // Counterpart to old getNormalisedWorkItems for retrieving Extended State Items
    async getNormalisedExtendedWorkItems(
        orgId: string,
        stateCategories: StateCategory[],
        uiFilters?: IQueryFilters,
        fqlFilterTag?: string,
        fqlParsedQuery?: string,
        columnNames?: string[],
        ignoreDiscardedItems?: boolean,
    ): Promise<ExtendedStateItem[]> {
        let allNormalisedWorkItems: ExtendedStateItem[] = [];

        if (fqlFilterTag) {
            const fqlFilters = await this.getFQLFilters(orgId, fqlFilterTag);

            const filteredWorkItemResults = await Promise.all(
                fqlFilters.map(async (fqlFilter) => {
                    return this.getExtendedWorkItems(
                        orgId,
                        stateCategories,
                        uiFilters,
                        fqlFilter,
                        columnNames,
                        ignoreDiscardedItems
                    );
                }),
            );

            allNormalisedWorkItems = filteredWorkItemResults.reduce(
                (a, v) => a.concat(v),
                [],
            );
        } else if (fqlParsedQuery) {
            allNormalisedWorkItems = await this.getExtendedWorkItems(
                orgId,
                stateCategories,
                uiFilters,
                fqlParsedQuery,
                columnNames,
                ignoreDiscardedItems
            );
        }

        return allNormalisedWorkItems;
    }

    async getNormalisedExtendedWorkItemsWithScenarios(
        orgId: string,
        scenarios: RetrievalScenario[],
        uiFilters?: IQueryFilters,
        fqlFilterTag?: string,
        fqlParsedQuery?: string,
        forceDelayed?: boolean,
        ignoreDiscardedItems?: boolean,
        columnNames?: string[],
    ): Promise<ExtendedStateItem[]> {
        let allNormalisedWorkItems: ExtendedStateItem[] = [];
        if (fqlFilterTag) {
            let fqlFilters = await this.getFQLFilters(orgId, fqlFilterTag);
            const filteredWorkItemResults = await Promise.all(
                fqlFilters.map(async (fqlFilter) => {
                    return this.getExtendedWorkItemsWithScenarios(
                        orgId,
                        scenarios,
                        uiFilters,
                        fqlFilter,
                        columnNames,
                        forceDelayed,
                        ignoreDiscardedItems
                    );
                }),
            );

            allNormalisedWorkItems = filteredWorkItemResults.reduce(
                (a, v) => a.concat(v),
                [],
            );
        } else if (fqlParsedQuery) {
            allNormalisedWorkItems = await this.getExtendedWorkItemsWithScenarios(
                orgId,
                scenarios,
                uiFilters,
                fqlParsedQuery,
                columnNames,
                forceDelayed,
                ignoreDiscardedItems
            );
        }

        return allNormalisedWorkItems;
    }

    filterByContext(
        stateCategory: StateCategory | undefined,
        workItems: Array<StateItem>,
        workItemIdsFromContext: string[],
        excludeWeekends: boolean,
        contextId?: string,
    ) {
        let totalItems = 0;
        let skipped = 0;

        const contextFilteredWorkItems: StateItem[] = [];

        workItems.forEach((item: StateItem) => {
            totalItems += 1;
            if (
                contextId &&
                !workItemIdsFromContext.includes(item.workItemId!)
            ) {
                skipped += 1;
                //this is the context filter
                return;
            }
            const params = {
                arrivalDateTime: item.arrivalDateTime,
                commitmentDateTime: item.commitmentDateTime,
                departureDateTime: item.departureDateTime,
                excludeWeekends
            };
            //TODO find a better place for this, we don't always need it
            switch (stateCategory) {
                case StateCategory.COMPLETED:
                    (item as any).excludeWeekends = true;
                    item.leadTimeInWholeDays = this.getLeadTimeInWholeDays(params);
                    break;
                case StateCategory.INPROGRESS:
                    item.wipAgeInWholeDays = this.getWIPAgeInWholeDays(params);
                    break;
                case StateCategory.PROPOSED:
                    item.inventoryAgeInWholeDays = this.getInventoryAgeInWholeDays(params);
                    break;
            }

            contextFilteredWorkItems.push(item);
        });

        // this.logger.debug(`[getWorkItems] totalItems: ${totalItems}, skippedItems: ${skipped}', remaining: ${totalItems - skipped}`);

        return contextFilteredWorkItems;
    }

    async getContextsItemMapByWorkItemId(
        orgId: string,
        workItemIds: string[],
        contextId: string[],
    ): Promise<Array<any>> {
        if (!workItemIds.length) {
            return [];
        }

        const aurora = await this.aurora;
        const contextWorkItemMapModel = ContextWorkItemMapFactory(
            aurora,
            Sequelize,
        );

        const where: any = {
            orgId,
            workItemId: workItemIds,
            contextId,
        };

        const contextWorkItemMaps = await contextWorkItemMapModel.findAll({
            raw: true, // transform in a plain json object to avoid need map it and format
            where: getDeletedAtFilterCondition(where),
            attributes: [
                [
                    Sequelize.fn('DISTINCT', Sequelize.col('contextId')),
                    'contextId',
                ],
                'workItemId',
            ],
        });

        return contextWorkItemMaps;
    }

    async getObeyaContexts(orgId: string): Promise<Array<ObeyaContextItem>> {
        if (!orgId) {
            return [];
        }

        const aurora = await this.aurora;
        const contextModel = await ContextModel(aurora);

        const where: any = {
            orgId,
            archived: 'false',
            obeyaId: null
        };

        const contexts: any = await contextModel.findAll({
            raw: true, // transform in a plain json object to avoid need map it and format
            where,
            attributes: ['contextId', 'name', 'positionInHierarchy'],
        });

        return contexts;
    }

    async getWorkItemsToObeya({
        orgId,
        fqlFilter,
        columnNames,
        sprintIds
    }: {
        orgId: string;
        fqlFilter?: string;
        columnNames?: string[];
        sprintIds?: string[];
    }): Promise<Array<StateItem>> {
        if (!orgId || orgId === '') return [];

        const workItems = await this.workItemQueries.getWorkItemsByStateCategory(
            orgId,
            undefined,
            undefined,
            fqlFilter,
            columnNames,
        );

        return workItems;
    }

    /**
     * @deprecated
     * This is the original getWorkItems.
     * Since 02/2022 we are migrating to using getExtendedWorkItems on some cases.
     */
    async getWorkItems(
        orgId: string,
        stateCategory?: StateCategory,
        uiFilters?: IQueryFilters,
        fqlFilter?: FQLFilterModel | string,
        columnNames?: string[],
        isDelayed?: boolean,
        disabledDelayed?: boolean,
        disabledDiscarded?: boolean,
    ): Promise<StateItem[]> {
        if (!orgId || orgId === '') return [];
        const contextId = uiFilters?.getContextId();

        // Do not allow data to be fetched without context because that is meaningless data
        if (!contextId) {
            return [];
        }

        const workItemIdsFromContext: string[] = await this.getWorkItemIdsFromContext(
            orgId,
            contextId,
            uiFilters,
        );

        if (
            contextId &&
            (!workItemIdsFromContext || workItemIdsFromContext.length === 0)
        ) {
            //if a context was selected, and it has no work items, return nothing
            //but if no context was selected, we want everything so continue
            return [];
        }
        const excludeWeekends = !!(await uiFilters?.getExcludeWeekendsSetting(orgId));

        const workItems = await this.workItemQueries.getWorkItemsByStateCategory(
            orgId,
            stateCategory,
            uiFilters,
            fqlFilter,
            columnNames,
            isDelayed,
            disabledDelayed,
            disabledDiscarded,
        );

        return this.filterByContext(
            stateCategory,
            workItems,
            workItemIdsFromContext,
            excludeWeekends,
            contextId,
        );
    }

    /**
     * Retrieves extended work items from the database. Extended work items
     * contain all the data of conventional work items in addition to
     * many useful additional fields.
     * @param orgId Organization ID in the database.
     * @param stateCategories State categories to retrieve. If none, fetches
     * all.
     * @param uiFilters User interface filters.
     * @param fqlFilter Flomatika Query Language filters.
     * @param columnNames Database columns to retrieve.
     * @param ignoreDiscardedItems Ignore discarded items.
     * @returns Work items that match the selected options.
     */
    async getExtendedWorkItems(
        orgId: string,
        stateCategories: StateCategory[],
        uiFilters?: IQueryFilters,
        fqlFilter?: FQLFilterModel | string,
        columnNames?: string[],
        ignoreDiscardedItems?: boolean,
        useSnapshotsData?: boolean,
    ): Promise<ExtendedStateItem[]> {
        if (!orgId || orgId === '') {
            return [];
        }

        const workItems: ExtendedStateItem[] = await this.workItemQueries.getExtendedWorkItemsByStateCategory({
            orgId,
            stateCategories,
            uiFilters,
            fqlFilter,
            columnNames,
            ignoreDiscardedItems,
            useSnapshotsData,
        });

        return workItems;
    }

    async getExtendedWorkItemDetails(
        orgId: string,
        workItemId: string,
        uiFilters?: IQueryFilters
    ): Promise<ExtendedStateItem[]> {
        if (!orgId || orgId === '') {
            return [];
        }
        const workItems = await this.workItemQueries.getExtendedItemDetails(
            {
                orgId,
                uiFilters,
                workItemId
            }
        );
        return workItems;
    }

    async getExtendedWorkItemsWithScenarios(
        orgId: string,
        scenarios: RetrievalScenario[],
        uiFilters?: IQueryFilters,
        fqlFilter?: FQLFilterModel | string,
        columnNames?: string[],
        isDelayed?: boolean,
        ignoreDiscardedItems?: boolean,
        useSnapshotsData?: boolean,
        includeArrivalPoint?: boolean,
        workItemIdListToFilter?: string[],
    ): Promise<ExtendedStateItem[]> {
        if (!orgId || orgId === '') {
            return [];
        }

        const workItems: ExtendedStateItem[] = await this.workItemQueries.getExtendedWorkItemsByScenario({
            orgId,
            scenarios,
            uiFilters,
            fqlFilter,
            columnNames,
            isDelayed,
            ignoreDiscardedItems,
            useSnapshotsData,
            includeArrivalPoint,
            workItemIdListToFilter,
        });

        return workItems;
    }

    async getCompletedItemsEachDayInContexts(
        orgId: string,
        contextIds: string[],
        dateRange: Interval,
    ): Promise<Array<DeliveryRate>> {
        const aurora = await this.aurora;
        const query = `
        SELECT d.dt as date, COALESCE(cs.count,0) as "itemCompleted" from
            (
                SELECT dt::date 
                FROM generate_series('${dateRange.start.toISODate()}', '${dateRange.end.toISODate()}', '1 day'::interval) dt
            ) d
            LEFT JOIN 
            (
                SELECT  s."departureDate"::date as "departureDate", count(DISTINCT(cw."workItemId")) as count from
                    states s 
                    JOIN "contextWorkItemMaps" cw
                    ON cw."workItemId" = s."workItemId"
                WHERE cw."contextId" in (${contextIds.map(
            (contextId) => `'${contextId}'`,
        )})
                AND s."stateCategory" = 'completed'
                AND s."departureDate"::date between '${dateRange.start.toISODate()}' and '${dateRange.end.toISODate()}' 
                AND s."partitionKey" = 'state#${orgId}'
                GROUP BY 1
                ORDER BY 1
            ) cs 
            ON d.dt = cs."departureDate"
        `;
        const result: Array<DeliveryRate> = await aurora.query(query, {
            replacements: {
                orgId,
            },
            type: QueryTypes.SELECT,
        });
        return result;
    }

    /**
     * This function returns the number of work items that have entered each state between a date period
     * @param orgId
     * @param dateRange
     * @param workItemIdList
     * @param timezone
     * @returns A record where keys are states and values are the number of work items that became that state in that period
     */
    async getArrivalsByState(
        orgId: string,
        dateRange: Interval,
        timezone: string,
        workItemIdList: string[] | undefined,
        workItemTypeList?: string[],
    ): Promise<StateNumberRecord> {
        if (workItemIdList instanceof Array && workItemIdList.length === 0) {
            return {};
        }

        const aurora = await this.aurora;

        const getSnapshotsQuery = WorkItemQueries.buildSnapshotsRetrievalQuery({
            orgId,
            timezone,
            workItemIds: workItemIdList,
            workItemTypeList,
            startDate: dateRange.start,
            endDate: dateRange.end
        });

        const query = `
            WITH "getSnapshotsFnResult" AS (
                ${getSnapshotsQuery}
            )
            SELECT
                COUNT("workItemId") AS "count",
                "state" AS "state"
            FROM "getSnapshotsFnResult"
            WHERE "isFiller" = false
            GROUP BY
                "state"
        `;

        const rows: { count: string; state: string; }[] = await aurora.query(
            query,
            {
                replacements: {
                    partitionKey: `snapshot#${orgId}`,
                    arrivalStartDate: dateRange.start.toJSDate().toISOString(),
                    arrivalEndDate: dateRange.end.toJSDate().toISOString(),
                    workItemIdList: workItemIdList,
                    workItemTypeList: workItemTypeList,
                },
                type: QueryTypes.SELECT,
            },
        );

        const result: StateNumberRecord = {};
        for (let row of rows) {
            result[row.state] = parseInt(row.count, 10);
        }
        return result;
    }

    /**
     * This function returns the number of work items that have exited each state between a date period
     * @param orgId
     * @param dateRange
     * @param workItemIdList
     * @returns A record where keys are states and values are the number of work items that stopped being that state in that period
     */
    async getDeparturesByState(
        orgId: string,
        dateRange: Interval,
        timezone: string,
        workItemIdList?: string[],
        workItemTypeList?: string[],
    ): Promise<StateNumberRecord> {
        if (workItemIdList instanceof Array && workItemIdList.length === 0) {
            return {};
        }

        const aurora = await this.aurora;

        const query = `with snapshots_dataset as (
            select 
                *,
                "flomatikaSnapshotDate" at time zone :timeZone AS "flomatikaSnapshotDateTz"
            from 
                snapshots s 
            where 
                "type" in ('state_change', 'flagged') and
                "partitionKey"  = 'snapshot#' || :orgId and
                "workItemId" in (:workItemIds) and
                "isFiller" = false and 
                "flomatikaWorkItemTypeId" in (:workItemTypes)
        )
        ,snapshots_raw as (
            select 
                * 
            FROM
                snapshots_dataset s1
            WHERE
                (
                    s1."workItemId",
                    s1."flomatikaSnapshotDateTz"
                ) IN (
                    SELECT
                      s2."workItemId",
                      -- Last snapshot of the day
                      max(s2."flomatikaSnapshotDateTz")
                    FROM
                      snapshots_dataset s2
                    GROUP BY
                      s2."workItemId",
                      CAST(s2."flomatikaSnapshotDateTz" AS DATE)
                )
            ORDER BY
                s1."flomatikaSnapshotDateTz" DESC 
        )
        , events AS (
                    SELECT
                        ROW_NUMBER() OVER (ORDER BY snapshots_raw."workItemId", snapshots_raw."flomatikaSnapshotDate") AS "row_number",
                        snapshots_raw."workItemId",
                        snapshots_raw."flomatikaSnapshotDate" at time zone :timeZone AS "formattedDate",
                        snapshots_raw."stateType",
                        snapshots_raw."state",
                        snapshots_raw."stepCategory",
                        snapshots_raw."stateCategory"
                    FROM
                        snapshots_raw
        )
        ,formatted_events as (
                    SELECT
                        current_events."workItemId",
                        current_events."formattedDate"::date AS "previousDate",
                        (case
                        when (next_events."formattedDate" is null)
                        then (null)
                        else ((next_events."formattedDate" - interval '1' day)::date)
                        end) as "nextDate",
                        current_events."state" AS "previousState",
                        next_events."state" as "nextState"
                    from
                        events AS current_events
                    LEFT JOIN events AS next_events ON
                        current_events.row_number + 1 = next_events.row_number
                        AND next_events."workItemId" = current_events."workItemId"
        )
        select count(*) as "count" ,formatted_events."previousState" as "state" from formatted_events 
        where (formatted_events."nextDate" between :startDate and :endDate) and formatted_events."previousState" != formatted_events."nextState"
        group by formatted_events."previousState"
        `;
        const rows: { count: string; state: string; }[] = await aurora.query(
            query,
            {
                replacements: {
                    orgId,
                    timeZone: timezone,
                    workItemIds: workItemIdList,
                    workItemTypes: workItemTypeList,
                    startDate: dateRange.start.toISO().toString(),
                    endDate: dateRange.end.toISO().toString()
                },
                type: QueryTypes.SELECT,
            },
        );

        const result: StateNumberRecord = {};
        for (let row of rows) {
            result[row.state] = parseInt(row.count, 10);
        }
        return result;
    }

    async getAverageCycleTime(
        orgId: string,
        dateRange: Interval,
        timezone: string,
        workItemIdList?: string[],
        workItemTypeList?: string[],
    ): Promise<StateNumberRecord> {
        if (workItemIdList instanceof Array && workItemIdList.length === 0) {
            return {};
        }

        const aurora = await this.aurora;

        const query = `with snapshots_dataset as (
            select 
                *,
                "flomatikaSnapshotDate" at time zone :timeZone AS "flomatikaSnapshotDateTz"
            from 
                snapshots s 
            where 
                "type" in ('state_change', 'flagged') and
                "partitionKey"  = 'snapshot#' || :orgId and
                "workItemId" in (:workItemIds) and
                "isFiller" = false and 
                "flomatikaWorkItemTypeId" in (:workItemTypes)
        )
        ,snapshots_raw as (
            select 
                * 
            FROM
                snapshots_dataset s1
            WHERE
                (
                    s1."workItemId",
                    s1."flomatikaSnapshotDateTz"
                ) IN (
                    SELECT
                      s2."workItemId",
                      -- Last snapshot of the day
                      max(s2."flomatikaSnapshotDateTz")
                    FROM
                      snapshots_dataset s2
                    GROUP BY
                      s2."workItemId",
                      CAST(s2."flomatikaSnapshotDateTz" AS DATE)
                )
            ORDER BY
                s1."flomatikaSnapshotDateTz" DESC 
        )
        , events AS (
                    SELECT
                        ROW_NUMBER() OVER (ORDER BY snapshots_raw."workItemId", snapshots_raw."flomatikaSnapshotDate") AS "row_number",
                        snapshots_raw."workItemId",
                        snapshots_raw."flomatikaSnapshotDate" at time zone :timeZone AS "formattedDate",
                        snapshots_raw."stateType",
                        snapshots_raw."state",
                        snapshots_raw."stepCategory",
                        snapshots_raw."stateCategory"
                    FROM
                        snapshots_raw
        )
        ,formatted_events as (
                    SELECT
                        current_events."workItemId",
                        current_events."formattedDate"::date AS "previousDate",
                        (case 
                            when(next_events."formattedDate" is null and current_events."stateCategory" in ('preceding', 'completed', 'removed'))
                            then (current_events."formattedDate" + interval '1' day)
                            when(next_events."formattedDate" is null)
                            then ((current_timestamp at time zone :timeZone)::date)
                            else next_events."formattedDate"
                        end)::date as "nextDate",
                        current_events."state" AS "previousState",
                        next_events."state" as "nextState"
                    from
                        events AS current_events
                    LEFT JOIN events AS next_events ON
                        current_events.row_number + 1 = next_events.row_number
                        AND next_events."workItemId" = current_events."workItemId"
        ),truncated_formatted_events as (
            select * ,
            (CASE
				WHEN (formatted_events."previousDate" < (:startDate::timestamp)) 
				THEN (:startDate::timestamptz AT TIME ZONE :timeZone)::date
				WHEN (formatted_events."previousDate" > (:endDate::timestamp))
				THEN (:endDate::timestamptz AT TIME ZONE :timeZone)::date
				ELSE formatted_events."previousDate"
			END) AS "fromDate",
			(CASE
				WHEN (formatted_events."nextDate" < (:startDate::timestamp)) 
				THEN (:startDate::timestamptz AT TIME ZONE :timeZone)::date
				WHEN (formatted_events."nextDate" > (:endDate::timestamp))
				THEN (:endDate::timestamptz AT TIME ZONE :timeZone)::date
				ELSE formatted_events."nextDate"
			END) AS "toDate"
            from formatted_events
        ), truncated_formatted_events_with_difference as (
            select * , (truncated_formatted_events."toDate" - truncated_formatted_events."fromDate") as "difference" 
            from truncated_formatted_events
            where (truncated_formatted_events."toDate" - truncated_formatted_events."fromDate") > 0
        )
        select sum(truncated_formatted_events_with_difference."difference") as "days" ,
        COUNT(DISTINCT truncated_formatted_events_with_difference."workItemId") AS "items",
        truncated_formatted_events_with_difference."previousState" as "state" from truncated_formatted_events_with_difference
        group by truncated_formatted_events_with_difference."previousState"`;

        const rows: {
            state: string;
            days: string;
            items: string;
        }[] = await aurora.query(query,
            {
                replacements: {
                    orgId,
                    timeZone: timezone,
                    workItemIds: workItemIdList,
                    workItemTypes: workItemTypeList,
                    startDate: dateRange.start.toISO().toString(),
                    endDate: dateRange.end.toISO().toString()
                },
                type: QueryTypes.SELECT,
            },
        );

        const result: { [stepCategory: string]: number; } = {};
        for (let row of rows) {
            result[row.state] =
                parseInt(row.days, 10) / parseInt(row.items, 10);
        }
        return result;
    }

    async getWorkItemsStateFromParentId(
        orgId: string,
        parentId: string | undefined,
    ): Promise<StateItem[]> {
        const aurora = await this.aurora;

        const stateModel: any = StateModel(aurora);

        const workItems: StateItem[] = await stateModel.findAll({
            where: {
                partitionKey: `state#${orgId}`,
                parentId,
                deletedAt: null,
            },
        });

        return workItems.map((record: any) => record.dataValues);
    }

    countWorkItemsByStateCategory(
        workItems: StateItem[],
        workItemStatus: WorkItemStatesItem,
    ): WorkItemStatesItem {
        workItems.forEach((stateDbItem: any) => {
            switch (stateDbItem.stateCategory) {
                case 'completed':
                    workItemStatus.numberOfItemsCompleted++;
                    break;
                case 'inprogress':
                    workItemStatus.numberOfItemsInProgress++;
                    break;
                case 'proposed':
                    workItemStatus.numberOfItemsProposed++;
                    break;
                default:
                    break;
            }
        });
        return workItemStatus;
    }

    async countWorkItemStateFromParentId(
        orgId: string,
        parentId: string | undefined,
    ): Promise<WorkItemStatesItem> {
        const countParentItemsByStateCategory: WorkItemStatesItem = {
            parentId: parentId!,
            numberOfItemsCompleted: 0,
            numberOfItemsInProgress: 0,
            numberOfItemsProposed: 0,
        };

        if (!parentId) {
            return countParentItemsByStateCategory;
        }

        const workItems = await this.getWorkItemsStateFromParentId(
            orgId,
            parentId,
        );

        const workItemStatus = this.countWorkItemsByStateCategory(
            workItems,
            countParentItemsByStateCategory,
        );

        return workItemStatus;
    }

    async getObeyaWorkflowsByBoards(
        orgId: string,
        parsedQuery?: string,
    ): Promise<Array<any>> {
        const aurora = await this.aurora;
        const predicate = parsedQuery ? `AND ${parsedQuery}` : '';

        const defaultColumns = `
          "s"."stateCategory",
          "s"."workItemId",
          "s"."title",
          "s"."state"
        `;
        const query = `
            select 
                "context"."contextId",
                context.name as "boardName",
                ${defaultColumns}
            FROM contexts AS context
                  JOIN "contextWorkItemMaps" as "contextMaps" on "contextMaps"."contextId" = "context"."contextId"
                  JOIN states as s on "contextMaps"."workItemId" = "s"."workItemId"
            WHERE "context"."orgId" = :orgId
               AND length("context"."positionInHierarchy") = 5
                ${predicate}
            GROUP BY 
                "context"."contextId", 
                ${defaultColumns}
            ORDER BY "context"."contextId"
        `;
        const obeyaWorkflowItems: Array<any> = await aurora.query(query, {
            replacements: {
                orgId,
            },
            type: QueryTypes.SELECT,
        });
        return obeyaWorkflowItems;
    }

    async getCommitmentRate(
        orgId: string,
        uiFilters?: IQueryFilters,
        filterTags: string = PredefinedFilterTags.NORMALISATION,
        parsedQuery?: string,
    ): Promise<Array<CommitmentRate>> {
        const aurora = await this.aurora;
        const contextId = uiFilters?.getContextId();

        const filters = await this.getFQLFilters(orgId, filterTags);

        if (!filters || (filters.length === 0 && !parsedQuery)) {
            return [];
        }

        let contextPredicate = '';
        if (contextId) {
            const GENERATE_SQL_ONLY = true;
            const contextSubQuery = await this.getWorkItemIdsFromContext(
                orgId,
                contextId,
                uiFilters,
                GENERATE_SQL_ONLY,
            );

            contextPredicate = `
            AND "states"."workItemId" in (${contextSubQuery})
            `;
        }

        const allQueries: string[] = [];

        if (parsedQuery) {
            const predicate = `AND ${parsedQuery}`;
            const query = `
                  SELECT  "states"."flomatikaWorkItemTypeName",
                          count("workItemId") as "stateCount",
                          'commitment' as "countType"
                  FROM    "states"
                  WHERE   "states"."partitionKey" = :partitionKey
                  AND     "states"."commitmentDate" is not null
                  AND     "states"."deletedAt" is null
                  ${contextPredicate}
                  ${predicate}
                  GROUP BY "states"."flomatikaWorkItemTypeName"
                  UNION
                  SELECT  "states"."flomatikaWorkItemTypeName",
                          count("workItemId") as "stateCount",
                          'total' as "countType"
                  FROM    "states"
                  WHERE   "states"."partitionKey" = :partitionKey
                  AND     "states"."deletedAt" is null
                  ${contextPredicate}
                  ${predicate}
                  GROUP BY "states"."flomatikaWorkItemTypeName"
              `;
            allQueries.push(query);
        } else {
            // create a single query that includes each filter / display name
            // and union them all together to create one big query
            for (const filter of filters) {
                const predicate = `AND ${filter.parsedQuery}`;
                const query = `
                  SELECT  "states"."flomatikaWorkItemTypeName",
                          count("workItemId") as "stateCount",
                          'commitment' as "countType",
                          '${filter.displayName}' as "normalisedDisplayName"
                  FROM    "states"
                  WHERE   "states"."partitionKey" = :partitionKey
                  AND     "states"."commitmentDate" is not null
                  AND     "states"."deletedAt" is null
                  ${contextPredicate}
                  ${predicate}
                  GROUP BY "states"."flomatikaWorkItemTypeName"
                  UNION
                  SELECT  "states"."flomatikaWorkItemTypeName",
                          count("workItemId") as "stateCount",
                          'total' as "countType",
                          '${filter.displayName}' as "normalisedDisplayName"
                  FROM    "states"
                  WHERE   "states"."partitionKey" = :partitionKey
                  AND     "states"."deletedAt" is null
                  ${contextPredicate}
                  ${predicate}
                  GROUP BY "states"."flomatikaWorkItemTypeName"
              `;
                allQueries.push(query);
            }
        }

        const finalQuery = allQueries
            .join(' union ')
            .concat(' order by "states"."flomatikaWorkItemTypeName"');

        const commitmentRateQuery: Array<CommitmentRate> = await aurora.query(
            finalQuery,
            {
                replacements: {
                    partitionKey: `state#${orgId}`,
                },
                type: QueryTypes.SELECT,
            },
        );
        return commitmentRateQuery;
    }

    async getTimeToCommit(
        orgId: string,
        uiFilters?: IQueryFilters,
        filterTags: string = PredefinedFilterTags.NORMALISATION,
        parsedQuery?: string,
    ): Promise<Array<TimeToCommit>> {
        const aurora = await this.aurora;
        const contextId = uiFilters?.getContextId();

        const filters = await this.getFQLFilters(orgId, filterTags);

        if (!filters || filters.length === 0) {
            return [];
        }

        let contextPredicate = '';
        if (contextId) {
            const GENERATE_SQL_ONLY = true;
            const contextSubQuery = await this.getWorkItemIdsFromContext(
                orgId,
                contextId,
                uiFilters,
                GENERATE_SQL_ONLY,
            );

            contextPredicate = `
            AND "states"."workItemId" in (${contextSubQuery})
            `;
        }

        const allQueries: string[] = [];

        if (parsedQuery) {
            const predicate = ` AND ${parsedQuery}`;
            const query = `
                SELECT  "states"."flomatikaWorkItemTypeName",
                        "arrivalDate",
                        "commitmentDate"
                FROM    "states"
                WHERE   "states"."partitionKey" = :partitionKey
                AND     "states"."commitmentDate" is not null
                AND     "states"."deletedAt" is null
                ${contextPredicate}
                ${predicate}
            `;
            allQueries.push(query);
        } else {
            // create a single query that includes each filter / display name
            // and union them all together to create one big query
            for (const filter of filters) {
                const predicate = ` AND ${filter.parsedQuery}`;
                const query = `
                    SELECT  "states"."flomatikaWorkItemTypeName",
                            "arrivalDate",
                            "commitmentDate",
                            '${filter.displayName}' as "normalisedDisplayName"
                    FROM    "states"
                    WHERE   "states"."partitionKey" = :partitionKey
                    AND     "states"."commitmentDate" is not null
                    AND     "states"."deletedAt" is null
                    ${contextPredicate}
                    ${predicate}
                `;
                allQueries.push(query);
            }
        }

        const finalQuery = allQueries
            .join(' UNION ')
            .concat(' ORDER BY "states"."flomatikaWorkItemTypeName"');

        const timeToCommitmentQuery: Array<TimeToCommit> = await aurora.query(
            finalQuery,
            {
                replacements: {
                    partitionKey: `state#${orgId}`,
                },
                type: QueryTypes.SELECT,
            },
        );
        return timeToCommitmentQuery;
    }

    // TODO: refactor; this can be made simpler and better
    async createLinkTypeQuery(includeRelated: boolean, linkType: string[], relatedIds: string) {
        const linkTypeQuery = `
            SELECT	workitemid
            FROM	linked_items_list(:partitionKey, 'relationType', ${relatedIds})`;

        if (!includeRelated)
            return `SELECT	workitemid FROM	linked_items_list('', '', '')`;

        let newQuery = "";

        if (linkType.length > 1) {
            for (const type of linkType) {
                newQuery = newQuery.concat(" UNION ").concat(linkTypeQuery.replace('relationType', type));
            }
        } else {
            newQuery = linkTypeQuery.replace('relationType', linkType[0]);
        }

        return newQuery.substring(1, 6).replace("UNION", "").concat(newQuery.substring(6, newQuery.length));
    }

    async getObeyaWorkItems({
        orgId,
        workItemIds,
        includeChildren,
        includeRelated,
        includeChildrenOfRelated,
        hierarchyLevel = 0,
        excludeWorkItemIds,
        linkTypes
    }: {
        orgId: string;
        workItemIds: string;
        includeChildren: boolean;
        includeRelated: boolean;
        includeChildrenOfChildren: boolean;
        includeChildrenOfRelated: boolean;
        hierarchyLevel?: number;
        excludeWorkItemIds?: string;
        linkTypes?: string[];
    }): Promise<StateItem[]> {
        const cacheKey = JSON.stringify({
            orgId,
            workItemIds,
            includeChildren,
            includeRelated,
            includeChildrenOfRelated,
            hierarchyLevel,
            excludeWorkItemIds,
            linkTypes
        });
        if (this.cache.has(cacheKey)) {
            console.log('cache hit');
            return this.cache.get(cacheKey);
        }

        const fn = async () => {
            const aurora = await this.aurora;
            const whereRemoved = await this.workItemQueries.ignoreItemsPredicates(
                orgId,
            );

            // ensures that when there is no exclude filter expression don't break the queries
            const whereWithRemovedState = whereRemoved?.[Op.and]?.val
                ? `AND ${whereRemoved?.[Op.and]?.val}`
                : '';

            const childrenOfRelatedQuery =
                includeRelated && includeChildrenOfRelated && workItemIds
                    ? (`
                    UNION
                        SELECT  s.*, 'related_children' AS relationship_type,
                                hierarchy_level + 1 AS hierarchy_level
                        FROM	states s
                        INNER 
                        JOIN	related_and_children_of	rac
                        ON		rac."workItemId" = s."parentId"
                        WHERE   s."deletedAt" IS NULL AND s."arrivalDate" IS NOT NULL
                    `).replace(/LOWER\("flomatikaWorkItemTypeName"/gi, 'LOWER(s."flomatikaWorkItemTypeName"')
                    : '';

            const childrenOfChildrenQuery =
                includeChildren && workItemIds
                    ? (`
                    UNION ALL
                        SELECT  s.*, 'children_of_children' AS relationship_type,
                                hierarchy_level + 1 AS hierarchy_level
                        FROM	states s
                        JOIN	children_of_children	coc 
                        ON		coc."workItemId" = s."parentId"
                        WHERE   s."partitionKey"	= :partitionKey 
                        AND     s."deletedAt" IS NULL AND s."arrivalDate" IS NOT NULL
                    `).replace(/LOWER\("flomatikaWorkItemTypeName"/gi, 'LOWER(s."flomatikaWorkItemTypeName"')
                    : '';

            const relatedIds =
                includeRelated && workItemIds
                    ? `VARIADIC array[${workItemIds}]`
                    : "''";

            const linkTypeQuery = await this.createLinkTypeQuery(includeRelated, linkTypes || [], relatedIds);

            const hierarchyLevelQuery = hierarchyLevel !== 0 && includeChildren && workItemIds
                ? ` AND hierarchy_level <= ${hierarchyLevel} `
                : '';

            const query = `
                ------- BEGIN RECURSIVE -------
                WITH RECURSIVE related_and_children_of AS (
                        SELECT	related.*, 'related' AS relationship_type,
                                0 AS hierarchy_level
                        FROM	states	related
                        WHERE	related."partitionKey" = :partitionKey
                            AND     related."deletedAt" IS NULL AND related."arrivalDate" IS NOT NULL
                            AND		related."workItemId" IN (
                                ${linkTypeQuery}
                        )
                        ${childrenOfRelatedQuery}
                    ),
                children_of_children AS (
                    SELECT * FROM related_and_children_of
                    UNION
                        SELECT  s.*, 'children' AS relationship_type,
                                1 AS hierarchy_level
                        FROM    states s
                        WHERE   "partitionKey" = :partitionKey
                        AND     s."deletedAt" IS NULL AND s."arrivalDate" IS NOT NULL
                        ${includeChildren ?
                    `AND "parentId" IN (${workItemIds ? workItemIds : "''"}) ` : ''}
                        AND NOT (LOWER(s."state") = 'rejected' OR LOWER(s."state") = 'discarded')
                            ${hierarchyLevel > 1 ?
                    childrenOfChildrenQuery : ''}
                ) 
                SELECT * FROM children_of_children WHERE "partitionKey" = :partitionKey
                ${excludeWorkItemIds ? `AND "workItemId" NOT IN (${excludeWorkItemIds})` : ''}
                ${whereWithRemovedState}
                ${!includeChildren && workItemIds ?
                    `AND "workItemId" IN (${workItemIds})` : hierarchyLevelQuery}
                ------- END RECURSIVE -------`;

            const obeyaWorkItems: StateItem[] = await aurora.query(query, {
                replacements: {
                    partitionKey: `state#${orgId}`
                },
                type: QueryTypes.SELECT,
            });
            return obeyaWorkItems;
        };

        const promise = fn();
        this.cache.set(cacheKey, promise);

        return promise;

    }

    async getDemandVsCapacity(
        orgId: string,
        from: DateTime,
        to: DateTime,
        uiFilters?: IQueryFilters,
        filterTags: string = PredefinedFilterTags.NORMALISATION,
        parsedQuery?: string,
    ): Promise<DemandVsCapacityItem[]> {
        const aurora = await this.aurora;
        const contextId = uiFilters?.getContextId();

        const filters = await this.getFQLFilters(orgId, filterTags);

        if (!filters || (filters.length === 0 && !parsedQuery)) {
            return [];
        }

        const allQueries: string[] = [];

        let contextPredicate = '';
        if (contextId) {
            const GENERATE_SQL_ONLY = true;
            const contextSubQuery = await this.getWorkItemIdsFromContext(
                orgId,
                contextId,
                uiFilters,
                GENERATE_SQL_ONLY,
            );

            contextPredicate = `
            AND "states"."workItemId" in (${contextSubQuery})
            `;
        }

        if (parsedQuery) {
            const predicate = `AND ${parsedQuery}`;
            const query = `
                  SELECT 
                      "states"."flomatikaWorkItemTypeName",
                      count("workItemId") as "stateCount",
                      'commitment' as "workflowEvent"
                  FROM "states"
                  WHERE  
                      "states"."partitionKey" = :partitionKey
                      AND "states"."commitmentDate" >= :startDate
                      AND "states"."commitmentDate" <= :endDate
                      AND "states"."deletedAt" is null
                      ${contextPredicate}
                      ${predicate}
                  group by
                      "states"."flomatikaWorkItemTypeName"
                  union
                  SELECT 
                      "states"."flomatikaWorkItemTypeName",
                      count("workItemId") as "stateCount",
                      'departure' as "workflowEvent"
                  FROM "states"
                  WHERE  
                      "states"."partitionKey" = :partitionKey
                      AND "states"."departureDate" >= :startDate
                      AND "states"."departureDate" <= :endDate
                      AND "states"."deletedAt" is null
                      ${contextPredicate}
                      ${predicate}
                  group by
                  "states"."flomatikaWorkItemTypeName"
              `;
            allQueries.push(query);
        } else {
            for (const filter of filters) {
                const predicate = `AND ${filter?.parsedQuery}`;
                const query = `
                  SELECT 
                      "states"."flomatikaWorkItemTypeName",
                      count("workItemId") as "stateCount",
                      'commitment' as "workflowEvent",
                      '${filter.displayName}' as "normalisedDisplayName"
                  FROM "states"
                  WHERE  
                      "states"."partitionKey" = :partitionKey
                      AND "states"."commitmentDate" >= :startDate
                      AND "states"."commitmentDate" <= :endDate
                      AND "states"."deletedAt" is null
                      ${contextPredicate}
                      ${predicate}
                  group by
                      "states"."flomatikaWorkItemTypeName"
                  union
                  SELECT 
                      "states"."flomatikaWorkItemTypeName",
                      count("workItemId") as "stateCount",
                      'departure' as "workflowEvent",
                      '${filter.displayName}' as "normalisedDisplayName"
                  FROM "states"
                  WHERE  
                      "states"."partitionKey" = :partitionKey
                      AND "states"."departureDate" >= :startDate
                      AND "states"."departureDate" <= :endDate
                      AND "states"."deletedAt" is null
                      ${contextPredicate}
                      ${predicate}
                  group by
                  "states"."flomatikaWorkItemTypeName"
              `;
                allQueries.push(query);
            }
        }

        const finalQuery = allQueries
            .join(' union ')
            .concat(' order by "states"."flomatikaWorkItemTypeName"');

        const countOfCommitmentAndDeparture: DemandVsCapacityItem[] = await aurora.query(finalQuery, {
            replacements: {
                partitionKey: `state#${orgId}`,
                startDate: from.toISODate(),
                endDate: to.toISODate(),
            },
            type: QueryTypes.SELECT,
        });

        return countOfCommitmentAndDeparture;
    }

    async getStaleWorkItems(
        orgId: string,
        uiFilters?: IQueryFilters,
        filterTags: string = PredefinedFilterTags.NORMALISATION,
        parsedQuery?: string,
    ): Promise<Array<any>> {
        const aurora = await this.aurora;
        const contextId = uiFilters?.getContextId();

        const filters = await this.getFQLFilters(orgId, filterTags);

        if (!filters || (filters.length === 0 && !parsedQuery)) {
            return [];
        }

        const allQueries: string[] = [];

        //create a single query that includes each filter / display name
        //and union them all together to create one big query

        let contextPredicate = '';
        if (contextId) {
            const GENERATE_SQL_ONLY = true;
            const contextSubQuery = await this.getWorkItemIdsFromContext(
                orgId,
                contextId,
                uiFilters,
                GENERATE_SQL_ONLY,
            );

            contextPredicate = `
            AND "workItemId" in (${contextSubQuery})
            `;
        }

        if (parsedQuery) {
            const predicate = `
                AND (${parsedQuery})
                `;
            const query = `
                SELECT  "states"."flomatikaWorkItemTypeName",
                cast (count("workItemId") as INTEGER),
                'active' as "type",
                'workItemType' as "normalisedDisplayName"
                FROM    "states"
                WHERE   "partitionKey" = :partitionKey
                AND     "stateCategory"	in ('inprogress')
                AND     "changedDate"::date < now() - INTERVAL '30 days'
                AND     "deletedAt" is null
                ${contextPredicate}
                ${predicate}
                GROUP BY "states"."flomatikaWorkItemTypeName"
                
                UNION
                
                SELECT  "states"."flomatikaWorkItemTypeName",
                        count("workItemId"),
                        'total' as "type",
                        'workItemType' as "normalisedDisplayName"
                FROM    "states"
                WHERE   "partitionKey" = :partitionKey
                AND     "stateCategory"	in ('inprogress')
                AND     "deletedAt" is null
                ${contextPredicate}
                ${predicate}
                GROUP BY "states"."flomatikaWorkItemTypeName"
            `;
            allQueries.push(query);
        } else {
            for (const filter of filters) {
                const predicate = `
                    AND (${filter.parsedQuery})
                    `;
                const query = `
                      SELECT  "states"."flomatikaWorkItemTypeName",
                              cast (count("workItemId") as INTEGER),
                              'active' as "type",
                              '${filter.displayName}' as "normalisedDisplayName"
                      FROM    "states"
                      WHERE   "partitionKey" = :partitionKey
                      AND     "stateCategory"	in ('inprogress')
                      AND     "changedDate"::date < now() - INTERVAL '30 days'
                      AND     "deletedAt" is null
                      ${contextPredicate}
                      ${predicate}
                      GROUP BY "states"."flomatikaWorkItemTypeName"
                      
                      UNION
                      
                      SELECT  "states"."flomatikaWorkItemTypeName",
                              count("workItemId"),
                              'total' as "type",
                              '${filter.displayName}' as "normalisedDisplayName"
                      FROM    states
                      WHERE   "partitionKey" = :partitionKey
                      AND     "stateCategory"	in ('inprogress')
                      AND     "deletedAt" is null
                      ${contextPredicate}
                      ${predicate}
                      GROUP BY "states"."flomatikaWorkItemTypeName"
                `;
                allQueries.push(query);
            }
        }

        const finalQuery = allQueries
            .join(' union ')
            .concat(' order by "states"."flomatikaWorkItemTypeName"');

        const staleWorkItems = await aurora.query(finalQuery, {
            replacements: {
                partitionKey: `state#${orgId}`,
            },
            type: QueryTypes.SELECT,
        });

        return staleWorkItems;
    }

    async getStaleWorkItemsForDeliveryGovernance(
        orgId: string,
        uiFilters?: IQueryFilters,
        staledItemNumberOfDays?: number,
    ): Promise<StaledDefaultItem[]> {
        const aurora = await this.aurora;
        const contextId = uiFilters?.getContextId();
        let contextPredicate = '';

        if (contextId) {
            const GENERATE_SQL_ONLY = true;
            const contextSubQuery = await this.getWorkItemIdsFromContext(
                orgId,
                contextId,
                uiFilters,
                GENERATE_SQL_ONLY,
            );

            contextPredicate = `
                AND "workItemId" in (${contextSubQuery})
            `;
        }

        const query = `
            SELECT  "states"."flomatikaWorkItemTypeName",
                    cast (count("workItemId") as INTEGER),
                    'active' as "type"
            FROM    states
            WHERE   "partitionKey" = :partitionKey
            AND     "stateCategory"	in ('inprogress')
            AND     "changedDate"::date < now() - INTERVAL :staledItemNumberOfDays
            AND     "deletedAt" is null
            ${contextPredicate}
            GROUP BY "states"."flomatikaWorkItemTypeName"
        `;

        const staleWorkItems: StaledDefaultItem[] = await aurora.query(query, {
            replacements: {
                partitionKey: `state#${orgId}`,
                staledItemNumberOfDays: `${staledItemNumberOfDays || 30} days`,
            },
            type: QueryTypes.SELECT,
            raw: true,
        });

        return staleWorkItems;
    }

    async testFqlQuery(
        orgId: string,
        datasourceId: string,
        fqlService: FQLService,
        fql: string,
    ): Promise<boolean> {
        const aurora = await this.aurora;
        try {
            //to validate the FQL, we just use it to select 1 row from the database,
            //if we don't get any errors, it's good
            const sql = await fqlService.convertFQLToSQL(
                orgId,
                datasourceId,
                fql,
            );
            await aurora.query(`select id from states where ${sql} LIMIT 1`, {
                type: QueryTypes.SELECT,
            });

            return true;
        } catch (error) {
            this.logger.error('testFqlQuery', error);
            return false;
        }
    }

    async getFQLFilters(
        orgId: string,
        tags: string,
    ): Promise<Array<FQLFilterModel>> {
        const iLike = `%${tags}%`;
        const cacheKey = `${orgId}-${iLike}`;
        if (this.cache.has(cacheKey)) {
            return (this.cache.get(cacheKey) as Promise<FQLFilterModel[]>);
        }
        // Had to write this wrapper because there are 2 awaits here
        const f = async () => {
            const aurora = await this.aurora;
            const filterModel = FQLFilterFactory(aurora);

            const fqlFilters = await filterModel.findAll({
                where: {
                    orgId,
                    tags: {
                        [Op.iLike]: `%${tags}%`,
                    },
                    deletedAt: null,
                    parsedQuery: {
                        [Op.not]: ''
                    },
                } as any,
            });
            return fqlFilters;
        };

        const promise = f();

        this.cache.set(cacheKey, promise);
        return promise;
    }

    async getFQLFilter(orgId: string, filterId: string): Promise<any> {
        const aurora = await this.aurora;
        const filterModel = FQLFilterFactory(aurora);

        const fqlFilter = await filterModel.findOne({
            where: {
                orgId,
                id: filterId,
                deletedAt: null,
            } as any,
        });

        return fqlFilter;
    }

    getWorkItemIdsUsingPredicates(
        orgId: string,
        filters: IQueryFilters,
        ignoreDiscardedItems?: boolean
    ): Promise<string[]> {
        return this.workItemQueries.getWorkItemIdsUsingPredicates(
            orgId,
            filters,
            ignoreDiscardedItems
        );
    }

    async getLinkTypes(orgId: string): Promise<string[]> {
        const aurora = await this.aurora;

        const query = `
            select 
            distinct(linkeditems."type" ) as "linkType"
            from states s ,jsonb_to_recordset(coalesce(s."linkedItems", '[]')) as linkeditems("type" text, "workItemId" text)
            where s."partitionKey" = :partitionKey
            order by "linkType"
        `;

        const result: { linkType: string; }[] = await aurora.query(query, {
            replacements: {
                partitionKey: `state#${orgId}`,
            },
            type: QueryTypes.SELECT,
            raw: true,
        });
        return result.map(row => row.linkType);
    }

    async getDistinctRows(orgId: string, columnName: string): Promise<any[]> {
        try {
            // eslint-disable-next-line
            const aurora = await this.aurora;
            const state = StateModel(aurora);
            const rows = await state.findAll({
                where: {
                    [Op.and]: {
                        partitionKey: `state#${orgId}`,
                        [columnName]: {
                            [Op.not]: null
                        }
                    }
                } as any,
                attributes: [columnName],
                group: [columnName],
                order: [columnName]
            });
            return rows.map((row: any) => row.get(columnName) as any);
        } catch (e) {
            throw e;
        }
    }

    async syncContextWorkItemMapForObeya(contextId: string, obeyaWorkItemsQueryString: string[], orgId: string, datasourceId: string): Promise<string> {
        const aurora = await this.auroraWriter;
        const transaction = await aurora.transaction();
        try {
            // eslint-disable-next-line
            const query = `with obeya_context_items as (
                select 
                  "workItemId" 
                from 
                  "contextWorkItemMaps" 
                where 
                  "contextId" = :contextId
              ), 
              obeya_data as (
                select 
                  distinct * 
                from 
                  unnest (
                    ARRAY[ :obeyaWorkItemsQueryString]::text[]
                  ) as x("workItemId")
              ), 
              inserted_rows as (
                insert into "contextWorkItemMaps" 
                select 
                  :contextId as "contextId", 
                  "workItemId", 
                  now() as "createdAt", 
                  now() as "updatedAt", 
                  :orgId as "orgId", 
                  :datasourceId as "datasourceId", 
                  '3000-11-07 17:03:54.372 +0530' as "extractRunAt", 
                   NULL as "deletedAt" 
                from 
                  (
                    select 
                      obeya_data."workItemId" 
                    from 
                      obeya_data 
                      left join obeya_context_items on obeya_data."workItemId" = obeya_context_items."workItemId" 
                    where 
                      obeya_context_items."workItemId" is null
                  ) as temp returning "workItemId"
              ), 
              deleted_rows as (
                delete from 
                  "contextWorkItemMaps" cd 
                where 
                  "workItemId" in (
                    select 
                      obeya_context_items."workItemId" 
                    from 
                      obeya_data 
                      right join obeya_context_items on obeya_data."workItemId" = obeya_context_items."workItemId" 
                    where 
                      obeya_data."workItemId" is null
                  ) 
                  and "contextId" = :contextId 
                  and "orgId" = :orgId returning "workItemId"
              ) 
              select 
                "workItemId", 
                'insert' as "action" 
              from 
                inserted_rows 
              union 
              select 
                "workItemId", 
                'delete' as "action" 
              from 
                deleted_rows
              `;
            const result: { workItemId: string; action: string; }[] = await aurora.query(query, {
                replacements: {
                    contextId,
                    obeyaWorkItemsQueryString,
                    orgId,
                    datasourceId
                },
                type: QueryTypes.SELECT,
                raw: true,
                transaction
            });
            await transaction.commit();
            const insertCount = result.filter(item => item.action === 'insert').length;
            const deleteCount = result.filter(item => item.action === 'delete').length;
            console.log("Inserted " + insertCount + " rows , deleted " + deleteCount + " rows");
            return "Inserted " + insertCount + " rows , deleted " + deleteCount + " rows";
        } catch (e) {
            await transaction.rollback();
            console.log(e);
            throw e;
        }
    }

    async getDiscardedFromList(orgId: string, workItemIdList: string[]) {
        const aurora = await this.aurora;

        const filterModel = FQLFilterFactory(aurora);

        const discardedDefinitionRows = await filterModel.findAll({
            where: {
                orgId,
                //  TODO: Check if you can use getFQLFilters here.
                // This is doing an exact match while getFQLFilters checks for a match with like
                // getFQLFilters uses cache i.e better performance
                tags: PredefinedFilterTags.DISCARDED,
                deletedAt: null,
                parsedQuery: { [Op.not]: '' },
            } as any,
        });

        const discardedDefinitionStr = '(' + discardedDefinitionRows.map(f => `(${f.parsedQuery})`).join(' AND ') + ')';

        const sql = `SELECT "workItemId" FROM states WHERE "partitionKey" = 'state#' || :orgId AND "workItemId" IN (:workItemIdList) AND ${discardedDefinitionStr}`;

        const rows = await aurora.query(sql, {
            type: QueryTypes.SELECT,
            replacements: { orgId, workItemIdList }
        });

        return rows.map((row: any) => row.workItemId as string);
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
