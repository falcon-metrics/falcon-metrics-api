import _, { find, flatten, isString } from 'lodash';
import { Logger } from 'log4js';
import { DateTime, Interval } from 'luxon';
import {
    FindOptions,
    literal,
    Model,
    Op,
    QueryTypes,
    WhereOptions,
} from 'sequelize';
import pgp from 'pg-promise';

import { DateAnalysisOptions, IQueryFilters, PredefinedFilterTags } from '../common/filters_v2';
import { CustomFieldsService } from '../data_v2/custom_fields_service';
import { ExtendedStateModel } from '../models/ExtendedStateModel';
import {
    FQLFilterFactory,
    FQLFilterModel,
    FQLFilterStatic,
} from '../models/FilterModel';
import { StateModel } from '../models/StateModel';
import { Normalization } from '../normalization/Normalization';
import {
    convertDbModelToStateItem,
    convertDbResultToExtendedStateItem,
    convertDbResultToSnapshotItem,
    ExtendedStateItem,
    RetrievalScenario,
    SnapshotItem,
    StateItem,
} from './interfaces';
import { StateCategory } from './state_aurora';
import ContextModel from '../models/ContextModel';
import { TIMEZONE_UTC, validateTzOrUTC } from '../utils/date_utils';
import { Sequelize } from 'sequelize-typescript';
import { Cacher, ModelNames } from '../sequelize-cache/cacher';
import { Redis } from 'ioredis';

// Visualization Options for User
export const INTERNAL_DATE_FIELDS = [
    'arrivalDate',
    'commitmentDate',
    'departureDate',
] as const;
export type InternalDateField = typeof INTERNAL_DATE_FIELDS[number];

interface BlockerExpediteFilterQueries {
    blockersSelectionClause: string | undefined;
    expediteSelectionClause: string | undefined;
}

type GetExtededWorkItemsParamsCommon = {
    orgId: string;
    uiFilters?: IQueryFilters;
    fqlFilter?: FQLFilterModel | string;
    columnNames?: string[];
    isDelayed?: boolean;
    ignoreDiscardedItems?: boolean;
    sprintIds?: string[];
    useSnapshotsData?: boolean;
};
type GetExtendedWorkItemsByStateCategoryParams =
    GetExtededWorkItemsParamsCommon & {
        stateCategories?: StateCategory[];
    };

type GetExtendedWorkItemsByScenarioParams =
    GetExtededWorkItemsParamsCommon & {
        scenarios: RetrievalScenario[];
        includeArrivalPoint?: boolean;
        workItemIdListToFilter?: string[],
    };

type GetExtendedStateItemDetailsParams = GetExtededWorkItemsParamsCommon & {
    workItemId: string;
};

type Item = {
    workItemId: string,
    commitmentDate: Date,
    arrivalDate: Date,
    departureDate: Date,
    contextId: string;
};

export type ItemWithContextAndTime = Partial<ExtendedStateItem> &
{ contextId: string; timeSpent?: number; normalizedDisplayName?: string; };

export interface IWorkItemQueries {
    getWorkItemsByStateCategory(
        orgId: string,
        stateCategory?: StateCategory,
        uiFilters?: IQueryFilters,
        fqlFilter?: FQLFilterModel | string,
        columnNames?: string[],
        isDelayed?: boolean,
        disableDelayed?: boolean,
        disabledDiscarded?: boolean,
    ): Promise<StateItem[]>;

    getExtendedWorkItemsByStateCategory(params: GetExtendedWorkItemsByStateCategoryParams): Promise<ExtendedStateItem[]>;

    getExtendedItemDetails(params: GetExtendedStateItemDetailsParams): Promise<ExtendedStateItem[]>;

    getExtendedWorkItemsByScenario(params: GetExtendedWorkItemsByScenarioParams): Promise<ExtendedStateItem[]>;

    getGeneralSQLPredicates(
        orgId: string,
        model: typeof Model,
        uiFilters?: IQueryFilters,
        fqlFilter?: FQLFilterModel | string,
        ignoreDiscardedItems?: boolean
    ): Promise<string[]>;

    getCustomFieldSQLPredicates(
        orgId: string,
        model: typeof Model,
        uiFilters?: IQueryFilters,
    ): Promise<string[]>;

    getIgnoreItemsSQLPredicates(orgId: string, ignoreDiscardedItems?: boolean): Promise<string[]>;

    ignoreItemsPredicates(orgId: string, ignoreDiscardedItems?: boolean): Promise<any>;

    commonPredicates(orgId: string, uiFilters?: IQueryFilters): Promise<any>;

    getContextIdsForExtendedItems(
        orgId: string,
        contextId?: string,
    ): Promise<string[]>;

    getWorkItemIdsUsingPredicates(
        orgId: string,
        filters: IQueryFilters,
        ignoreDiscardedItems?: boolean
    ): Promise<string[]>;

    /**
     * Fetch the last snapshot of the day in the given timezone. 
     * 
     * This is not being used anywhere right now. 
     * 
     * - Why is this here instead of `snapshot_queries.ts`?
     * 
     *      - This function needs access to the methods in this class. It was easier to put this here instead of doing a big refactor to move the commmon functions out of this file
     * 
     * - Refactor to be done in the future:
     *      - Since work items and snapshots are related the queries to fetch both of them can be in a single file/module.
     * 
     */
    getSnapshotsTz(
        {
            orgId, stateCategory, uiFilters, fqlFilter, isDelayed, columnNames
        }: {
            orgId: string,
            stateCategory: StateCategory,
            uiFilters?: IQueryFilters,
            fqlFilter?: FQLFilterModel | string,
            // TODO: Rename to forceDelayed?
            isDelayed?: boolean,
            columnNames?: string[];
        }
    ): Promise<SnapshotItem[]>;

    getItemsByContextAndScenario(
        contexts: string[],
        scenarios: RetrievalScenario[],
        orgId: string,
        interval: Interval,
        uiFilters: IQueryFilters | undefined,
        fetchItemAges?: boolean,
    ): Promise<
        ItemWithContextAndTime[]
    >;
}

export class WorkItemQueries implements IWorkItemQueries {
    private aurora: Promise<Sequelize>;
    private logger: Logger;
    private customFieldsService: CustomFieldsService;
    private normalizationService: Normalization;

    private ignoreItemFilterCache: { [orgId: string]: any; } = {};
    private cache: Map<string, any> = new Map();
    private redisClient: Promise<Redis>;
    private cacher: Cacher | undefined;

    constructor(opts: {
        aurora: Promise<Sequelize>;
        logger: Logger;
        customFieldsService: CustomFieldsService;
        normalizationService: Normalization;
        redisClient: Promise<Redis>;
    }) {
        this.aurora = opts.aurora;
        this.logger = opts.logger;
        this.customFieldsService = opts.customFieldsService;
        this.normalizationService = opts.normalizationService;
        this.redisClient = opts.redisClient;
    }

    async commonPredicates(
        orgId: string,
        uiFilters?: IQueryFilters,
    ) {
        const conditions: any = {};

        conditions['"partitionKey"'] = `state#${orgId}`;

        if (uiFilters?.workItemTypes) {
            conditions['"flomatikaWorkItemTypeId"'] = uiFilters?.workItemTypes;
        }

        if (uiFilters?.workItemLevels) {
            conditions['"flomatikaWorkItemTypeLevel"'] =
                uiFilters?.workItemLevels;
        }

        if (uiFilters?.workflowSteps) {
            conditions['state'] = { [Op.in]: uiFilters?.workflowSteps };
        }

        conditions['"deletedAt"'] = {
            [Op.is]: null,
        };
        conditions['"arrivalDate"'] = {
            [Op.ne]: null,
        };

        if (uiFilters?.assignedTo) {
            conditions['assignedTo'] = { [Op.in]: uiFilters.assignedTo };
        }

        if (uiFilters?.resolution) {
            conditions['resolution'] = { [Op.in]: uiFilters.resolution };
        }

        if (uiFilters?.flagged !== undefined) {
            conditions['flagged'] = uiFilters.flagged;
        }

        return conditions;
    }

    async customFieldPredicates(
        orgId: string,
        stateModel: any,
        uiFilters?: IQueryFilters,
    ) {
        let conditions: any = {};

        const customFieldSubQueries: any[] = await this.customFieldsService.generateSubQueryFilters(
            orgId,
            stateModel,
            uiFilters?.customFields,
        );

        if (customFieldSubQueries.length > 0) {
            conditions = {
                [Op.and]: customFieldSubQueries,
            };
        }

        return conditions;
    }

    async fqlPredicates(
        orgId: string,
        fqlFilter?: FQLFilterModel | string,
    ) {
        let conditions: any = {};

        // should accept fqlParsedQuery also as a string
        const fqlQuery: FQLFilterModel | string | undefined =
            (fqlFilter as FQLFilterModel)?.parsedQuery ?? fqlFilter;
        if (fqlQuery) {
            const newParsedQuery = `(${fqlQuery!})`;
            conditions = {
                [Op.and]: literal(newParsedQuery),
            };
        }

        return conditions;
    }

    /**
     * Get the "removed" items filter if it exists or an empty object if it doesn't
     * @param orgId 
     * @returns 
     */
    async ignoreItemsPredicates(orgId: string, ignoreDiscardedItems: boolean = true): Promise<WhereOptions> {
        const cacheKey = `${orgId}:${ignoreDiscardedItems}`;
        if (this.ignoreItemFilterCache[cacheKey] instanceof Promise) {
            return await this.ignoreItemFilterCache[cacheKey];
        } else if (typeof this.ignoreItemFilterCache[cacheKey] === 'object') {
            return this.ignoreItemFilterCache[cacheKey];
        }

        this.ignoreItemFilterCache[cacheKey] = new Promise(async (resolve, reject) => {
            try {
                const aurora = await this.aurora;
                const filterModel = FQLFilterFactory(aurora);
                const tags = [PredefinedFilterTags.REMOVED];
                if (ignoreDiscardedItems) {
                    tags.push(PredefinedFilterTags.DISCARDED);
                }

                const removedFilters = await filterModel.findAll({
                    where: {
                        orgId,
                        tags,
                        deletedAt: null,
                        parsedQuery: {
                            [Op.not]: ''
                        },
                    } as any,
                } as any);

                let conditions: WhereOptions = {};

                const exclusions = removedFilters.map(
                    filter => filter.parsedQuery
                ).filter(
                    query => query
                );

                if (exclusions.length) {
                    conditions = {
                        [Op.and]: literal(`NOT (${exclusions.join(' OR ')})`),
                    };
                }

                resolve(conditions);
            } catch (err) {
                reject(err);
            }
        });

        this.ignoreItemFilterCache[cacheKey] = await this.ignoreItemFilterCache[cacheKey];

        return this.ignoreItemFilterCache[cacheKey];
    }

    async datePredicates(dateRange: Interval) {
        const fromDate = dateRange.start.toISO();
        const toDate = dateRange.end.toISO();

        let predicates: { [Op.gte]?: string, [Op.lte]?: string; };

        if (fromDate && !toDate) {
            predicates = {
                [Op.gte]: fromDate,
            };
        } else if (!fromDate && toDate) {
            predicates = {
                [Op.lte]: toDate,
            };
        } else {
            predicates = {
                [Op.lte]: toDate,
                [Op.gte]: fromDate,
            };
        }

        return predicates;
    }

    async stateCategoryPredicates(
        stateCategory: StateCategory,
        uiFilters?: IQueryFilters,
        isDelayed?: boolean,
        disableDelayed?: boolean,
    ) {
        let conditions: any = {};

        const filterByDate = uiFilters?.filterByDate;
        const delayedItemsSelection =
            uiFilters?.delayedItemsSelection ?? 'inventory';

        let dateRange: Interval | undefined;

        if (filterByDate) {
            dateRange = await uiFilters?.datePeriod();
        }

        let filterField;

        switch (stateCategory) {
            case StateCategory.COMPLETED:
                filterField = '"departureDate"';

                if (filterByDate) {
                    conditions[filterField] = await this.datePredicates(
                        dateRange!,
                    );
                    conditions['"stateCategory"'] = StateCategory[
                        StateCategory.COMPLETED
                    ].toLowerCase();
                } else {
                    //AND departureDate is not null
                    conditions[filterField] = {
                        [Op.not]: null,
                    };
                }

                break;
            case StateCategory.INPROGRESS:
                if (disableDelayed) {
                    conditions['"stateCategory"'] = StateCategory[
                        StateCategory.INPROGRESS
                    ].toLowerCase();
                } else if ('wip' === delayedItemsSelection) {
                    //when delayedItemsSelection === wip, then delayed items are considered in progress,
                    //which is the natural behaviour of a wip query
                    //noop
                } else if ('inventory' === delayedItemsSelection) {
                    //when delayedItemsSelection === inventory, then delayed items are considered to be inventory,
                    //so we don't want to see items currently in PROPOSED state

                    conditions['"stateCategory"'] = {
                        [Op.not]: StateCategory[
                            StateCategory.PROPOSED
                        ].toLowerCase(),
                    };

                    conditions['"isDelayed"'] = {
                        [Op.eq]: isDelayed ?? false,
                    };
                }

                filterField = '"commitmentDate"';

                if (filterByDate) {
                    conditions[filterField] = await this.datePredicates(
                        dateRange!,
                    );
                } else {
                    conditions['"departureDate"'] = {
                        [Op.is]: null,
                    };

                    //AND commitmentDate is not null AND departureDate is null
                    conditions[filterField] = {
                        [Op.not]: null,
                    };

                    //this may override the delayedItemsSelection above which is ok, because we are forcing IN PROGRESS
                    conditions['"stateCategory"'] = StateCategory[
                        StateCategory.INPROGRESS
                    ].toLowerCase();
                }
                break;
            case StateCategory.PROPOSED:
                if ('wip' === delayedItemsSelection || disableDelayed) {
                    //we do NOT want to see delayed items

                    conditions['"commitmentDate"'] = {
                        [Op.is]: null,
                    };

                    conditions['"departureDate"'] = {
                        [Op.is]: null,
                    };
                } else if ('inventory' === delayedItemsSelection) {
                    //we DO want to see delayed items

                    conditions = {
                        [Op.or]: [
                            {
                                stateCategory: StateCategory[
                                    StateCategory.INPROGRESS
                                ].toLowerCase(),
                                isDelayed: true,
                            },
                            {
                                stateCategory: StateCategory[
                                    StateCategory.PROPOSED
                                ].toLowerCase(),
                            },
                        ],
                    };
                }

                filterField = '"arrivalDate"';

                if (filterByDate) {
                    conditions[filterField] = await this.datePredicates(
                        dateRange!,
                    );
                    conditions['"stateCategory"'] = StateCategory[
                        StateCategory.PROPOSED
                    ].toLowerCase();
                }

                break;
        }

        return conditions;
    }

    attributes(columnNames?: Array<string>) {
        const attributes: any = {};

        if (columnNames && columnNames.length > 0) {
            attributes.attributes = columnNames;
        }

        return attributes;
    }

    async getWorkItemsByStateCategory(
        orgId: string,
        stateCategory?: StateCategory,
        uiFilters?: IQueryFilters,
        fqlFilter?: FQLFilterModel | string,
        columnNames?: string[],
        isDelayed?: boolean,
        disableDelayed?: boolean,
        disabledDiscarded?: boolean,
    ): Promise<StateItem[]> {
        // DEBUG - await new Promise(resolve => setTimeout(resolve, 3000 + 3000 * (typeof stateCategory === 'number' ? stateCategory : 0)))
        if (!orgId || orgId === '') return [];
        //when debugging locally, the output of this function gets mixed up with
        //other callers, so we use a random number in the output logs so that
        //we know which log lines are part of the same invokation
        // const invokationId = Math.floor(Math.random() * 100);

        const aurora = await this.aurora;

        const stateModel = StateModel(aurora);

        const whereStateCategory =
            stateCategory === undefined
                ? {}
                : await this.stateCategoryPredicates(
                    stateCategory,
                    uiFilters,
                    isDelayed,
                    disableDelayed,
                );

        const whereCommon = await this.commonPredicates(orgId, uiFilters);

        const whereCustomFields = await this.customFieldPredicates(
            orgId,
            stateModel,
            uiFilters,
        );

        const whereNormalization = await this.normalizationService.generateFilterQueries(
            uiFilters?.normalization,
        );

        let whereFql: WhereOptions | null = null;

        if (fqlFilter && typeof fqlFilter !== 'string' && fqlFilter.parsedQuery && (fqlFilter.alsoIncludeChildren || fqlFilter.onlyIncludeChildren)) {
            // Special case of FQL filters when the user wants to select children as part or as exclusive result
            const whereFqlOption: WhereOptions = {
                [Op.and]: literal(fqlFilter.parsedQuery),
            };
            // const cacheKey = `${orgId}|${fqlFilter.parsedQuery}|${fqlFilter.onlyIncludeChildren.toString()}${fqlFilter.alsoIncludeChildren.toString()}`;
            let fqlChildQuery = 'false';
            try {
                const list = await stateModel.findAll({
                    attributes: [
                        'workItemId'
                    ],
                    where: {
                        [Op.and]: [
                            whereCommon,
                            whereFqlOption
                        ]
                    },
                });
                const fqlFilterWorkItemList: string[] = list.map(item => `'${item.workItemId}'`);
                if (fqlFilterWorkItemList.length > 0) {
                    fqlChildQuery = `"state"."parentId" IN (${fqlFilterWorkItemList.join(',')})`;
                }
            } catch (err) {
                console.error('Error fetching workitems for FQL in getWorkItemsByStateCategory');
                throw err;
            }

            if (fqlFilter.onlyIncludeChildren) {
                whereFql = {
                    [Op.and]: literal(fqlChildQuery)
                };
            } else if (fqlFilter.alsoIncludeChildren) {
                whereFql = {
                    [Op.or]: [
                        whereFqlOption,
                        literal(fqlChildQuery),
                    ]
                };
            }
        } else {
            whereFql = await this.fqlPredicates(orgId, fqlFilter);
        }

        //disabledDiscarded means, don't filter out discarded items
        const whereRemoved = await this.ignoreItemsPredicates(orgId, !disabledDiscarded);

        const where = {
            [Op.and]: [
                whereCommon,
                whereStateCategory,
                whereCustomFields,
                whereNormalization,
                whereFql,
                whereRemoved,
            ],
        };
        const query: FindOptions = {
            where,
        };

        if (columnNames && columnNames.length) {
            query.attributes = columnNames;
        }

        const workItemResults = await stateModel.findAll(query);

        const workItems: StateItem[] = workItemResults.map(
            (rawStateItem: any) =>
                convertDbModelToStateItem(
                    rawStateItem,
                    (fqlFilter as FQLFilterModel)?.displayName,
                    uiFilters?.clientTimezone,
                ),
        );

        /*
        this.logger.debug(
            `[WorkItemsByStateCategory]: ${StateCategory[stateCategory!]
            } length ${workItems.length}`,
        );
        */

        return workItems;
    }

    async getBlockersAndExpediteFilters(
        filterModel: FQLFilterStatic,
        orgId: string,
    ): Promise<BlockerExpediteFilterQueries> {
        const cacheKey = `getBlockersAndExpediteFilters${orgId}`;
        let filterModelResults: FQLFilterModel[];
        if (this.cache.has(cacheKey)) {
            filterModelResults = await this.cache.get(cacheKey);
        } else {
            const cacher = await this.getCacher(orgId);

            const promise = cacher.model(filterModel as any, ModelNames.FILTERS, orgId).findAll({
                attributes: ['orgId', 'displayName', 'parsedQuery'],
                where: {
                    orgId,
                    deletedAt: null,
                    parsedQuery: {
                        [Op.not]: ''
                    },
                    displayName: {
                        [Op.or]: ['Expedite', 'Blockers'],
                    },
                } as any,
            });
            this.cache.set(cacheKey, promise);
            filterModelResults = await promise;
        }

        const filters = filterModelResults.map(
            ({ displayName, parsedQuery }) => ({
                displayName,
                parsedQuery,
            }),
        );

        const blockersEntry = find(filters, ['displayName', 'Blockers']);
        const expediteEntry = find(filters, ['displayName', 'Expedite']);

        const blockersSelectionClause = blockersEntry?.parsedQuery;
        const expediteSelectionClause = expediteEntry?.parsedQuery;

        return {
            blockersSelectionClause,
            expediteSelectionClause,
        };
    }

    /**
     * Generates SQL predicates for UI filters and selection of specific
     * work items.
     * @param orgId User orgId
     * @param uiFilters Selected user interface filters.
     */
    static getCommonSQLPredicates(
        orgId: string,
        uiFilters?: IQueryFilters,
    ): string[] {
        const format = pgp.as.format;
        const predicates: string[] = [];

        const { workItemTypes, workItemLevels, workflowSteps } = uiFilters ?? {};

        const partitionKeyPredicate = format(
            '"states"."partitionKey" = $<partitionKey>',
            {
                partitionKey: `state#${orgId}`,
            },
        );
        predicates.push(partitionKeyPredicate);

        const deletedAtPredicate = '"states"."deletedAt" IS NULL';
        predicates.push(deletedAtPredicate);

        const arrivalDatePredicate = '"states"."arrivalDate" IS NOT NULL';
        predicates.push(arrivalDatePredicate);

        if (workItemTypes) {
            const workItemTypeCondition: string = format(
                '"flomatikaWorkItemTypeId" = ANY($<workItemTypes>)',
                {
                    workItemTypes,
                },
            );
            predicates.push(workItemTypeCondition);
        }

        if (workItemLevels) {
            const workItemLevelCondition: string = format(
                '"flomatikaWorkItemTypeLevel" = ANY($<workItemLevels>)',
                {
                    workItemLevels,
                },
            );
            predicates.push(workItemLevelCondition);
        }

        if (workflowSteps) {
            const workflowStepsCondition: string = format(
                '"state" = ANY($<workflowSteps>)',
                {
                    workflowSteps,
                },
            );
            predicates.push(workflowStepsCondition);
        }

        const { flagged, resolution, assignedTo } = uiFilters ?? {};

        if (flagged !== undefined && typeof flagged === 'boolean') {
            const flaggedItemsCondition: string = format(
                '"flagged" = $<flagged>',
                {
                    flagged,
                },
            );
            predicates.push(flaggedItemsCondition);
        }
        if (resolution) {
            const resolutionCondition: string = format(
                '"resolution" = ANY($<resolution>)',
                {
                    resolution,
                },
            );
            predicates.push(resolutionCondition);
        }
        if (assignedTo) {
            const assignedToCondition: string = format(
                '"assignedTo" = ANY($<assignedTo>)',
                {
                    assignedTo,
                },
            );
            predicates.push(assignedToCondition);
        }

        return predicates;
    }

    /**
     * Transforms a FQL Filter Model into a SQL predicates list.
     * Might return empty array if there's no FQL query configured.
     * @param fqlFilter The model or the raw string to interpret as SQL.
     */
    static getFqlSQLPredicates(fqlFilter?: FQLFilterModel | string): string[] {
        if (!fqlFilter) {
            return [];
        }

        const isString = (obj: unknown): obj is string =>
            typeof obj === 'string' || obj instanceof String;

        if (isString(fqlFilter)) {
            return [`(${fqlFilter})`];
        }

        if (!fqlFilter.alsoIncludeChildren && !fqlFilter.onlyIncludeChildren) {
            return [`(${fqlFilter.parsedQuery})`];
        }

        const fqlQuery: string | undefined = isString(fqlFilter)
            ? fqlFilter
            : fqlFilter?.parsedQuery;

        return [`(${fqlQuery})`];
    }

    static isInternalDateField(
        fieldName: unknown,
    ): fieldName is InternalDateField {
        const validDateFields = [
            'arrivalDate',
            'commitmentDate',
            'departureDate',
        ];

        const isValidField: boolean = isString(fieldName)
            ? validDateFields.includes(fieldName)
            : false;

        return isValidField;
    }

    /**
     * Generates a SQL predicate to verify if work items were in
     * a state category during the specified date interval. State category
     * determined by provided date field names.
     * @param joinDateFieldName Name of the date field that indicates when the
     * item joined the state category.
     * @param leaveDateFieldName Name of the date field that indicates when the
     * item left the state category (if any).
     * @param startDate ISO 8601 representation of time interval start.
     * @param endDate ISO 8601 representation of time interval end.
     */
    static getWasInCategoryPredicates(
        joinDateFieldName: InternalDateField,
        leaveDateFieldName: InternalDateField | undefined,
        startDate: string,
        endDate: string,
    ): string {
        const format = pgp.as.format;

        const predicates: string[] = [];

        // Check if item entered the category before end of interval
        const joinedBeforeEnd: string = format(
            `("$<joinDateFieldName:value>" IS NOT NULL
            AND "$<joinDateFieldName:value>" < $<endDate>)`,
            {
                joinDateFieldName,
                endDate,
            },
        );
        predicates.push(joinedBeforeEnd);

        // Check if item left category only after start of interval
        if (leaveDateFieldName) {
            const leftAfterStart: string = format(
                `("$<leaveDateFieldName:value>" IS NULL
                OR "$<leaveDateFieldName:value>" >= $<startDate>)`,
                {
                    leaveDateFieldName,
                    startDate,
                },
            );

            predicates.push(leftAfterStart);
        }

        const jointPredicate: string = predicates.join('\nAND ');

        return jointPredicate;
    }

    /**
     * Generates a SQL predicate to verify if work items entered a state
     * category during the specified date interval. State category determined
     * by provided date field names.
     * @param joinDateFieldName Name of the date field that indicates when the
     * item joined the state category.
     * @param startDate ISO 8601 representation of time interval start.
     * @param endDate ISO 8601 representation of time interval end.
     */
    static getBecameCategoryPredicates(
        joinDateFieldName: InternalDateField,
        startDate: string,
        endDate: string,
    ): string | undefined {
        const format = pgp.as.format;

        const predicates: string[] = [];

        if (startDate) {
            // Check if item entered category after start of interval
            const dateIsPastStart: string = format(
                '("$<joinDateFieldName:value>" >= $<startDate>)',
                {
                    joinDateFieldName,
                    startDate,
                },
            );

            predicates.push(dateIsPastStart);
        }

        if (endDate) {
            // Check if item entered category before end of interval
            const dateIsBeforeEnd: string = format(
                '("$<joinDateFieldName:value>" < $<endDate>)',
                {
                    joinDateFieldName,
                    endDate,
                },
            );

            predicates.push(dateIsBeforeEnd);
        }

        const jointPredicate =
            predicates.length > 0 ? predicates.join('\nAND ') : undefined;

        return jointPredicate;
    }

    /**
     * Generates a SQL predicate to constrain results to a specified date
     * range. Allows caller to select either items that entered the state
     * category during the period (default) or that were in the state category
     * during the period. Returns undefined for date interval with no valid
     * start and end dates.
     * @param dateRange Date interval to apply.
     * @param joinDateFieldName Name of the date field that indicates when the
     * item joined the state category.
     * @param leaveDateFieldName Name of the date field that indicates when the
     * item left the state category (if any).
     * @param dateAnalysisActive If true, returns items that were in
     * the state category during the specified period. If false (default),
     * returns items that entered the state category during the period.
     */
    static getDateSQLPredicates(
        dateRange: Interval,
        joinDateFieldName: InternalDateField,
        leaveDateFieldName?: InternalDateField,
        dateAnalysisOption?: DateAnalysisOptions,
    ): string | undefined {
        if (
            !dateRange.start ||
            !dateRange.end ||
            dateRange.start.invalidReason ||
            dateRange.end.invalidReason
        ) {
            throw new Error('Invalid date interval');
        }

        // Validation due to Sensitive SQL String
        const { isInternalDateField } = WorkItemQueries;

        const isJoinDateFieldValid: boolean = isInternalDateField(
            joinDateFieldName,
        );
        const isLeaveDateFieldValid: boolean =
            leaveDateFieldName === undefined
                ? true
                : isInternalDateField(leaveDateFieldName);

        if (!isJoinDateFieldValid || !isLeaveDateFieldValid) {
            throw new Error(
                `Invalid values for date fields. Got join field of type 
                "${typeof joinDateFieldName}" and leave field of type
                "${typeof leaveDateFieldName}"`,
            );
        }

        const from = dateRange.start.toISO();
        const to = dateRange.end.toISO();

        if (!from || !to) {
            return undefined;
        }

        switch (dateAnalysisOption) {
            case DateAnalysisOptions.became:
                return WorkItemQueries.getBecameCategoryPredicates(
                    joinDateFieldName,
                    from,
                    to,
                );
            case DateAnalysisOptions.was:
                return WorkItemQueries.getWasInCategoryPredicates(
                    joinDateFieldName,
                    leaveDateFieldName,
                    from,
                    to,
                );
            case DateAnalysisOptions.all:
            //allow fall through to below
            default:
                //no date predicates needed
                return undefined;
        }
    }

    /**
     * Generates SQL predicates for restricting work items to the "Completed"
     * state category. Also supports filtering by date.
     * @param filterByDate Whether date filter should be applied.
     * @param dateRange Date interval for filtering work items.
     * @param dateAnalysisActive If true, returns items that were in
     * "Completed" during the specified period. If false (default), returns
     * items that entered "Completed" during the specified period.
     */
    static getCompletedCategoryPredicates(
        filterByDate?: boolean,
        dateRange?: Interval,
        dateAnalysisOption?: DateAnalysisOptions,
    ): string {
        const predicates: string[] = [];
        const joinDateFieldName: InternalDateField = 'departureDate';

        const completedCategoryName: string = StateCategory[
            StateCategory.COMPLETED
        ].toLowerCase();

        if (filterByDate && dateRange) {
            // Date Range Condition
            const dateRangeCondition = WorkItemQueries.getDateSQLPredicates(
                dateRange,
                joinDateFieldName,
                undefined,
                dateAnalysisOption,
            );
            if (dateRangeCondition) {
                predicates.push(dateRangeCondition);
            }

            // In Completed Category Condition
            const completedCondition: string = pgp.as.format(
                '"stateCategory" = $<completedCategoryName>',
                {
                    completedCategoryName,
                },
            );
            predicates.push(completedCondition);
        } else {
            // Non-Null Departure Date Condition
            const completedDateCondition = '"departureDate" IS NOT NULL';
            predicates.push(completedDateCondition);
        }

        const isolatedPredicates: string[] = predicates.map(
            (predicate) => `(${predicate})`,
        );
        const jointPredicates: string = isolatedPredicates.join('\nAND ');

        return jointPredicates;
    }

    /**
     * Generates SQL predicates for restricting work items to the "In Progress"
     * state category. Also supports filtering by date.
     * @param delayedItemsSelection Setting that defines to which category
     * delayed items belong. Accepts values 'wip' or 'inventory'.
     * @param filterByDate Whether date filter should be applied.
     * @param dateRange Date interval for filtering work items.
     * @param dateAnalysisActive If true, returns items that were in
     * "In Progress" during the specified period. If false (default), returns
     * items that entered "In Progress" during the specified period.
     */
    static getInProgressCategoryPredicates(
        delayedItemsSelection: string,
        filterByDate?: boolean,
        dateRange?: Interval,
        dateAnalysisOption?: DateAnalysisOptions,
    ): string {
        const format = pgp.as.format;

        const predicates: string[] = [];
        const joinDateFieldName: InternalDateField = 'commitmentDate';
        const leaveDateFieldName: InternalDateField = 'departureDate';

        const proposedCategoryName: string = StateCategory[
            StateCategory.PROPOSED
        ].toLowerCase();
        const inProgressCategoryName: string = StateCategory[
            StateCategory.INPROGRESS
        ].toLowerCase();

        // Decide to which state category delayed items belong
        let excludeProposed = false;
        if (delayedItemsSelection === 'wip') {
            // Delayed items are part of the "In Progress" state category.
            // Default behavior.
            if (dateAnalysisOption !== 'became' && dateAnalysisOption !== 'was') {
                // Only add the state category when the user is not trying to retrieve
                // data from the past because state category will ALWAYS have the
                // present state so if the user wants data from the date range he selected 
                // the state category cannot be on the query.
                const inProgressCondition: string = format(
                    '"stateCategory" = $<inProgressCategoryName>',
                    {
                        inProgressCategoryName,
                    },
                );
                predicates.push(inProgressCondition);
            }
        } else if (delayedItemsSelection === 'inventory') {
            // Delayed items are part of the "Proposed" state category.
            // Hence, they must be removed.

            let inProgressNoDelayedCondition: string;
            if (dateAnalysisOption === 'became' || dateAnalysisOption === 'was') {
                // Remove state category when user is selecting date analysis "became"
                // because the present value saved there does not matter in this case.
                inProgressNoDelayedCondition = format(`"isDelayed" = false`);
            } else {
                inProgressNoDelayedCondition = format(
                    `"stateCategory" = $<inProgressCategoryName>
                    AND
                    "isDelayed" = false`,
                    {
                        inProgressCategoryName,
                    },
                );
            }
            predicates.push(inProgressNoDelayedCondition);

            // Not in Proposed Category Condition
            excludeProposed = true;
        }

        if (filterByDate && dateRange) {
            // Date Range Condition
            const dateRangeCondition = WorkItemQueries.getDateSQLPredicates(
                dateRange,
                joinDateFieldName,
                leaveDateFieldName,
                dateAnalysisOption,
            );
            if (dateRangeCondition) {
                predicates.push(dateRangeCondition);
            }
        } else {
            //AND commitmentDate is not null AND departureDate is null
            const proposedDateConditions = `
                "departureDate" IS NULL
                AND "commitmentDate" IS NOT NULL
            `;
            predicates.push(proposedDateConditions);

            //this may override the delayedItemsSelection above which is ok, because we are forcing IN PROGRESS
            excludeProposed = false;
        }

        if (excludeProposed) {
            const notProposedCondition: string = format(
                '"stateCategory" != $<proposedCategoryName>',
                {
                    proposedCategoryName,
                },
            );
            predicates.push(notProposedCondition);
        }

        const isolatedPredicates: string[] = predicates.map(
            (predicate) => `(${predicate})`,
        );
        const jointPredicates: string = isolatedPredicates.join('\nAND ');

        return jointPredicates;
    }

    /**
     * Generates SQL predicates for restricting work items to the "Proposed"
     * state category. Also supports filtering by date.
     * @param delayedItemsSelection Setting that defines to which category
     * delayed items belong. Accepts values 'wip' or 'inventory'.
     * @param filterByDate Whether date filter should be applied.
     * @param dateRange Date interval for filtering work items.
     * @param dateAnalysisActive If true, returns items that were in
     * "Proposed" during the specified period. If false (default), returns
     * items that entered "Proposed" during the specified period.
     */
    static getProposedCategoryPredicates(
        delayedItemsSelection: string,
        filterByDate?: boolean,
        dateRange?: Interval,
        dateAnalysisOption?: DateAnalysisOptions,
    ): string {
        const format = pgp.as.format;

        const predicates: string[] = [];
        const joinDateFieldName: InternalDateField = 'arrivalDate';
        const leaveDateFieldName: InternalDateField = 'commitmentDate';

        const proposedCategoryName: string = StateCategory[
            StateCategory.PROPOSED
        ].toLowerCase();
        const inProgressCategoryName: string = StateCategory[
            StateCategory.INPROGRESS
        ].toLowerCase();

        // Decide to which state category delayed items belong
        if (delayedItemsSelection === 'wip') {
            // Delayed items are part of "In Process".
            // Default behavior.
            const proposedCondition: string = format(
                '"stateCategory" = $<proposedCategoryName>',
                {
                    proposedCategoryName,
                },
            );
            predicates.push(proposedCondition);

            const proposedDateConditions = `
                "commitmentDate" IS NULL
                AND "departureDate" IS NULL
            `;
            predicates.push(proposedDateConditions);
        } else if (delayedItemsSelection === 'inventory') {
            // Delayed items are part of "Proposed".
            // Must include them as well.

            const inventoryDelayedItemsCondition = format(
                `(
                    "stateCategory" = $<inProgressCategoryName> 
                    AND "isDelayed" = true
                )
                OR
                (
                    "stateCategory" = $<proposedCategoryName>
                )`,
                {
                    inProgressCategoryName,
                    proposedCategoryName,
                },
            );
            predicates.push(inventoryDelayedItemsCondition);
        }

        if (filterByDate && dateRange) {
            // Date Range Condition
            const dateRangeCondition = WorkItemQueries.getDateSQLPredicates(
                dateRange,
                joinDateFieldName,
                leaveDateFieldName,
                dateAnalysisOption,
            );
            if (dateRangeCondition) {
                predicates.push(dateRangeCondition);
            }
        }

        const isolatedPredicates: string[] = predicates.map(
            (predicate) => `(${predicate})`,
        );
        const jointPredicates: string = isolatedPredicates.join('\nAND ');

        return jointPredicates;
    }

    /**
     * Generates SQL predicates for restricting work items to a particular
     * group of state categories. Also supports filtering by date.
     * @param stateCategories Selected work item state categories.
     * @param uiFilters Selected user interface filters.
     */
    static async getStateCategorySQLPredicates(
        stateCategories: StateCategory[],
        uiFilters?: IQueryFilters,
    ): Promise<string[]> {
        const filterByDate = uiFilters?.filterByDate;

        // Determines to which category delayed items belong
        const delayedItemsSelection =
            uiFilters?.delayedItemsSelection ?? 'inventory';

        const dateRange: Interval | undefined = filterByDate
            ? await uiFilters?.datePeriod()
            : undefined;

        const categoryPredicates = stateCategories.map((stateCategory) => {
            switch (stateCategory) {
                case StateCategory.COMPLETED:
                    return WorkItemQueries.getCompletedCategoryPredicates(
                        filterByDate,
                        dateRange,
                        uiFilters?.dateAnalysisOption,
                    );
                case StateCategory.INPROGRESS:
                    return WorkItemQueries.getInProgressCategoryPredicates(
                        delayedItemsSelection,
                        filterByDate,
                        dateRange,
                        uiFilters?.dateAnalysisOption,
                    );
                case StateCategory.PROPOSED:
                    return WorkItemQueries.getProposedCategoryPredicates(
                        delayedItemsSelection,
                        filterByDate,
                        dateRange,
                        uiFilters?.dateAnalysisOption,
                    );
                default:
                    return [];
            }
        });

        if (categoryPredicates.length === 0) {
            return [];
        }

        const isolatedPredicates: string[] = categoryPredicates.map(
            (predicate) => `(${predicate})`,
        );
        const jointPredicates: string = isolatedPredicates.join('\nOR ');

        return [jointPredicates];
    }

    /**
     * Generates SQL predicates for custom field selection.
     * @param orgId Organization ID in the database.
     * @param model Sequelize model with custom fields column.
     * @param uiFilters Selected user interface filters.
     */
    async getCustomFieldSQLPredicates(
        orgId: string,
        model: typeof Model,
        uiFilters?: IQueryFilters,
    ): Promise<string[]> {
        const customFieldPredicates: string[] = await this.customFieldsService.generateSubQueryFiltersSQL(
            orgId,
            model,
            uiFilters?.customFields,
        );

        return customFieldPredicates;
    }

    /**
     * Fetches the "removed" items filters from the database and generates
     * corresponding SQL predicates.
     * 
     * Discarded items are ignored by default. If ignoreDiscardedItems is false, discarded items WILL NOT be ignore
     * 
     * The "removed" and "discarded" items settings is configured for each organization on the
     * wizard.
     * Retuns an empty array if its not configured or empty.
     * @param orgId
     * @param  ignoreDiscardedItems if true, the items in discarded state are ignored
     */
    async getIgnoreItemsSQLPredicates(orgId: string, ignoreDiscardedItems?: boolean): Promise<string[]> {

        // If ignoreDiscardedItems is undefined, 
        // Set the value as  true (true by default) - Exclude discarded items by default
        // Else use the value of ignoreDiscardedItems
        ignoreDiscardedItems = ignoreDiscardedItems ?? true;
        const orClause = {
            [Op.or]:
                ignoreDiscardedItems
                    ? [
                        PredefinedFilterTags.REMOVED,
                        PredefinedFilterTags.DISCARDED
                    ]
                    : [
                        PredefinedFilterTags.REMOVED,
                    ]
        };
        const cacheKey = `getIgnoreItemsSQLPredicates#${orgId}#${ignoreDiscardedItems}`;
        let filters: FQLFilterModel[];
        if (this.cache.has(cacheKey)) {
            filters = await this.cache.get(cacheKey);
        } else {
            const fn = async () => {
                const aurora = await this.aurora;
                const filterModel = FQLFilterFactory(aurora);
                return filterModel.findAll({
                    where: {
                        orgId,
                        tags: orClause,
                        deletedAt: null,
                        parsedQuery: {
                            [Op.not]: ''
                        },
                    } as any,
                });
            };
            const promise = fn();
            this.cache.set(cacheKey, promise);
            filters = await promise;
        }

        if (!filters) {
            return [];
        }
        const filtersStr = filters.map(f => `NOT (${f.parsedQuery})`);
        return filtersStr;
    }

    /**
     * Generates SQL predicates for general work item retrieval taking into
     * account UI and FQL filters. Returns predicates as string array.
     * @param orgId
     * @param model Sequelize model with custom fields column.
     * @param uiFilters Selected user interface filters.
     * @param fqlFilter Selected FQL filters.
     */
    async getGeneralSQLPredicates(
        orgId: string,
        model: typeof Model,
        uiFilters?: IQueryFilters,
        fqlFilter?: FQLFilterModel | string,
        ignoreDiscardedItems?: boolean
    ): Promise<string[]> {
        // Generate SQL Predicates for Query
        const commonPredicates: string[] = WorkItemQueries.getCommonSQLPredicates(
            orgId,
            uiFilters,
        );
        let fqlPredicates: string[] = WorkItemQueries.getFqlSQLPredicates(
            fqlFilter,
        );

        if (fqlFilter && typeof fqlFilter !== 'string' && fqlFilter.parsedQuery && (fqlFilter.alsoIncludeChildren || fqlFilter.onlyIncludeChildren)) {
            // Special case of FQL filters when the user wants to select children as part or as exclusive result
            // false by default. 
            let fqlChildQuery = 'false';

            try {
                const conditionList = [literal(fqlFilter.parsedQuery)];
                for (let predicate of commonPredicates) {
                    conditionList.push(literal(predicate));
                }
                const cacher = await this.getCacher(orgId);
                const list: StateItem[] = await cacher.model(model as any, ModelNames.STATES, orgId).findAll({
                    attributes: [
                        'workItemId'
                    ],
                    where: {
                        partitionKey: `state#${orgId}`,
                        [Op.and]: conditionList
                    }
                });
                const fqlFilterWorkItemList: string[] = list.map(item => `'${item.workItemId}'`);
                // If the length of the work items is zero, the predicate is false

                if (fqlFilterWorkItemList.length > 0) {
                    fqlChildQuery = `"states"."parentId" IN (${fqlFilterWorkItemList.join(',')})`;
                }
            } catch (err) {
                console.error('Error fetching workitems for FQL in getGeneralSQLPredicates');
                throw err;
            }

            if (fqlFilter.onlyIncludeChildren) {
                fqlPredicates = [
                    fqlChildQuery
                ];
            } else if (fqlFilter.alsoIncludeChildren) {
                fqlPredicates = [
                    `((${fqlFilter.parsedQuery}) OR ${fqlChildQuery})`
                ];
            }
        }

        const customFieldsPredicatesPromise = this.getCustomFieldSQLPredicates(
            orgId,
            model,
            uiFilters,
        );

        const normalizationPredicatesPromise = this.normalizationService.generateFilterQueriesSQL(
            uiFilters?.normalization,
        );

        const removedItemsPredicatesPromise = this.getIgnoreItemsSQLPredicates(
            orgId, ignoreDiscardedItems
        );

        const [
            customFieldsPredicates,
            normalizationPredicates,
            removedItemsPredicates,
        ] = await Promise.all([
            customFieldsPredicatesPromise,
            normalizationPredicatesPromise,
            removedItemsPredicatesPromise,
        ]);

        const allPredicates: string[] = flatten([
            commonPredicates,
            fqlPredicates,
            customFieldsPredicates,
            normalizationPredicates,
            removedItemsPredicates,
        ]);

        return allPredicates;
    }

    /**
     * Formats DB column names for SQL SELECT query.
     * Does not filter the possible columns because it cannot know what's in the response
     * @param selectedColumns
     */
    static preprocessDbColumnNames(selectedColumns: string[]): string {
        const retrievedColumns: string[] = selectedColumns;

        const processedColumns = retrievedColumns.map(
            (column) => `"${column}"`,
        );

        return processedColumns.join(', ');
    }

    static buildRetrievalQuery(
        {
            orgId,
            predicates,
            blockersSelectionClause,
            expediteSelectionClause,
            contextIdList,
            sprintIdList,
            timezone,
            dateStart,
            dateEnd,
            columnNames,
            useSnapshotsData,
            includeArrivalPoint,
            workItemIdListToFilter,
            excludeWeekends = false
        }: {
            orgId: string;
            predicates: string[];
            blockersSelectionClause: string | undefined;
            expediteSelectionClause: string | undefined;
            contextIdList: string[];
            sprintIdList?: string[];
            timezone: string;
            dateStart?: DateTime;
            dateEnd?: DateTime;
            columnNames?: string[];
            useSnapshotsData?: boolean;
            includeArrivalPoint?: boolean;
            workItemIdListToFilter?: string[];
            excludeWeekends?: boolean;
        },
    ): string {
        // Retrieved Columns
        const primaryColumns: string =
            columnNames && columnNames.length > 0
                ? WorkItemQueries.preprocessDbColumnNames(columnNames)
                : '"states".*';
        const blockersCondition: string = blockersSelectionClause ?? 'NULL';
        const expediteCondition: string = expediteSelectionClause ?? 'NULL';

        // WHERE clause
        const isolatedPredicates: string[] = predicates.map(
            (predicate) => `(${predicate})`,
        );

        timezone = validateTzOrUTC(timezone);

        const jointPredicates: string = isolatedPredicates.join('\nAND ');
        const whereClause: string =
            predicates.length > 0 ? `WHERE ${jointPredicates}` : '';

        let fnName;
        if (useSnapshotsData) {
            fnName = 'get_extended_state_items';
        } else {
            fnName = 'get_extended_state_items_without_snapshots';
        }

        // Main Query
        const query: string = pgp.as.format(
            // TODO: Check if DB optimizes - Selecting all cols in function vs selecting some cols in the
            `SELECT
                $<primaryColumns:value>,
                $<blockersCondition:raw> AS "isBlocked",
                $<expediteCondition:raw> AS "isExpedited"
                FROM ${fnName}($<orgId>, $<contextIdList>, $<sprintIdList>, $<workItemIdList>, $<includeArrivalPoint>, $<dateStart>, $<dateEnd>, $<timezone>, $<excludeWeekends>) AS "states"
            $<whereClause:raw>`,
            {
                primaryColumns,
                blockersCondition,
                expediteCondition,
                orgId,
                whereClause,
                contextIdList,
                sprintIdList,
                includeArrivalPoint,
                dateStart,
                dateEnd,
                timezone,
                excludeWeekends,
                workItemIdList: workItemIdListToFilter ? workItemIdListToFilter : null,
            },
        );

        return query;
    }

    static buildSnapshotsRetrievalQuery(
        { orgId, timezone, workItemIds, workItemTypeList, startDate, endDate, columnNames }: {
            orgId: string;
            timezone: string;
            workItemIds?: string[];
            workItemTypeList?: string[];
            startDate?: DateTime;
            endDate?: DateTime;
            /**
             * Using `:raw` in the code, so don't
             * use column names from user input here
             */
            columnNames?: string[];
        },
    ): string {
        // Using the columns without pre-processing them like in `preprocessDbColumnNames`. Using `:raw` in the query param. 
        // Do not pass user input directly as columnNames
        const primaryColumns = columnNames?.join(', ') ?? '*';
        timezone = validateTzOrUTC(timezone);

        // Main Query
        const query: string = pgp.as.format(
            // TODO: raw is not safe
            `SELECT 
                $<primaryColumns:raw>
                FROM get_snapshots($<orgId>, $<timezone>, $<workItemIdList>, $<workItemTypeList>, $<startDate>, $<endDate>)`,
            {
                primaryColumns,
                orgId,
                timezone,
                workItemIdList: workItemIds,
                workItemTypeList,
                startDate: startDate?.toISO().toString(),
                endDate: endDate?.toISO().toString(),
            },
        );

        return query;
    }

    /**
     * @deprecated
     */
    static buildTreatedSnapshotsRetrievalQuery(
        { orgId, timezone, workItemIds, contextIdList, startDate, endDate, columnNames, arrivalPoint }: {
            orgId: string;
            timezone: string;
            workItemIds?: string[];
            contextIdList?: string[];
            startDate?: DateTime;
            endDate?: DateTime;
            columnNames?: string[];
            arrivalPoint?: boolean;
        },
    ): string {
        // Using the columns without pre-processing them like in `preprocessDbColumnNames`. Using `:raw` in the query param. 
        // Do not pass user input directly as columnNames
        const primaryColumns = columnNames?.join(', ') ?? '*';
        timezone = validateTzOrUTC(timezone);

        // Main Query
        const query: string = pgp.as.format(
            // TODO: raw is not safe
            ` -- get historical 
            SELECT 
                $<primaryColumns:raw>
                FROM get_extended_state_items($<orgId>, $<contextIdList>, null, $<workItemIdList>, 
                    $<arrivalPoint>, $<startDate>, $<endDate>, $<timezone>)`,
            {
                primaryColumns,
                orgId,
                contextIdList,
                workItemIdList: workItemIds,
                arrivalPoint,
                startDate: startDate?.toISO().toString(),
                endDate: endDate?.toISO().toString(),
                timezone,
            },
        );

        return query;
    }

    async getContextIdsForExtendedItems(
        orgId: string,
        contextId?: string,
    ): Promise<string[]> {

        type ContextModelRow = {
            datasourceId: string;
            contextId: '90aebd18-7355-45d5-8558-d82684bfd7ba' | string;
            positionInHierarchy: '1.3.2' | string;
            contextAddress: '12065' | string;
        };

        let contextIdsForOrg: ContextModelRow[];
        const cacheKey = `getContextIdsForExtendedItems#${orgId}#${contextId}`;
        if (this.cache.has(cacheKey)) {
            contextIdsForOrg = await this.cache.get(cacheKey);
        } else {
            const fn = async () => {
                const aurora = await this.aurora;
                const cacher = await this.getCacher(orgId);

                const contextModel = await ContextModel(aurora);

                return cacher
                    .model(contextModel as any, ModelNames.CONTEXTS, orgId)
                    .findAll({
                        attributes: [
                            'datasourceId',
                            'contextId',
                            'positionInHierarchy',
                            'contextAddress',
                        ],
                        where: {
                            orgId,
                        } as any,
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

        // Append the dot to exclude this parent item from the find below
        let positionHierarchyPrefix = thisContext.positionInHierarchy + '.';
        // Handle the top level "All" context as a special case
        // Set the prefix to be blank so that startsWith filter matches all contexts
        if (thisContext.positionInHierarchy === '0') {
            positionHierarchyPrefix = '';
        }

        const selectedContexts = contextIdsForOrg.filter((context) => {
            // Remove datasource mismatch
            if (context.datasourceId !== thisContext.datasourceId) {
                return false;
            }
            // Remove prefix mismatch
            if (
                !context.positionInHierarchy.startsWith(positionHierarchyPrefix)
            ) {
                return false;
            }
            return true;
        });

        return selectedContexts.map((context) => context.contextId);
    }

    /**
     * Fetches work item ids regardless of state category or date
     * @param orgId
     * @param filters
     * @returns string list
     */
    async getWorkItemIdsUsingPredicates(
        orgId: string,
        filters: IQueryFilters,
        ignoreDiscardedItems?: boolean
    ): Promise<string[]> {
        const aurora = await this.aurora;

        const contextId = filters?.getContextId();

        const contextIdList: string[] = await this.getContextIdsForExtendedItems(
            orgId,
            contextId,
        );

        const stateModel = StateModel(aurora);

        // Generate SQL Predicates for Query
        const predicates = await this.getGeneralSQLPredicates(
            orgId,
            stateModel,
            filters,
            undefined,
            ignoreDiscardedItems
        );

        // Partition Key Settings
        const selectedPartitionKey: string = `state#${orgId}`;

        // WHERE clause
        const isolatedPredicates: string[] = predicates.map(
            (predicate) => `(${predicate})`,
        );
        const jointPredicates: string = isolatedPredicates.join('\nAND ');
        const whereClause: string =
            predicates.length > 0 ? `WHERE ${jointPredicates}` : '';

        // Main Query
        const query: string = pgp.as.format(
            `SELECT "states"."workItemId"
                FROM "states"
            ${contextId
                ? `INNER JOIN "contextWorkItemMaps"
                    ON "contextWorkItemMaps"."workItemId" = "states"."workItemId"
                    AND "contextWorkItemMaps"."contextId" = ANY($<contextIdList>)`
                : ''
            }
            $<whereClause:raw>`,
            {
                orgId,
                selectedPartitionKey,
                whereClause,
                contextIdList,
            },
        );

        const cacher = await this.getCacher(orgId);

        const workItemResults = await cacher.query(query, {
            type: QueryTypes.SELECT,
        });

        return workItemResults.map((workItem: any) => workItem.workItemId);
    }

    private async getWorkItemIds(orgId: string, predicates: string[], contextIdList: string[] = []): Promise<string[] | undefined> {
        try {
            const isolatedPredicates: string[] = predicates.map(
                (predicate) => `(${predicate})`,
            );
            const jointPredicates: string = isolatedPredicates.join('\nAND ');
            const whereClause: string =
                predicates.length > 0 ? jointPredicates : '';

            let contextIdsPredicate = '';
            if (contextIdList.length > 0) {
                const contextIdsStr = contextIdList.map(c => `'${c}'`).join(',');
                contextIdsPredicate = `and cwim."contextId" in (${contextIdsStr})`;
            }

            const workItemIdsQuery = `
                select 
                    "states"."workItemId" 
                from states 
                join "contextWorkItemMaps" cwim on
                    "states"."workItemId" = cwim."workItemId" and 
                    "states"."partitionKey" = 'state#' || cwim."orgId" and 
                    cwim."orgId" = '${orgId}' and 
                    "states"."partitionKey" = 'state#${orgId}'
                    ${contextIdsPredicate}
                where ${whereClause}
            `;

            const cacher = await this.getCacher(orgId);
            const workItemsResult: any[] = await cacher.query(workItemIdsQuery, {
                type: QueryTypes.SELECT,
            });
            return workItemsResult?.map(r => r.workItemId);
        } catch (e) {
            this.logger.error(JSON.stringify({
                message: 'Error in getWorkItemIds',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            }));
            return undefined;
        }
    }

    /**
     * Retrieves extended state items by state category from the database.
     * Extended work items contain data from all of the columns of the states
     * table, as well a number of useful new columns derived from other tables.
     * @param orgId Organization ID in the database.
     * @param stateCategories State categories to retrieve. If none, fetches
     * all.
     * @param uiFilters User interface filters.
     * @param fqlFilter Flomatika Query Language filters.
     * @param columnNames Database columns to retrieve.
     * @param ignoreDiscardedItems Ignore discarded items
     * @returns Work items that match the selected options.
     */
    async getExtendedWorkItemsByStateCategory(
        {
            orgId,
            stateCategories,
            uiFilters,
            fqlFilter,
            columnNames,
            isDelayed,
            ignoreDiscardedItems,
            useSnapshotsData
        }: GetExtendedWorkItemsByStateCategoryParams
    ): Promise<ExtendedStateItem[]> {
        const aurora = await this.aurora;

        const contextId = uiFilters?.getContextId();

        const contextIdList: string[] = await this.getContextIdsForExtendedItems(
            orgId,
            contextId,
        );

        const extendedStateModel = ExtendedStateModel(aurora);
        const filterModel = FQLFilterFactory(aurora);

        const selectionQueriesPromise = this.getBlockersAndExpediteFilters(
            filterModel,
            orgId,
        );

        // Generate SQL Predicates for Query
        const generalPredicatesPromise = this.getGeneralSQLPredicates(
            orgId,
            extendedStateModel,
            uiFilters,
            fqlFilter,
            ignoreDiscardedItems
        );

        const stateCategoryPredicatesPromise =
            stateCategories && stateCategories.length > 0
                ? WorkItemQueries.getStateCategorySQLPredicates(
                    stateCategories,
                    uiFilters,
                )
                : [];

        const [
            generalPredicates,
            stateCategoryPredicates,
            { blockersSelectionClause, expediteSelectionClause },
        ] = await Promise.all([
            generalPredicatesPromise,
            stateCategoryPredicatesPromise,
            selectionQueriesPromise,
        ]);

        const predicates = generalPredicates.concat(stateCategoryPredicates);
        const workItemIds = await this.getWorkItemIds(orgId, predicates, contextIdList);
        const interval = await uiFilters?.datePeriod();
        const excludeWeekends = !!(await uiFilters?.getExcludeWeekendsSetting(orgId));

        const query: string = WorkItemQueries.buildRetrievalQuery({
            orgId,
            predicates,
            blockersSelectionClause,
            expediteSelectionClause,
            contextIdList,
            timezone: uiFilters?.clientTimezone ?? TIMEZONE_UTC,
            dateStart: interval?.start,
            dateEnd: interval?.end,
            columnNames,
            useSnapshotsData,
            workItemIdListToFilter: workItemIds,
            excludeWeekends
        });


        const cacher = await this.getCacher(orgId);
        const workItemResults = await cacher.query(query, {
            type: QueryTypes.SELECT,
        });

        const workItems: ExtendedStateItem[] = workItemResults.map(
            (stateDbItem: unknown) =>
                convertDbResultToExtendedStateItem(
                    stateDbItem,
                    (fqlFilter as FQLFilterModel)?.displayName,
                    uiFilters?.clientTimezone,
                ),
        );

        const stateCategoriesNames = stateCategories
            ? stateCategories.map((category) => StateCategory[category])
            : undefined;

        this.logger.debug(
            `[WorkItemsByStateCategory]: ${stateCategoriesNames} length ${workItems.length}`,
        );

        return workItems;
    }

    async getExtendedItemDetails(
        {
            orgId,
            uiFilters,
            workItemId
        }: GetExtendedStateItemDetailsParams
    ): Promise<ExtendedStateItem[]> {
        const aurora = await this.aurora;

        const contextId = uiFilters?.getContextId();
        const contextIdList: string[] = await this.getContextIdsForExtendedItems(
            orgId,
            contextId,
        );
        const filterModel = FQLFilterFactory(aurora);
        const { blockersSelectionClause, expediteSelectionClause } = await this.getBlockersAndExpediteFilters(
            filterModel,
            orgId,
        );
        const interval = await uiFilters?.datePeriod();
        const excludeWeekends = !!(await uiFilters?.getExcludeWeekendsSetting(orgId));
        const blockersCondition: string = blockersSelectionClause ?? 'NULL';
        const expediteCondition: string = expediteSelectionClause ?? 'NULL';
        try {
            const query: string = pgp.as.format(
                // TODO: Check if DB optimizes - Selecting all cols in function vs selecting some cols in the
                `SELECT
                "states".*,
                $<blockersCondition:raw> AS "isBlocked",
                $<expediteCondition:raw> AS "isExpedited"
                FROM get_extended_state_items($<orgId>, $<contextIdList>, $<sprintIdList>, $<workItemIdList>, $<includeArrivalPoint>, $<dateStart>, $<dateEnd>, $<timezone>, $<excludeWeekends>) AS "states"`,
                {
                    blockersCondition,
                    expediteCondition,
                    orgId,
                    contextIdList,
                    sprintIdList: [''],
                    workItemIdList: [workItemId],
                    includeArrivalPoint: false,
                    dateStart: interval?.start,
                    dateEnd: interval?.end,
                    timezone: uiFilters?.clientTimezone ?? TIMEZONE_UTC,
                    excludeWeekends
                },
            );

            const cacher = await this.getCacher(orgId);

            const workItemResults = await cacher.query(query, {
                type: QueryTypes.SELECT,
                logging: console.log
            });

            const workItems: ExtendedStateItem[] = workItemResults.map(
                (stateDbItem: unknown) =>
                    convertDbResultToExtendedStateItem(
                        stateDbItem,
                        '',
                        uiFilters?.clientTimezone,
                    ),
            );

            return workItems;
        } catch (e) {
            console.log(e);
        }
        return [];
    }

    async getSnapshotsTz({
        orgId, stateCategory, uiFilters, fqlFilter, isDelayed, columnNames
    }: {
        orgId: string,
        stateCategory: StateCategory,
        uiFilters?: IQueryFilters,
        fqlFilter?: FQLFilterModel | string,
        // TODO: Rename to forceDelayed?
        isDelayed?: boolean,
        columnNames?: string[];
    }): Promise<SnapshotItem[]> {
        const workItems = await this.getWorkItemsByStateCategory(
            orgId,
            stateCategory,
            uiFilters,
            fqlFilter,
            ['workItemId'],
            isDelayed,
            true,
        );
        const aurora = await this.aurora;

        const workItemIds = workItems.map(wi => wi.workItemId as string);
        const interval = await uiFilters?.datePeriod();

        const query: string = WorkItemQueries.buildSnapshotsRetrievalQuery({
            orgId,
            timezone: uiFilters?.clientTimezone ?? TIMEZONE_UTC,
            workItemIds,
            startDate: interval?.start,
            endDate: interval?.end,
            columnNames
        });

        const snapshotItemsResults = await aurora.query(query, {
            type: QueryTypes.SELECT,
        });
        const snapshotItems: SnapshotItem[] = snapshotItemsResults.map(
            (snapshotDbItem: unknown) =>
                convertDbResultToSnapshotItem(
                    snapshotDbItem,
                    uiFilters?.clientTimezone,
                ),
        );
        // TODO: Better log message
        this.logger.debug(
            `[SnapshotItems]: length ${snapshotItems.length}`,
        );

        return snapshotItems;
    }


    static getWasCompletedBetweenDatesPredicates(
        interval: Interval | undefined,
    ): string {
        if (interval === undefined) {
            throw new Error('Undefined interval is not allowed');
        }
        // This is used for cumulative scenarios where we don't care about when the item finished
        // "departureDate" less than finish date
        const predicate: string = pgp.as.format(
            `"departureDate" IS NOT NULL
            AND "departureDate" <= $<dateEnd>`,
            {
                dateEnd: interval.end.toISO(),
            },
        );

        return predicate;
    }

    static getBecameCompletedBetweenDatesPredicates(
        interval: Interval | undefined,
    ): string {
        if (interval === undefined) {
            throw new Error('Undefined interval is not allowed');
        }
        // "departureDate" between start-finish
        const predicate: string = pgp.as.format(
            `"departureDate" IS NOT NULL
            AND "departureDate" >= $<dateStart>
            AND "departureDate" <= $<dateEnd>`,
            {
                dateStart: interval.start.toISO(),
                dateEnd: interval.end.toISO(),
            },
        );

        return predicate;
    }

    static getBecameWipBetweenDatesPredicates(
        interval: Interval | undefined,
        showDelayedItemsOnWip: boolean | undefined,
    ): string {
        if (interval === undefined) {
            throw new Error('Undefined interval is not allowed');
        }
        const predicates = [];

        if (showDelayedItemsOnWip) {
            //if showing delayed items on wip,
            //then we can simply ignore the isDelayed column

            //noop
        } else {
            //if not showing delayed items on wip,
            //then we need to specifically filter them out here

            const delayedOptionPredicate = `"isDelayed" = false`;
            predicates.push(delayedOptionPredicate);
        }

        predicates.push(
            pgp.as.format(
                `"commitmentDate" IS NOT NULL
                AND "commitmentDate" >= $<dateStart>
                AND "commitmentDate" <= $<dateEnd>`,
                {
                    dateStart: interval.start.toISO(),
                    dateEnd: interval.end.toISO(),
                },
            ),
        );

        const jointPredicates: string = predicates.join('\nAND ');

        return jointPredicates;
    }

    static getBecameInventoryBetweenDatesPredicates(
        interval: Interval | undefined,
        showDelayedItemsOnInventory: boolean | undefined,
    ): string {
        if (interval === undefined) {
            throw new Error('Undefined interval is not allowed');
        }
        const predicates = [];

        if (showDelayedItemsOnInventory) {
            const delayedOptionPredicate = `("isDelayed" = false OR ("isDelayed" = true AND "stateCategory" = '${StateCategory[StateCategory.INPROGRESS].toLowerCase()}'))`;
            predicates.push(delayedOptionPredicate);
        } else {
            const delayedOptionPredicate = `"isDelayed" = false`;
            predicates.push(delayedOptionPredicate);
        }

        predicates.push(
            pgp.as.format(
                `"arrivalDate" IS NOT NULL
                 AND "arrivalDate" >= $<dateStart>
                 AND "arrivalDate" <= $<dateEnd>`,
                {
                    dateStart: interval.start.toISO(),
                    dateEnd: interval.end.toISO(),
                },
            ),
        );

        const jointPredicates: string = predicates.join('\nAND ');

        return jointPredicates;
    }

    static getWasWipBetweenDatesPredicates(
        interval: Interval | undefined,
        showDelayedItemsOnWip: boolean | undefined,
    ): string {
        if (interval === undefined) {
            throw new Error('Undefined interval is not allowed');
        }

        const predicates = [];

        if (showDelayedItemsOnWip) {
            //if showing delayed items on wip,
            //then we can simply ignore the isDelayed column

            //noop
        } else {
            //if not showing delayed items on wip,
            //then we need to specifically filter them out here

            const delayedOptionPredicate = `"isDelayed" = false`;
            predicates.push(delayedOptionPredicate);
        }

        predicates.push(
            pgp.as.format(
                `"commitmentDate" IS NOT NULL
                AND "commitmentDate" < $<dateEnd>
                AND (
                    "departureDate" IS NULL
                    OR "departureDate" > $<dateStart>
                )`,
                {
                    dateStart: interval.start.toISO(),
                    dateEnd: interval.end.toISO(),
                },
            ),
        );

        const jointPredicates: string = predicates.join('\nAND ');

        return jointPredicates;
    }

    static getWasInventoryBetweenDatesPredicates(
        interval: Interval | undefined,
    ): string {
        if (interval === undefined) {
            throw new Error('Undefined interval is not allowed');
        }

        const predicates = [];

        predicates.push(
            pgp.as.format(
                `"arrivalDate" IS NOT NULL
             AND "arrivalDate" < $<dateEnd> 
             AND ("commitmentDate" IS NULL OR "commitmentDate" > $<dateStart>)`,
                {
                    dateStart: interval.start.toISO(),
                    dateEnd: interval.end.toISO(),
                },
            ),
        );

        const jointPredicates: string = predicates.join('\nAND ');

        return jointPredicates;
    }

    static getCurrentCompletedOnlyPredicates(): string {
        return '"stateCategory" = \'completed\'';
    }

    static getCurrentWipOnlyPredicates(showDelayedItemsOnWip?: boolean): string {
        const predicates = [];

        predicates.push('"stateCategory" = \'inprogress\'');

        if (showDelayedItemsOnWip) {
            //if showing delayed items on wip,
            //then we can simply ignore the isDelayed column

            //noop
        } else {
            //if not showing delayed items on wip,
            //then we need to specifically filter them out here

            const delayedOptionPredicate = `"isDelayed" = false`;
            predicates.push(delayedOptionPredicate);
        }

        const jointPredicates: string = predicates.join('\nAND ');

        return jointPredicates;
    }

    static getCurrentInventoryOnlyPredicates(showDelayedItemsOnInventory?: boolean): string {
        const predicates = [];

        predicates.push('"stateCategory" = \'proposed\'');

        if (showDelayedItemsOnInventory) {
            const delayedOptionPredicate = `AND "isDelayed" = false OR ("isDelayed" = true AND "stateCategory" = '${StateCategory[StateCategory.INPROGRESS].toLowerCase()}')`;
            predicates.push(delayedOptionPredicate);
        } else {
            const delayedOptionPredicate = `AND "isDelayed" = false`;
            predicates.push(delayedOptionPredicate);
        }

        const jointPredicates: string = predicates.join(' ');

        return jointPredicates;
    }

    /**
     * This is a newer version of the state category filter based on retrieval scenarios.
     *
     *
     * @param scenario
     * @param uiFilters
     * @param isDelayed
     * @returns
     */
    static getStateCategorySQLPredicatesByScenario(
        scenario: RetrievalScenario,
        interval: Interval | undefined,
        uiFilters: IQueryFilters | undefined,
        forceDelayedItems?: boolean,
    ): string[] {
        const delayedItemsSelection = uiFilters?.delayedItemsSelection;
        const showDelayedOnInventory = forceDelayedItems || !delayedItemsSelection || delayedItemsSelection === 'inventory';
        const showDelayedItemsOnWip = forceDelayedItems || !showDelayedOnInventory;

        const predicates: string[] = [];
        switch (scenario) {
            case RetrievalScenario.CURRENT_COMPLETED_ONLY:
                predicates.push(
                    WorkItemQueries.getCurrentCompletedOnlyPredicates(),
                );
                break;
            case RetrievalScenario.BECAME_COMPLETED_BETWEEN_DATES:
                predicates.push(
                    WorkItemQueries.getBecameCompletedBetweenDatesPredicates(
                        interval,
                    ),
                );
                break;
            case RetrievalScenario.WAS_COMPLETED_BETWEEN_DATES:
                predicates.push(
                    WorkItemQueries.getWasCompletedBetweenDatesPredicates(
                        interval,
                    ),
                );
                break;
            case RetrievalScenario.CURRENT_WIP_ONLY:
                predicates.push(
                    WorkItemQueries.getCurrentWipOnlyPredicates(
                        showDelayedItemsOnWip
                    ),
                );
                break;
            case RetrievalScenario.WAS_WIP_BETWEEN_DATES:
                predicates.push(
                    WorkItemQueries.getWasWipBetweenDatesPredicates(
                        interval,
                        showDelayedItemsOnWip,
                    ),
                );
                break;
            case RetrievalScenario.BECAME_WIP_BETWEEN_DATES:
                predicates.push(
                    WorkItemQueries.getBecameWipBetweenDatesPredicates(
                        interval,
                        showDelayedItemsOnWip,
                    ),
                );
                break;
            case RetrievalScenario.CURRENT_INVENTORY_ONLY:
                predicates.push(
                    WorkItemQueries.getCurrentInventoryOnlyPredicates(
                        showDelayedOnInventory,
                    ),
                );
                break;
            case RetrievalScenario.WAS_INVENTORY_BETWEEN_DATES:
                predicates.push(
                    WorkItemQueries.getWasInventoryBetweenDatesPredicates(
                        interval,
                    ),
                );
                break;
            case RetrievalScenario.BECAME_INVENTORY_BETWEEN_DATES:
                predicates.push(
                    WorkItemQueries.getBecameInventoryBetweenDatesPredicates(
                        interval,
                        showDelayedOnInventory,
                    ),
                );
                break;
        }

        if (predicates.length === 0) {
            return [];
        }

        const isolatedPredicates: string[] = predicates.map(
            (predicate) => `(${predicate})`,
        );
        const jointPredicates: string = isolatedPredicates.join('\nAND ');

        return [jointPredicates];
    }


    static getStateCategorySQLPredicatesByScenarioWithoutUiFilters(
        scenario: RetrievalScenario,
        interval: Interval | undefined,
    ): string[] {
        const delayedItemsSelection = 'inventory';
        const showDelayedOnInventory = !delayedItemsSelection || delayedItemsSelection === 'inventory';
        const showDelayedItemsOnWip = !showDelayedOnInventory;

        const predicates: string[] = [];
        switch (scenario) {
            case RetrievalScenario.CURRENT_COMPLETED_ONLY:
                predicates.push(
                    WorkItemQueries.getCurrentCompletedOnlyPredicates(),
                );
                break;
            case RetrievalScenario.BECAME_COMPLETED_BETWEEN_DATES:
                predicates.push(
                    WorkItemQueries.getBecameCompletedBetweenDatesPredicates(
                        interval,
                    ),
                );
                break;
            case RetrievalScenario.WAS_COMPLETED_BETWEEN_DATES:
                predicates.push(
                    WorkItemQueries.getWasCompletedBetweenDatesPredicates(
                        interval,
                    ),
                );
                break;
            case RetrievalScenario.CURRENT_WIP_ONLY:
                predicates.push(
                    WorkItemQueries.getCurrentWipOnlyPredicates(
                        showDelayedItemsOnWip
                    ),
                );
                break;
            case RetrievalScenario.WAS_WIP_BETWEEN_DATES:
                predicates.push(
                    WorkItemQueries.getWasWipBetweenDatesPredicates(
                        interval,
                        showDelayedItemsOnWip,
                    ),
                );
                break;
            case RetrievalScenario.BECAME_WIP_BETWEEN_DATES:
                predicates.push(
                    WorkItemQueries.getBecameWipBetweenDatesPredicates(
                        interval,
                        showDelayedItemsOnWip,
                    ),
                );
                break;
            case RetrievalScenario.CURRENT_INVENTORY_ONLY:
                predicates.push(
                    WorkItemQueries.getCurrentInventoryOnlyPredicates(
                        showDelayedOnInventory,
                    ),
                );
                break;
            case RetrievalScenario.WAS_INVENTORY_BETWEEN_DATES:
                predicates.push(
                    WorkItemQueries.getWasInventoryBetweenDatesPredicates(
                        interval,
                    ),
                );
                break;
            case RetrievalScenario.BECAME_INVENTORY_BETWEEN_DATES:
                predicates.push(
                    WorkItemQueries.getBecameInventoryBetweenDatesPredicates(
                        interval,
                        showDelayedOnInventory,
                    ),
                );
                break;
        }

        if (predicates.length === 0) {
            return [];
        }

        const isolatedPredicates: string[] = predicates.map(
            (predicate) => `(${predicate})`,
        );
        const jointPredicates: string = isolatedPredicates.join('\nAND ');

        return [jointPredicates];
    }

    static async getScenariosSQLPredicates(
        scenarios: RetrievalScenario[],
        uiFilters: IQueryFilters | undefined,
        forceDelayed?: boolean,
    ): Promise<string[]> {
        const interval = await uiFilters?.datePeriod();

        if (scenarios.length === 0) {
            throw new Error('At least one scenario required.');
        }

        const scenarioPredicates: Array<string[]> = scenarios.map((scenario) =>
            WorkItemQueries.getStateCategorySQLPredicatesByScenario(
                scenario,
                interval,
                uiFilters,
                forceDelayed,
            ),
        );

        const allPredicates: string[] = flatten(scenarioPredicates);

        if (allPredicates.length === 0) {
            return [];
        }

        const fullPredicate: string = allPredicates.join('\nOR ');

        return [fullPredicate];
    }

    async getExtendedWorkItemsByScenario({
        orgId,
        scenarios,
        uiFilters,
        fqlFilter,
        columnNames,
        isDelayed: forceDelayed,
        ignoreDiscardedItems,
        useSnapshotsData,
        includeArrivalPoint,
        workItemIdListToFilter,
    }: GetExtendedWorkItemsByScenarioParams
    ): Promise<ExtendedStateItem[]> {
        const aurora = await this.aurora;

        const contextId = uiFilters?.getContextId();

        // Work items without a contexts are meaningless data
        if (!contextId) {
            return [];
        }

        const contextIdList: string[] = await this.getContextIdsForExtendedItems(
            orgId,
            contextId,
        );

        const extendedStateModel = ExtendedStateModel(aurora);
        const filterModel = FQLFilterFactory(aurora);

        const selectionQueriesPromise = this.getBlockersAndExpediteFilters(
            filterModel,
            orgId,
        );

        // Generate SQL Predicates for Query
        const generalPredicatesPromise = this.getGeneralSQLPredicates(
            orgId,
            extendedStateModel,
            uiFilters,
            fqlFilter,
            ignoreDiscardedItems
        );

        const scenarioPredicatesPromise = WorkItemQueries.getScenariosSQLPredicates(
            scenarios,
            uiFilters,
            forceDelayed,
        );

        const [
            generalPredicates,
            scenarioPredicates,
            { blockersSelectionClause, expediteSelectionClause },
        ] = await Promise.all([
            generalPredicatesPromise,
            scenarioPredicatesPromise,
            selectionQueriesPromise,
        ]);

        const predicates = generalPredicates.concat(scenarioPredicates);

        const interval = await uiFilters?.datePeriod();

        let workItemIds = workItemIdListToFilter;
        if (workItemIdListToFilter === undefined || workItemIdListToFilter.length === 0) {
            workItemIds = await this.getWorkItemIds(orgId, predicates, contextIdList);
        }
        const excludeWeekends = !!(await uiFilters?.getExcludeWeekendsSetting(orgId));

        const query: string = WorkItemQueries.buildRetrievalQuery(
            {
                orgId,
                predicates,
                blockersSelectionClause,
                expediteSelectionClause,
                contextIdList,
                timezone: uiFilters?.clientTimezone ?? TIMEZONE_UTC,
                dateStart: interval?.start,
                dateEnd: interval?.end,
                columnNames,
                useSnapshotsData,
                includeArrivalPoint,
                workItemIdListToFilter: workItemIds,
                excludeWeekends
            },
        );

        const cacher = await this.getCacher(orgId);

        const workItemResults = await cacher.query(query, {
            type: QueryTypes.SELECT,
        });

        const workItems: ExtendedStateItem[] = workItemResults.map(
            (stateDbItem: unknown) =>
                convertDbResultToExtendedStateItem(
                    stateDbItem,
                    (fqlFilter as FQLFilterModel)?.displayName,
                    uiFilters?.clientTimezone,
                ),
        );

        const scenarioNames = scenarios
            ? scenarios.map((scenario) => RetrievalScenario[scenario])
            : undefined;

        this.logger.debug(
            `[getExtendedWorkItemsByScenarios]: ${scenarioNames} length ${workItems.length}`,
        );

        return workItems;
    }

    stateCategoryForDate(
        arrivalDate: string,
        commitmentDate?: string,
        departureDate?: string,
    ): string {
        let stateCategory = 'proposed';

        if (arrivalDate && !commitmentDate && !departureDate) {
            stateCategory = 'proposed';
            return stateCategory;
        }

        if (commitmentDate && !departureDate) {
            stateCategory = 'inprogress';
            return stateCategory;
        }

        if (departureDate) {
            stateCategory = 'completed';
            return stateCategory;
        }

        return stateCategory;
    }

    private async buildPredicates(
        contexts: string[],
        scenarios: RetrievalScenario[],
        orgId: string,
        interval: Interval
    ) {
        const aurora = await this.aurora;
        const extendedStateModel = ExtendedStateModel(aurora);
        // Generate SQL Predicates for Query
        const generalPredicates = await this.getGeneralSQLPredicates(
            orgId,
            extendedStateModel,
            undefined,
            undefined,
            true
        );

        const scenarioPredicates: Array<string[]> = scenarios.map((scenario) =>
            WorkItemQueries.getStateCategorySQLPredicatesByScenarioWithoutUiFilters(
                scenario,
                interval,
            ),
        );

        let allScenarioPredicates: string[] = flatten(scenarioPredicates);


        if (allScenarioPredicates.length === 0) {
            allScenarioPredicates = [];
        }

        const fullScenarioPredicates: string = allScenarioPredicates.join('\nOR ');

        let predicates = generalPredicates;
        //Fetch only team level items
        predicates.push(`states."flomatikaWorkItemTypeLevel" = 'Team'`);
        if (fullScenarioPredicates)
            predicates = predicates.concat([fullScenarioPredicates]);

        const isolatedPredicates: string[] = predicates.map(
            (predicate) => `(${predicate})`,
        );
        const jointPredicates: string = isolatedPredicates.join('\nAND ');
        const whereClause: string =
            predicates.length > 0 ? jointPredicates : '';

        let contextIdsPredicate = '';
        if (contexts.length > 0) {
            const contextIdsStr = contexts.map(c => `'${c}'`).join(',');
            contextIdsPredicate = `and cwim."contextId" in (${contextIdsStr})`;
        }

        return {
            whereClause,
            contextIdsPredicate
        };
    }

    async getItemsByContextAndScenario(
        contexts: string[],
        scenarios: RetrievalScenario[],
        orgId: string,
        interval: Interval,
        uiFilters: IQueryFilters | undefined,
        fetchItemAges: boolean = true
    ): Promise<ItemWithContextAndTime[]> {
        const aurora = await this.aurora;

        // Work items without a contexts are meaningless data
        if (!contexts.length) {
            return [];
        }

        const itemsAges = `
                case 
                when (:excludeWeekends = true) 
                then public.count_business_days(
                    (
                        states."arrivalDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE :timezone
                    ),
                    (:endDate :: timestamptz) :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE :timezone
                )
                else GREATEST(
                    0,
                    DATE_PART(
                        'day',
                        date_trunc(
                            'day',
                            (
                                (:endDate :: timestamptz) :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE :timezone
                            )
                        ) - date_trunc(
                            'day',
                            (
                                (
                                    states."arrivalDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE :timezone
                                ) :: DATE
                            )
                        )
                    ) :: INT + 1
                )
                end AS "inventoryAgeInWholeDays",
                case 
                when (:excludeWeekends = true) 
                then public.count_business_days(
                    (
                        states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE :timezone
                    ),
                    (:endDate :: timestamptz) :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE :timezone
                )
                else GREATEST(
                        0,
                        DATE_PART(
                            'day',
                            date_trunc(
                                'day',
                                (
                                    (:endDate :: timestamptz) :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE :timezone
                                )
                            ) - date_trunc(
                                'day',
                                (
                                    (
                                        states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE :timezone
                                    ) :: DATE
                                )
                            )
                        ) :: int + 1
                    ) 
                end as "wipAgeInWholeDays",    
                case 
                when (:excludeWeekends = true) 
                then public.count_business_days(
                    (
                        states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE :timezone
                    ),
                    (
                        states."departureDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE :timezone
                    )
                )
                else DATE_PART(
                    'day',
                    date_trunc(
                        'day',
                        (
                            (
                                states."departureDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'UTC'
                            ) :: DATE
                        )
                    ) -
                    GREATEST(
                        date_trunc(
                            'day',
                            (
                                (
                                    states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'UTC'
                                ) :: DATE
                            )
                        ),
                        date_trunc(
                            'day',
                            (
                                (:startDate :: timestamptz) :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE 'UTC'
                            )
                        )
                    )
                ) :: int + 1
                end AS "leadTimeInWholeDays"
        `;

        const { whereClause, contextIdsPredicate } = await this.buildPredicates(
            contexts,
            scenarios,
            orgId,
            interval
        );

        const excludeWeekends = !!(await uiFilters?.getExcludeWeekendsSetting(orgId));

        const workItemIdsQuery = `
            select 
                "states"."workItemId",
                "states"."commitmentDate",
                "states"."arrivalDate",
                "states"."departureDate",
                cwim."contextId"
                ${fetchItemAges ? `,${itemsAges}` : ''}
            from states 
            join "contextWorkItemMaps" cwim on
                "states"."workItemId" = cwim."workItemId" and 
                "states"."partitionKey" = 'state#' || cwim."orgId" and 
                cwim."orgId" = '${orgId}' and 
                "states"."partitionKey" = 'state#${orgId}'
                ${contextIdsPredicate}
            where ${whereClause}
        `;


        const workItemsResult: any[] = await aurora.query(workItemIdsQuery, {
            type: QueryTypes.SELECT,
            replacements: {
                excludeWeekends,
                startDate: interval.start.toISO(),
                endDate: interval.end.toISO(),
                timezone: uiFilters?.clientTimezone ?? 'UTC'
            }
        });
        return workItemsResult.map(wi => ({
            ...wi,
            // These columns are returned as strings for some reason. These values will never be undefined/null. Always '0' or a valid string of numbers
            leadTimeInWholeDays: Number.parseInt(wi.leadTimeInWholeDays),
            wipAgeInWholeDays: Number.parseInt(wi.wipAgeInWholeDays),
            inventoryAgeInWholeDays: Number.parseInt(wi.inventoryAgeInWholeDays),
        }));
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

