import {
    chain,
    concat,
    difference,
    groupBy,
    partition,
    range,
    sortBy,
    uniqBy,
} from 'lodash';
import { DateTime, Duration, Interval } from 'luxon';

import { IQueryFilters } from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import { IContext } from '../context/context_interfaces';
import ContextModel from '../models/ContextModel';
import { v4 as uuidV4 } from 'uuid';
import {
    convertDbResultToExtendedStateItem,
    ExtendedStateItem,
    LinkedItem,
    ObeyaContextItem,
    ParentWorkItem,
    RetrievalScenario,
    StateItem,
} from '../workitem/interfaces';
import { IState, RelatedTypes } from '../workitem/state_aurora';
import { ObeyaRoom, ObeyaRoomsCalculations } from './obeya_rooms/calculations';
import { Op, QueryTypes, Sequelize } from 'sequelize';
import { Calculations as FlowItemsCalculation } from '../value_stream_management/delivery_management/flow_items/calculations';
import { ISnapshot } from '../workitem/snapshot_db';
import { WidgetInformationUtils } from '../utils/getWidgetInformation';
import { calculateLeadTime, calculateRoadmapStartEndDateTime } from './utils';
import CustomFields, { tags } from '../models/CustomFieldConfigModel';
import { IWorkItemQueries } from '../workitem/workitem_queries';
import _ from 'lodash';
import { getLeadTimeInWholeDaysFunc } from '../workitem/utils';

export type BoardItem = {
    boardName: string;
    proposed: number;
    completed: number;
    inProgress: number;
    contextId: string;
};

export type IndividualContributorsItem = {
    assignedTo: string;
    proposed: number;
    completed: number;
    inProgress: number;
};

export type DefaultIndividualContributor = {
    workItemId?: string;
    state?: string;
    stateCategory?: string;
    workItemType?: string;
    assignedTo?: string;
};

export type DefaultWorkFlowItem = {
    title?: string;
    workItemId?: string;
    state?: string;
    stateCategory?: string;
    workItemType?: string;
    arrivalDate?: string;
    commitmentDate?: string;
    departureDate?: string;
    commitmentDateTime?: DateTime;
    departureDateTime?: DateTime;
    flomatikaWorkItemTypeLevel?: string;
    flagged?: boolean;
    parentId?: string;
    targetStart?: string;
    targetEnd?: string;
    targetStartDateTime?: DateTime;
    targetEndDateTime?: DateTime;
    baselines?: JSON;
    dependencies?: JSON;
    assignedTo?: string;
    customFields?: any;
    datasourceId?: string;
    flomatikaWorkItemTypeId?: string;
    leadTimeInWholeDays?: number;
    flomatikaWorkItemTypeServiceLevelExpectationInDays?: number;
    linkedItems?: LinkedItem[];
};

export type ObeyaWithWorkItems = { [contextId: string]: Array<StateItem>; };

export type DefaultWorkflowItem = {
    contextId: string;
    contextName?: string;
    workItems: ExtendedStateItem[];
};

export type WorkFlowBoard = {
    contextId: string;
    contextName: string;
    completed: any[];
    inProgress: any[];
    proposed: any[];
};

export type ObeyaContextsWithWorkItems = {
    [contextId: string]: {
        contextId: string;
        contextName?: string;
        workItems: ExtendedStateItem[];
    };
};

export type ScopeItem = {
    demandType: string;
    total: number;
    proposed: number;
    inProgress: number;
    completed: number;
};

export type HighlightsResponse = Array<ScopeItem>;

export type ObeyaDateWorkItemsPair = [string, StateItem[]];

export type ObeyaDailyRecord = {
    date: string;
    numWorkItems: number;
};

export type ObeyaDailyBurndown = {
    date: string;
    dailyTarget: number;
    remainingWorkCount: number | null;
};

export type ObeyaDailyBurnup = {
    date: string;
    dailyTarget: number;
    finishedWork: number | null;
};

export type ObeyaDailyScope = {
    date: string;
    scope: number;
};

export type ObeyaBurndownSummary = {
    updatedRecords: ObeyaDailyBurndown[];
    lastTarget: number;
    cumulativeWork: number;
    totalRemainingWork: number;
    burnDailyOffset: number;
};

export type ObeyaBurnupSummary = {
    updatedRecords: ObeyaDailyBurnup[];
    lastTarget: number;
    cumulativeWork: number;
    targetTotal: number;
    burnDailyOffset: number;
};

export type ObeyaScopeSummary = {
    updatedRecords: ObeyaDailyScope[];
    accumulatedScope: number;
};

export type ObeyaBurndownSeries = {
    dates: string[];
    remainingWork: (number | null)[];
    dailyTargets: number[];
};

export type ObeyaBurnupSeries = {
    dates: string[];
    accomplishedWork: (number | null)[];
    dailyTargets: number[];
    scope: number[];
};

export type ObeyaScopeBurnData = {
    burndown: ObeyaBurndownSeries;
    burnup: ObeyaBurnupSeries;
};

export type DateCheckFunction = (date: string) => boolean;

type PopulateResponseContext = {
    contextId: string;
    positionInHierarchy: string;
};
export type PopulateResult = {
    contexts: PopulateResponseContext[];
    lowerBoundaryDate: DateTime;
    upperBoundaryDate: DateTime;
    obeyaStart?: Date;
    obeyaEnd?: Date;
};

type RoadmapResponse = {
    roadmap: BoardItem[];
    obeyaStart?: Date;
    obeyaEnd?: Date;
};

export interface IObeyaCalculation {
    getObeyaData(
        obeyaRoomId: string,
        relationType?: RelatedTypes,
        timezone?: string,
    ): Promise<StateItem[]>;

    getAllContextsWithWorkItems(
        obeyaData: StateItem[],
    ): Promise<ObeyaContextsWithWorkItems>;

    getProgressBoards(obeyaData: StateItem[]): Promise<BoardItem[]>;
}

export class ObeyaCalculation implements IObeyaCalculation {
    private orgId: string;
    private state: IState;
    private filters?: IQueryFilters;
    private obeyaRoomsCalculations: ObeyaRoomsCalculations;
    private obeyaRoomId: string;
    private aurora: Promise<Sequelize>;
    private workItemQueries: IWorkItemQueries;
    private cache: Map<string, any> = new Map();

    constructor(opts: {
        security: SecurityContext;
        state: IState;
        filters?: IQueryFilters;
        context: IContext;
        obeyaRoomsCalculations: ObeyaRoomsCalculations;
        flowItemsCalculation: FlowItemsCalculation;
        snapshot: ISnapshot;
        widgetInformationUtils: WidgetInformationUtils;
        aurora: Promise<Sequelize>;
        workItemQueries: IWorkItemQueries;
    }) {
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
        this.filters = opts.filters;
        this.obeyaRoomsCalculations = opts.obeyaRoomsCalculations;
        this.obeyaRoomId = '';
        this.aurora = opts.aurora;
        this.workItemQueries = opts.workItemQueries;
    }

    async findParentWorkItems(
        obeyaRoomId: string,
        workItemId: string,
        timezone?: string,
    ): Promise<ParentWorkItem[]> {
        const allWorkItems: StateItem[] = await this.getSavedObeyaData(
            obeyaRoomId,
            this.filters?.clientTimezone,
        );
        const searchTerm = workItemId.toLowerCase();

        const workItemIdSearch = allWorkItems.filter((workItem) => {
            return (
                workItem.workItemId?.toLocaleLowerCase().includes(searchTerm) ||
                workItem.title?.toLowerCase().includes(searchTerm)
            );
        });

        const formattedWorkItems = workItemIdSearch.map((workItem) => ({
            workItemId: workItem?.workItemId,
            title: workItem?.title || `${workItem?.flomatikaWorkItemTypeName}`,
            flomatikaWorkItemTypeName: workItem?.flomatikaWorkItemTypeName,
        }));
        return formattedWorkItems;
    }

    async getObeyaLinkTypes(obeyaRoomId: string): Promise<string[]> {
        const obeyaRoom: ObeyaRoom = await this.getObeyaRoom(
            obeyaRoomId,
        );

        const { linkTypes } = obeyaRoom;
        let sorted: string[] = [];

        if (linkTypes) {
            sorted = linkTypes?.sort((a, b) => {
                return a.localeCompare(b, undefined, { sensitivity: 'base' });
            });
        }
        return sorted || [];
    }

    async getFilteredObeyaData(obeyaData: StateItem[]): Promise<StateItem[]> {
        const workItemIds = obeyaData.reduce(
            (acc: string[], workItem: StateItem) => {
                if (workItem?.workItemId) {
                    acc.push(workItem?.workItemId);
                }
                return acc;
            },
            [],
        );

        const workItemIdsWithinContext: any[] = await this.getWorkItemIdsWithinContext(
            workItemIds,
        );
        const ids: string[] = workItemIdsWithinContext.reduce(
            (acc: string[], workItem: StateItem) => {
                if (workItem?.workItemId) {
                    acc.push(workItem?.workItemId);
                }
                return acc;
            },
            [],
        );

        return obeyaData.filter((item: { workItemId?: string; }) =>
            ids.includes(item.workItemId!),
        );
    }

    async getScopeInfo(obeyaData: StateItem[]): Promise<HighlightsResponse> {
        const filteredObeyaData = await this.getFilteredObeyaData(obeyaData);

        const workItemsByType: {
            [workItemType: string]: Array<StateItem>;
        } = groupBy(filteredObeyaData, 'workItemType');

        const allWorkItemTypes: any = [];

        Object.keys(workItemsByType).forEach((workItemType: string) => {
            const allWorkItemsByWorkItemType: StateItem[] =
                workItemsByType[workItemType];

            const count = allWorkItemsByWorkItemType.length;

            const { proposed, inprogress, completed } = groupBy(
                allWorkItemsByWorkItemType,
                'stateCategory',
            );

            allWorkItemTypes.push({
                demandType: workItemType,
                count,
                proposed: proposed?.length || 0,
                inProgress: inprogress?.length || 0,
                completed: completed?.length || 0,
            });
        });
        return allWorkItemTypes;
    }

    async getIndividualContributors(
        obeyaData: StateItem[],
    ): Promise<IndividualContributorsItem[]> {
        const allWorkItemsWithinContexts: ObeyaContextsWithWorkItems = await this.getContextsWithRelatedWorkItems(
            obeyaData,
            [
                'workItemId',
                'title',
                'state',
                'stateCategory',
                'workItemType',
                'stateType',
                'assignedTo',
            ],
            getIndividualContributors,
        );

        const countWorkItemsByContributors: {
            [assignedTo: string]: {
                assignedTo: string;
                completed: number;
                inProgress: number;
                proposed: number;
            };
        } = {};

        Object.keys(allWorkItemsWithinContexts).forEach((contextId: string) => {
            const contextData: {
                contextId: string;
                contextName?: string;
                workItems: DefaultIndividualContributor[];
            } = allWorkItemsWithinContexts[contextId];

            const contextByContributors = groupBy(
                contextData.workItems,
                'assignedTo',
            );

            Object.keys(contextByContributors).forEach((assignedTo) => {
                const workItemsByContributor: DefaultIndividualContributor[] =
                    contextByContributors[assignedTo];

                const { completed, inprogress, proposed } = groupBy(
                    workItemsByContributor,
                    'stateCategory',
                );

                if (
                    !Object.keys(countWorkItemsByContributors).includes(
                        assignedTo,
                    ) &&
                    assignedTo !== 'null'
                ) {
                    countWorkItemsByContributors[assignedTo] = {
                        assignedTo,
                        completed: completed?.length || 0,
                        inProgress: inprogress?.length || 0,
                        proposed: proposed?.length || 0,
                    };
                } else if (assignedTo !== 'null') {
                    const countStateCategoryByContributor =
                        countWorkItemsByContributors[assignedTo];
                    countWorkItemsByContributors[assignedTo] = {
                        assignedTo,
                        completed:
                            (Number(
                                countStateCategoryByContributor?.completed,
                            ) || 0) + (completed?.length || 0),
                        inProgress:
                            (Number(
                                countStateCategoryByContributor?.inProgress,
                            ) || 0) + (inprogress?.length || 0),
                        proposed:
                            (Number(
                                countStateCategoryByContributor?.proposed,
                            ) || 0) + (proposed?.length || 0),
                    };
                }
            });
        });
        return Object.values(countWorkItemsByContributors);
    }

    async getProgressBoards(obeyaData: StateItem[]): Promise<BoardItem[]> {
        try {
            const allWorkItemsWithinContexts: ObeyaContextsWithWorkItems = await this.getContextsWithRelatedWorkItems(
                obeyaData,
                [
                    'workItemId',
                    'title',
                    'state',
                    'stateCategory',
                    'workItemType',
                    'stateType',
                ],
                getFormattedWorkflowItem,
            );

            const formattedBoards: Array<BoardItem> = [];
            Object.keys(allWorkItemsWithinContexts).forEach(
                (contextId: string) => {
                    const boardData: {
                        contextId: string;
                        contextName?: string;
                        workItems: DefaultWorkFlowItem[];
                    } = allWorkItemsWithinContexts[contextId];

                    const { completed, inprogress, proposed } = groupBy(
                        boardData.workItems,
                        'stateCategory',
                    );

                    const completedLength = Number(completed?.length) || 0;
                    const inProgressLength = Number(inprogress?.length) || 0;
                    const proposedLength = Number(proposed?.length) || 0;

                    formattedBoards.push({
                        contextId,
                        boardName:
                            allWorkItemsWithinContexts[contextId]
                                ?.contextName || contextId,
                        completed: completedLength,
                        inProgress: inProgressLength,
                        proposed: proposedLength,
                    });
                },
            );

            return formattedBoards;
        } catch (e) {
            return [];
        }
    }

    private async getItemsFromFilterExpression(
        obeyaRoom: ObeyaRoom,
        customParsedQuery?: string,
        columnNames?: string[],
    ) {
        const parsedQuery = customParsedQuery
            ? `(${obeyaRoom?.parsedQuery} ${customParsedQuery})`
            : obeyaRoom?.parsedQuery;

        const sprintIds: string[] | undefined = undefined;
        /*
        TODO: If obeyaRoom.type = sprint, get the sprint IDs for the obeya room, 
        */

        return this.state.getWorkItemsToObeya({
            orgId: obeyaRoom.orgId!,
            fqlFilter: parsedQuery,
            columnNames,
            sprintIds,
        });
    }

    private async getItemsFromExcludeFilterExpression(
        obeyaRoom: ObeyaRoom,
        customParsedQuery?: string,
        columnNames?: string[],
    ) {
        const parsedExcludeQuery = customParsedQuery
            ? `(${obeyaRoom?.parsedExcludeQuery} ${customParsedQuery})`
            : obeyaRoom?.parsedExcludeQuery;

        return parsedExcludeQuery
            ? this.state.getWorkItemsToObeya({
                orgId: obeyaRoom.orgId!,
                fqlFilter: parsedExcludeQuery,
                columnNames,
            })
            : [];
    }

    getWorkItemIdsToQuery(workItems: StateItem[]): string {
        return workItems.reduce((acc, workItem: StateItem, index) => {
            acc += `'${workItem.workItemId}'${index < workItems.length - 1 ? ',' : ''
                }`;
            return acc;
        }, '');
    }

    /**
     * @deprecated
     * Dont use this. It makes an extra call to the database to fetch the obeya room first. 
     * 
     *  Use `getInitiativeData` instead. 
     *  
     * Call `getObeyaRoom` to get the obeya room and 
     * then call `getInitiativeData`. 
     * 
     * 
     * Get the list of workitems for the given obeya room
     */
    async getObeyaData(
        obeyaRoomId: string,
        relationType?: RelatedTypes,
        timezone?: string,
        /**
         * This param is required if we're calling this method 
         * for different orgs
         */
        orgIdOverride?: string
    ): Promise<ExtendedStateItem[]> {
        const obeyaRoom: ObeyaRoom = await this.getObeyaRoom(
            obeyaRoomId,
            orgIdOverride
        );

        return this.getInitiativeData(obeyaRoom, relationType, timezone);
    }



    /**
     * Get the obeya data using the data saved in 
     * context work item maps. 
     * 
     * This method does not run the expensive recursive SQL 
     * query to get the obeya data. So this method is 
     * much faster. 
     * 
     * initiative-context-mapping runs at a regular interval 
     * to set the data in the context work item maps table
     */
    async getSavedObeyaData(
        obeyaRoomId: string,
        timezone?: string,
    ): Promise<ExtendedStateItem[]> {
        const database = await this.aurora;
        const contextIdsResult = await database.query(`
            select 
                orm."roomName", 
                orm."roomName", 
                c."contextId"
            from obeya_rooms orm 
                join contexts c on c."obeyaId" = orm."roomId" and c."orgId" = orm."orgId"
            where 
                orm."orgId" = :orgId
                and c.archived = false
                and orm."roomId" = :roomId
            order by c."contextId"
        `, {
            replacements: {
                orgId: this.orgId,
                roomId: obeyaRoomId
            },
            type: QueryTypes.SELECT
        });
        const contextIds = _.chain(contextIdsResult).map((row: any) => row.contextId).uniq().value();
        const workItemIdsResult = await database.query(`
            select 
                distinct(cwim."workItemId") 
            from "contextWorkItemMaps" cwim
            where 
                "contextId" = any(array[:contextIds]::text[])
                and "orgId" = :orgId
            order by "workItemId"
        `, {
            replacements: {
                orgId: this.orgId,
                contextIds
            },
            type: QueryTypes.SELECT
        });

        const workItemIds = workItemIdsResult.map((row: any) => row.workItemId);
        const workItemsResult = await database.query(`
            select 
                * 
            from states s
            where 
                "workItemId" = any(array[:workItemIds]::text[])
                and "partitionKey" = 'state#' || :orgId
            order by "workItemId"
        `, {
            replacements: {
                orgId: this.orgId,
                workItemIds
            },
            type: QueryTypes.SELECT
        });

        const transformedItems = workItemsResult.map((item: any) =>
            convertDbResultToExtendedStateItem(
                item,
                timezone,
                item.normalisedDisplayName ?? (item as any).displayName,
            ),
        );

        return uniqBy(transformedItems, 'workItemId');
    }

    /**
     * Not a good name. Figure out a better name
     * 
     * Obeya == Initiative. We used to call it Obeya, but
     * we call it an Initiative now
     */
    async getInitiativeData(
        obeyaRoom: ObeyaRoom,
        relationType?: RelatedTypes,
        timezone?: string,
        /**
         * This param is required if we're calling this method 
         * for different orgs
         */
    ): Promise<ExtendedStateItem[]> {
        const {
            includeChildren,
            includeRelated,
            includeChildrenOfRelated,
            hierarchyLevel,
            linkTypes,
        } = obeyaRoom || {
            includeChildren: false,
            includeRelated: false,
            includeChildrenOfRelated: false,
        };

        /***
         * 1. Get all work items with include FQL filters
         * 2. Get all work items with exclude FQL filters
         * 3. Keep only the items in 1 that are NOT in 2
         *
         * We have to do this because getExtendedWorkItems* does not support exclude right now.
         * So we fetch the 2 lists of items and filter out the items to exclude
         */

        // Get Work Item Ids from filter expression
        /**
         * All items matching the include FQL filter
         */
        const allItems: ExtendedStateItem[] =
            (await this.getItemsFromFilterExpression(obeyaRoom)) || [];

        /**
         * All items matching the exclude FQL filter
         */
        const itemsToExclude: ExtendedStateItem[] =
            (await this.getItemsFromExcludeFilterExpression(obeyaRoom)) || [];

        // Exclude the items
        const itemsToExcludeSet = new Set(
            itemsToExclude.map((wi) => wi.workItemId),
        );
        const itemsToKeep = allItems.filter(
            (wi) => itemsToExcludeSet.has(wi.workItemId) === false,
        );

        // Join the work item IDs to a string
        // TODO: Refactor getObeyaWorkItems to take lists instead of strings
        const workItemsIdsOfFilterExpression = this.getWorkItemIdsToQuery(
            allItems,
        );
        const workItemsIdsOfExcludeFilterExpression = this.getWorkItemIdsToQuery(
            itemsToExclude,
        );

        if (allItems.length && allItems.length > 0) {
            const obeyaRawRoomData: any[] = await this.state.getObeyaWorkItems({
                orgId: obeyaRoom.orgId!,
                workItemIds: workItemsIdsOfFilterExpression,
                includeChildren,
                includeRelated,
                includeChildrenOfRelated,
                relationType,
                hierarchyLevel,
                excludeWorkItemIds: workItemsIdsOfExcludeFilterExpression,
                linkTypes,
            });

            const obeyaRoomData = obeyaRawRoomData.map((item) =>
                convertDbResultToExtendedStateItem(
                    item,
                    timezone,
                    item.normalisedDisplayName ?? item.displayName,
                ),
            );

            return uniqBy([...itemsToKeep, ...obeyaRoomData], 'workItemId');
        } else {
            return uniqBy([...itemsToKeep], 'workItemId');
        }
    }

    async getObeyaWorkflowItems(
        allWorkItemsWithinContexts: ObeyaContextsWithWorkItems,
    ): Promise<Array<any>> {
        const formattedBoards: Array<WorkFlowBoard> = [];
        const allBoards: WorkFlowBoard = {
            contextId: 'All boards',
            contextName: 'All boards',
            completed: [],
            inProgress: [],
            proposed: [],
        };

        Object.values(allWorkItemsWithinContexts).forEach(
            (context: DefaultWorkflowItem) => {
                const { completed, inprogress, proposed } = groupBy(
                    context.workItems,
                    'stateCategory',
                );

                const newItem = {
                    contextId: context.contextId,
                    contextName: context?.contextName || context.contextId,
                    completed,
                    inProgress: inprogress,
                    proposed,
                };

                formattedBoards.push(newItem);
                allBoards.completed = [
                    ...allBoards.completed,
                    ...(completed || []),
                ];
                allBoards.inProgress = [
                    ...allBoards.inProgress,
                    ...(inprogress || []),
                ];
                allBoards.proposed = [
                    ...allBoards.proposed,
                    ...(proposed || []),
                ];
            },
        );

        return [allBoards, ...formattedBoards];
    }

    async getRoadmapWorkflowItems(
        allWorkItemsWithinContexts: ObeyaContextsWithWorkItems,
        allBoards: any[],
    ): Promise<RoadmapResponse> {
        const formattedItems: any[] = [];
        const uniqueWorkItemIds: Set<string> = new Set();

        const customFieldsModel = await CustomFields();
        const contextModel = await ContextModel();
        const customFieldsConfigsPromise = customFieldsModel.findAll({
            where: { orgId: this.orgId, deletedAt: null } as any,
        });
        const customFieldsConfigs = await customFieldsConfigsPromise;

        let classOfServiceCustomField: string | undefined = undefined;

        // Iterate over each context and its associated work items
        for (const context of Object.values(allWorkItemsWithinContexts)) {
            // Retrieve context model based on context ID
            const contextPromise = contextModel.findOne({
                where: { contextId: context.contextId } as any,
            });
            const contextModelResponse = await contextPromise;

            if (contextModelResponse) {
                // Find the custom field corresponding to class of service
                classOfServiceCustomField = customFieldsConfigs.find(
                    (i) =>
                        i.datasourceId === contextModelResponse.datasourceId &&
                        i.tags?.includes(tags.classOfService)
                )?.datasourceFieldName;
            }

            // Iterate over each work item within the context
            for (const item of context.workItems) {
                // Calculate roadmap start and end date/time for the item
                const newItem = {
                    ...item,
                    ...(await calculateRoadmapStartEndDateTime(
                        item,
                        allBoards,
                        classOfServiceCustomField
                    )),
                    contextId: context.contextId,
                    contextName: context.contextName ?? context.contextId,
                    isActual: item.commitmentDateTime?.toISO() !== null && item.departureDateTime?.toISO() !== null,
                    isCalculatedDate: item.commitmentDateTime?.toISO() !== null && item.departureDateTime?.toISO() === null,
                    isUserDefinedDate: item.departureDateTime?.toISO() === null && item.targetEndDateTime?.toISO() !== null,
                };

                // Add the item to the formattedItems array if it has a unique work item ID
                if (!uniqueWorkItemIds.has(item.workItemId!)) {
                    uniqueWorkItemIds.add(item.workItemId!);
                    formattedItems.push(newItem);
                }
            }
        }

        return {
            roadmap: formattedItems,
        };
        // Sort the formattedItems array based on target start date/time
        // return formattedItems.sort(
        //     (a, b) => a.targetStart.toMillis() - b.targetStart.toMillis()
        // );
    }


    /**
     * Find context for the obeya , create one if it doesn't exist.
     * Compare the contextWorkItemMap for the found context and insert/delete workitems to the mapping based on the list of workItems linked to the obeya currently.
     */
    async populateObeyaContext(
        /**
         * orgId has to be a parameter here because this method has to be called 
         * for multiple orgs
         */
        orgId: string,
        obeyaData: StateItem[],
        obeyaRoomId: string
    ) {
        const contextModel = await ContextModel();
        const where: any = {
            obeyaId: obeyaRoomId,
            orgId,
            archived: false,
        };
        const contexts = await contextModel.findAll({
            where,
            raw: true,
        });
        // Default the datasourceId to one of the non-obeya contexts of the org when inserting records sincee this field is needed for integrity of the tables , but not actively used as part of dummy obeya contexts.
        const obeyaContexts = contexts.filter(
            (context) => context.obeyaId === obeyaRoomId,
        );
        let contextToInsert;
        // Create contexts for the obeya if they don't already exist with the same name as the obeya room.
        const obeyaRoom: ObeyaRoom = await this.getObeyaRoom(
            obeyaRoomId,
            orgId
        );
        if (obeyaContexts.length === 0) {
            // This can happen for obeyas that have been created, but 
            // for whatever reason, the contexts arent created. 
            const createdContexts = await this.obeyaRoomsCalculations
                .createContextsForObeyaRoom(obeyaRoom);
            contextToInsert = createdContexts.find((item) =>
                item.positionInHierarchy?.includes('.'),
            );
        } else {
            contextToInsert = obeyaContexts.find((item) =>
                item.positionInHierarchy.includes('.'),
            );
        }

        await this.state.syncContextWorkItemMapForObeya(
            contextToInsert?.contextId ?? '',
            obeyaData.map((item) => item.workItemId ?? ''),
            orgId,
            contextToInsert?.datasourceId ?? '',
        );
    }

    async getFocus(progressBoards: BoardItem[], obeyaWorkItemIds: string[]) {
        const aurora = await this.aurora;
        console.log(progressBoards);
        const contextIds = progressBoards.map(x => x.contextId);
        if (contextIds.length === 0) {
            return {};
        }
        const [
            proposed,
            wip
        ] = await Promise.all([
            this.workItemQueries.getItemsByContextAndScenario(
                contextIds,
                [RetrievalScenario.CURRENT_INVENTORY_ONLY],
                this.orgId!,
                Interval.fromDateTimes(DateTime.now(), DateTime.now()),
                this.filters,
                false
            ),
            this.workItemQueries.getItemsByContextAndScenario(
                contextIds,
                [RetrievalScenario.CURRENT_WIP_ONLY],
                this.orgId!,
                Interval.fromDateTimes(DateTime.now(), DateTime.now()),
                this.filters,
                false
            )
        ]);
        
        const returnValue: {
            contextId: string;
            totalWipItems: number;
            obeyaWipItems: number;
            totalProposedItems: number;
            obeyaProposedItems: number;
            boardName: string;
            focusMarker: number;
        }[] = [];
        progressBoards.forEach(board => {
            const totalWipItems = wip.filter(x => x.contextId === board.contextId).length;
            const obeyaWipItems = _.uniqBy(wip.filter(x => x.workItemId && obeyaWorkItemIds.includes(x.workItemId) && x.contextId === board.contextId), 'workItemId').length;
            returnValue.push({
                contextId: board.contextId,
                totalWipItems,
                obeyaWipItems,
                totalProposedItems: proposed.filter(x => x.contextId === board.contextId).length,
                obeyaProposedItems: _.uniqBy(proposed.filter(x => x.workItemId && obeyaWorkItemIds.includes(x.workItemId) && x.contextId === board.contextId), 'workItemId').length,
                boardName: board.boardName,
                focusMarker: isNaN(obeyaWipItems / totalWipItems) ? 0 : Math.round((obeyaWipItems / totalWipItems) * 100)
            });
        });
        return returnValue;
    }

    private getEmptyBurnData = (): ObeyaScopeBurnData => {
        const emptyBurndown: ObeyaBurndownSeries = {
            dates: [],
            remainingWork: [],
            dailyTargets: [],
        };

        const emptyBurnup: ObeyaBurnupSeries = {
            dates: [],
            accomplishedWork: [],
            dailyTargets: [],
            scope: [],
        };

        const emptyBurnData: ObeyaScopeBurnData = {
            burndown: emptyBurndown,
            burnup: emptyBurnup,
        };
        return emptyBurnData;
    };

    private convertToSimpleDateTime = (date: Date): DateTime => {
        const { day, month, year } = DateTime.fromJSDate(date);
        const simpleDateTime = DateTime.fromObject({
            day,
            month,
            year,
        });

        return simpleDateTime;
    };

    private selectItemsByDeparture = (
        workItems: StateItem[],
    ): ObeyaDailyRecord[] => {
        const isDateTimeValid = (
            date: DateTime | undefined,
        ): date is DateTime =>
            date !== null && date !== undefined && date.isValid;
        const setDepartureToStartOfDay = (workItem: StateItem): StateItem => {
            const departureDateTime = workItem?.departureDateTime;

            if (!isDateTimeValid(departureDateTime)) {
                return workItem;
            }
            const { day, month, year } = departureDateTime;
            const simpleDate = DateTime.fromObject({ day, month, year });

            const updatedWorkItem = {
                ...workItem,
                departureDateTime: simpleDate,
            };

            return updatedWorkItem;
        };

        // Each resulting element contains a date string and work items associated with date
        const daysWithCompletedWork: ObeyaDateWorkItemsPair[] = chain(workItems)
            .map(setDepartureToStartOfDay)
            .groupBy('departureDateTime')
            .toPairs()
            .value();

        const dailyRecords = this.transformToDailyRecord(daysWithCompletedWork);

        return dailyRecords;
    };

    private selectItemsByArrival = (
        workItems: StateItem[],
    ): ObeyaDailyRecord[] => {
        const isDateTimeValid = (
            date: DateTime | undefined,
        ): date is DateTime =>
            date !== null && date !== undefined && date.isValid;

        // Ignore completed work items
        const hasNoDepartureDate = (workItem: StateItem) => {
            const departureDateTime = workItem?.departureDateTime;

            return !isDateTimeValid(departureDateTime);
        };

        // Ignore hour/minute/seconds
        const setArrivalToStartOfDay = (workItem: StateItem): StateItem => {
            const arrivalDateTime = workItem?.arrivalDateTime;

            if (!isDateTimeValid(arrivalDateTime)) {
                return workItem;
            }
            const { day, month, year } = arrivalDateTime;
            const simpleDate = DateTime.fromObject({ day, month, year });

            const updatedWorkItem = {
                ...workItem,
                arrivalDateTime: simpleDate,
            };

            return updatedWorkItem;
        };

        // Each resulting element contains a date string and work items associated with date
        const daysWithNewWork: ObeyaDateWorkItemsPair[] = chain(workItems)
            .filter(hasNoDepartureDate)
            .map(setArrivalToStartOfDay)
            .groupBy('arrivalDateTime')
            .toPairs()
            .value();

        const dailyRecords = this.transformToDailyRecord(daysWithNewWork);

        return dailyRecords;
    };

    private transformToDailyRecord = (
        workItems: ObeyaDateWorkItemsPair[],
    ): ObeyaDailyRecord[] => {
        const convertToDailyRecord = ([
            date,
            dayWorkItems,
        ]: ObeyaDateWorkItemsPair): ObeyaDailyRecord => {
            return {
                date: date,
                numWorkItems: dayWorkItems.length,
            };
        };
        const isDateStringNotNull = ({ date }: ObeyaDailyRecord): boolean => {
            try {
                const parsedDate = DateTime.fromISO(date);
                return parsedDate.isValid;
            } catch (e) {
                return false;
            }
        };

        const records: ObeyaDailyRecord[] = chain(workItems)
            .map(convertToDailyRecord)
            .filter(isDateStringNotNull)
            .value();

        return records;
    };

    private combineRecordsBeforeStart = (
        productiveDays: ObeyaDailyRecord[],
        beginDateTime: DateTime,
    ): ObeyaDailyRecord[] => {
        // Count all items completed before begin date and store in begin date record
        const isDayBeforeStart = (record: ObeyaDailyRecord) =>
            DateTime.fromISO(record.date) <= beginDateTime;
        const [priorWork, futureWork] = partition(
            productiveDays,
            isDayBeforeStart,
        );

        const sumWorkItems = (sum: number, record: ObeyaDailyRecord) =>
            sum + record.numWorkItems;
        const priorWorkCount: number = priorWork.reduce(sumWorkItems, 0);

        const firstDay: ObeyaDailyRecord = {
            date: beginDateTime.toISO(),
            numWorkItems: priorWorkCount,
        };

        return [firstDay].concat(futureWork);
    };

    private getEmptyDateRange = (
        initialDate: DateTime,
        totalDays: number,
    ): string[] => {
        const daysIndices: number[] = range(0, totalDays);
        const generateRecordByOffset = (dayIdx: number): string => {
            const daysOffset: Duration = Duration.fromObject({ days: dayIdx });
            const date: DateTime = initialDate.plus(daysOffset);

            return date.toISO();
        };

        return daysIndices.map(generateRecordByOffset);
    };

    private fillMissingDates = (
        productiveDays: ObeyaDailyRecord[],
        beginDate: DateTime,
        totalDays: number,
    ): ObeyaDailyRecord[] => {
        const allDates: string[] = this.getEmptyDateRange(beginDate, totalDays);
        const workDates: string[] = productiveDays.map(({ date }) => date);
        const noWorkDates: string[] = difference(allDates, workDates);

        const emptyDays: ObeyaDailyRecord[] = noWorkDates.map(
            (date: string) => ({ date, numWorkItems: 0 }),
        );

        const fullRecords: ObeyaDailyRecord[] = concat(
            productiveDays,
            emptyDays,
        );

        return fullRecords;
    };

    private isPriorToTodayVerifier = (): DateCheckFunction => {
        // Generates function to tell if date is prior to today
        const today = DateTime.now();
        const simpleToday = DateTime.fromObject({
            day: today.day,
            month: today.month,
            year: today.year,
        });

        const isPriorToToday = (date: string) =>
            DateTime.fromISO(date) <= simpleToday;
        return isPriorToToday;
    };

    private preprocessDailyRecords = (
        dailyRecords: ObeyaDailyRecord[],
        beginDateTime: DateTime,
        numDays: number,
    ): ObeyaDailyRecord[] => {
        const adjustedDailyRecords: ObeyaDailyRecord[] = this.combineRecordsBeforeStart(
            dailyRecords,
            beginDateTime,
        );

        const fullDailyRecords: ObeyaDailyRecord[] = this.fillMissingDates(
            adjustedDailyRecords,
            beginDateTime,
            numDays,
        );

        const sortedRecords: ObeyaDailyRecord[] = sortBy(
            fullDailyRecords,
            'date',
        );

        return sortedRecords;
    };

    private calculateBurndown = (
        dailyRecords: ObeyaDailyRecord[],
        totalRemainingWork: number,
    ): ObeyaBurndownSummary => {
        // Determine Target Line
        const targetStart = totalRemainingWork - dailyRecords[0].numWorkItems;
        const numDays = dailyRecords.length;
        const burnDailyOffset = targetStart / numDays;

        // Burndown only calculated for days before today
        const isPriorToToday: DateCheckFunction = this.isPriorToTodayVerifier();

        const burndownDataReducer = (
            summary: ObeyaBurndownSummary,
            dailyRecord: ObeyaDailyRecord,
        ): ObeyaBurndownSummary => {
            const {
                updatedRecords,
                lastTarget,
                cumulativeWork,
                totalRemainingWork,
                burnDailyOffset,
            } = summary;

            // Every day, we reduce a constant amount from the previous target to obtain the daily target
            const dailyTarget = lastTarget - burnDailyOffset;
            const accomplishedWork = cumulativeWork + dailyRecord.numWorkItems;
            const remainingWorkCount = isPriorToToday(dailyRecord.date)
                ? totalRemainingWork - accomplishedWork
                : null;

            const updatedDailyRecord: ObeyaDailyBurndown = {
                date: dailyRecord.date,
                dailyTarget,
                remainingWorkCount,
            };

            const newSummary: ObeyaBurndownSummary = {
                updatedRecords: updatedRecords.concat([updatedDailyRecord]),
                lastTarget: dailyTarget,
                cumulativeWork: accomplishedWork,
                totalRemainingWork,
                burnDailyOffset,
            };
            return newSummary;
        };

        const initialState: ObeyaBurndownSummary = {
            updatedRecords: [],
            lastTarget: targetStart,
            cumulativeWork: 0,
            totalRemainingWork,
            burnDailyOffset,
        };

        return dailyRecords.reduce(burndownDataReducer, initialState);
    };

    private calculateBurnup = (
        dailyRecords: ObeyaDailyRecord[],
        totalRemainingWork: number,
        scope: number[],
    ): ObeyaBurnupSummary => {
        // Determine Target Line
        const targetStart = dailyRecords[0].numWorkItems;
        const targetEnd = scope[scope.length - 1];
        const numDays = dailyRecords.length;
        const burnDailyOffset = (targetEnd - targetStart) / numDays;

        // Burnup only calculated for days before today
        const isPriorToToday: DateCheckFunction = this.isPriorToTodayVerifier();

        const burnupDataReducer = (
            summary: ObeyaBurnupSummary,
            dailyRecord: ObeyaDailyRecord,
        ): ObeyaBurnupSummary => {
            const {
                updatedRecords,
                lastTarget,
                cumulativeWork,
                targetTotal,
                burnDailyOffset,
            } = summary;

            // Every day, we add a constant amount to the previous target to obtain the daily target
            const dailyTarget = lastTarget + burnDailyOffset;
            const finishedWork = isPriorToToday(dailyRecord.date)
                ? cumulativeWork + dailyRecord.numWorkItems
                : null;

            const updatedDailyRecord: ObeyaDailyBurnup = {
                date: dailyRecord.date,
                finishedWork,
                dailyTarget,
            };

            const newSummary: ObeyaBurnupSummary = {
                updatedRecords: updatedRecords.concat([updatedDailyRecord]),
                lastTarget: dailyTarget,
                cumulativeWork: cumulativeWork + dailyRecord.numWorkItems,
                targetTotal,
                burnDailyOffset,
            };
            return newSummary;
        };

        const initialState: ObeyaBurnupSummary = {
            updatedRecords: [],
            lastTarget: targetStart,
            cumulativeWork: 0,
            targetTotal: targetEnd,
            burnDailyOffset,
        };

        return dailyRecords.reduce(burnupDataReducer, initialState);
    };

    private calculateScope = (
        newWorkRecords: ObeyaDailyRecord[],
        totalRemainingWork: number,
    ) => {
        // Determine Scope at Start
        const sumUp = (sum: number, dailyRecord: ObeyaDailyRecord): number =>
            sum + dailyRecord.numWorkItems;
        const addedScope = newWorkRecords.reduce(sumUp, 0);

        const startingScope = totalRemainingWork - addedScope;

        // Calculate Rest of Scope
        const scopeReducer = (
            summary: ObeyaScopeSummary,
            dailyRecord: ObeyaDailyRecord,
        ): ObeyaScopeSummary => {
            const { updatedRecords, accumulatedScope } = summary;

            const newScope = accumulatedScope + dailyRecord.numWorkItems;

            const updatedRecord: ObeyaDailyScope = {
                ...dailyRecord,
                scope: newScope,
            };

            return {
                updatedRecords: updatedRecords.concat(updatedRecord),
                accumulatedScope: newScope,
            };
        };

        const emptySummary: ObeyaScopeSummary = {
            updatedRecords: [],
            accumulatedScope: startingScope,
        };
        return newWorkRecords.reduce(scopeReducer, emptySummary);
    };

    private stripTimestamp = (date: string): string => {
        return DateTime.fromISO(date).toISODate();
    };

    private buildBurndownSeries = (
        completedWorkRecords: ObeyaDailyRecord[],
        totalRemainingWork: number,
    ): ObeyaBurndownSeries => {
        const { updatedRecords }: ObeyaBurndownSummary = this.calculateBurndown(
            completedWorkRecords,
            totalRemainingWork,
        );

        // Extract Data for Chart
        const dates = updatedRecords.map(({ date }) =>
            this.stripTimestamp(date),
        );
        const remainingWork = updatedRecords.map(
            ({ remainingWorkCount }) => remainingWorkCount,
        );
        const dailyTargets = updatedRecords.map(
            ({ dailyTarget }) => dailyTarget,
        );
        const burndown: ObeyaBurndownSeries = {
            dates,
            remainingWork,
            dailyTargets,
        };

        return burndown;
    };

    private buildScopeSeries = (
        validWorkItems: StateItem[],
        beginDateTime: DateTime,
        numDays: number,
        totalRemainingWork: number,
    ): number[] => {
        const newWorkRecordsRaw: ObeyaDailyRecord[] = this.selectItemsByArrival(
            validWorkItems,
        );

        const newWorkRecords: ObeyaDailyRecord[] = this.preprocessDailyRecords(
            newWorkRecordsRaw,
            beginDateTime,
            numDays,
        );

        const { updatedRecords } = this.calculateScope(
            newWorkRecords,
            totalRemainingWork,
        );

        const scope = updatedRecords.map(({ scope }) => scope);

        return scope;
    };

    private buildBurnupSeries = (
        completedWorkRecords: ObeyaDailyRecord[],
        totalRemainingWork: number,
        validWorkItems: StateItem[],
        beginDateTime: DateTime,
        numDays: number,
    ) => {
        const scope: number[] = this.buildScopeSeries(
            validWorkItems,
            beginDateTime,
            numDays,
            totalRemainingWork,
        );

        const { updatedRecords }: ObeyaBurnupSummary = this.calculateBurnup(
            completedWorkRecords,
            totalRemainingWork,
            scope,
        );

        // Extract Data for Chart
        const dates = updatedRecords.map(({ date }) =>
            this.stripTimestamp(date),
        );
        const accomplishedWork = updatedRecords.map(
            ({ finishedWork }) => finishedWork,
        );
        const dailyTargets = updatedRecords.map(
            ({ dailyTarget }) => dailyTarget,
        );

        const burnup: ObeyaBurnupSeries = {
            dates,
            accomplishedWork,
            dailyTargets,
            scope,
        };

        return burnup;
    };

    async getObeyaScopeBurndown(
        obeyaRoomId: string,
        obeyaData: StateItem[],
    ): Promise<ObeyaScopeBurnData> {
        const obeyaRoom: ObeyaRoom = await this.getObeyaRoom(
            obeyaRoomId,
        );
        const { beginDate, endDate } = obeyaRoom || {};

        // Handle Invalid Room or Dates
        const isDateValid = (date: Date | undefined): date is Date =>
            date !== null && date !== undefined;
        if (!isDateValid(beginDate) || !isDateValid(endDate)) {
            return this.getEmptyBurnData();
        }

        // Disregard Hours/Minutes/Seconds
        const beginDateTime: DateTime = this.convertToSimpleDateTime(beginDate);
        const endDateTime: DateTime = this.convertToSimpleDateTime(endDate);

        const dateRange = Interval.fromDateTimes(beginDateTime, endDateTime);
        const dateRangeLength: number = dateRange.length('days');
        const numDays: number = dateRangeLength > 0 ? dateRangeLength : 1;

        // Select and Process Work Items
        const validWorkItems: StateItem[] = uniqBy(obeyaData, 'workItemId');

        const completedWorkRecordsRaw: ObeyaDailyRecord[] = this.selectItemsByDeparture(
            validWorkItems,
        );

        const completedWorkRecords: ObeyaDailyRecord[] = this.preprocessDailyRecords(
            completedWorkRecordsRaw,
            beginDateTime,
            numDays,
        );

        const totalRemainingWork: number = validWorkItems.length;

        // Burndown and Burnup calculations
        const burndown: ObeyaBurndownSeries = this.buildBurndownSeries(
            completedWorkRecords,
            totalRemainingWork,
        );

        const burnup: ObeyaBurnupSeries = this.buildBurnupSeries(
            completedWorkRecords,
            totalRemainingWork,
            validWorkItems,
            beginDateTime,
            numDays,
        );

        return {
            burndown,
            burnup,
        };
    }

    async getContextsForObeya(): Promise<ObeyaContextItem[]> {
        const context: ObeyaContextItem[] = await this.state.getObeyaContexts(
            this.orgId,
        );
        return context;
    }

    async getContextIdsByCurrentOrg(): Promise<string[]> {
        const contextFromCurrentOrg = await this.getContextsForObeya();

        const contextIds: string[] = contextFromCurrentOrg.map(
            (context: ObeyaContextItem) => context.contextId,
        );

        return contextIds;
    }

    async getWorkItemIdsWithinContext(
        workItemIds: any[],
    ): Promise<
        {
            workItemId: string;
        }[]
    > {
        // get all contextIds of current org
        const contextIds: string[] = await this.getContextIdsByCurrentOrg();

        const workItemIdsWithinContext: {
            contextId: string;
            workItemId: string;
        }[] = await this.state.getContextsItemMapByWorkItemId(
            this.orgId,
            workItemIds,
            contextIds,
        );

        return workItemIdsWithinContext;
    }

    async getContextNamesMapping(): Promise<{
        [contextId: string]: string;
    }> {
        const contextFromCurrentOrg = await this.getContextsForObeya();

        const contextNamesMap: {
            [contextId: string]: string;
        } = contextFromCurrentOrg.reduce(
            (
                acc: { [contextId: string]: string; },
                currentContext: ObeyaContextItem,
            ) => {
                if (currentContext.name) {
                    acc[currentContext.contextId] = currentContext.name;
                }
                return acc;
            },
            {},
        );

        return contextNamesMap;
    }

    async getContextsWithRelatedWorkItems(
        obeyaData: ExtendedStateItem[],
        columnNames?: string[],
        formatterWorkItem?: (workItem: any) => any,
    ): Promise<ObeyaContextsWithWorkItems> {
        const workItemsIds = obeyaData.reduce(
            (acc: string[], workItem: ExtendedStateItem) => {
                if (workItem?.workItemId) {
                    acc.push(workItem?.workItemId);
                }
                return acc;
            },
            [],
        );

        const contextIds: string[] = await this.getContextIdsByCurrentOrg();

        const contextWithWorkItemId: {
            contextId: string;
            workItemId: string;
        }[] = await this.state.getContextsItemMapByWorkItemId(
            this.orgId,
            workItemsIds,
            contextIds,
        );

        const contextNamesMap: {
            [contextId: string]: string;
        } = await this.getContextNamesMapping();

        // valid context is context from current orgId we might exclude some context from workId that not belongs
        // our org to avoid show data from the context of another org
        const workItemWithinValidContexts = contextWithWorkItemId.filter(
            (contextWithWorkItem) =>
                contextIds.includes(contextWithWorkItem.contextId),
        );

        const contextsWithWorkItems: ObeyaContextsWithWorkItems = {};

        // Should go through each context and create a collection of context with his related
        // this is useful on Obeya page to means each (board)
        workItemWithinValidContexts.forEach((currentContext: any) => {
            const currentWorkItem = obeyaData.find(
                (workItem: StateItem) =>
                    !!(workItem?.workItemId === currentContext?.workItemId),
            );

            if (
                !Object.keys(contextsWithWorkItems).includes(
                    currentContext?.contextId,
                )
            ) {
                contextsWithWorkItems[currentContext?.contextId] = {
                    contextId: currentContext?.contextId,
                    contextName:
                        contextNamesMap[currentContext?.contextId] ||
                        currentContext?.contextId,
                    workItems: [
                        formatterWorkItem?.(currentWorkItem) || currentWorkItem,
                    ],
                };
            } else if (currentWorkItem) {
                contextsWithWorkItems?.[
                    currentContext?.contextId
                ]?.workItems.push(
                    formatterWorkItem?.(currentWorkItem) || currentWorkItem,
                );
            }
        });

        return contextsWithWorkItems;
    }

    async getAllContextsWithWorkItems(
        obeyaData: StateItem[],
    ): Promise<ObeyaContextsWithWorkItems> {
        const workItemsIds = obeyaData.reduce(
            (acc: string[], workItem: StateItem) => {
                if (workItem?.workItemId) {
                    acc.push(workItem?.workItemId);
                }
                return acc;
            },
            [],
        );

        const contextFromCurrentOrg: ObeyaContextItem[] = await this.state.getObeyaContexts(
            this.orgId,
        );

        const contextIds: string[] = contextFromCurrentOrg.map(
            (context: ObeyaContextItem) => context.contextId,
        );

        const contextWithWorkItemId: {
            contextId: string;
            workItemId: string;
        }[] = await this.state.getContextsItemMapByWorkItemId(
            this.orgId,
            workItemsIds,
            contextIds,
        );

        const contextNamesMap: {
            [contextId: string]: string;
        } = contextFromCurrentOrg.reduce(
            (
                acc: { [contextId: string]: string; },
                currentContext: ObeyaContextItem,
            ) => {
                if (currentContext.name) {
                    acc[currentContext.contextId] = currentContext.name;
                }
                return acc;
            },
            {},
        );

        const contextsWithWorkItems: ObeyaContextsWithWorkItems = {};

        // Should go through each context and create a collection of context with his related
        // this is useful on Obeya page to means each (board)
        contextWithWorkItemId.forEach((currentContext: any) => {
            const currentWorkItem = obeyaData.find(
                (workItem: StateItem) =>
                    !!(workItem?.workItemId === currentContext?.workItemId),
            );

            if (
                !Object.keys(contextsWithWorkItems).includes(
                    currentContext?.contextId,
                )
            ) {
                contextsWithWorkItems[currentContext?.contextId] = {
                    contextId: currentContext?.contextId,
                    contextName:
                        contextNamesMap[currentContext?.contextId] ||
                        currentContext?.contextId,
                    workItems: [currentWorkItem as ExtendedStateItem],
                };
            } else if (currentWorkItem) {
                contextsWithWorkItems?.[
                    currentContext?.contextId
                ]?.workItems.push(currentWorkItem);
            }
        });

        // including empty contexts
        const allContextsWithWorkItems: ObeyaContextsWithWorkItems = {
            ...contextsWithWorkItems,
        };
        Object.keys(contextNamesMap).forEach((contextId) => {
            if (!contextsWithWorkItems[contextId]) {
                allContextsWithWorkItems[contextId] = {
                    contextId: contextId,
                    contextName: contextNamesMap[contextId] || contextId,
                    workItems: [],
                };
            }
        });

        return allContextsWithWorkItems;
    }

    async getObeyaRoom(obeyaRoomId: string, orgId?: string): Promise<ObeyaRoom> {
        const key = `obeya-room-orgId-${orgId ?? ''}-${obeyaRoomId}`;
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        const obeyaRoom = this.obeyaRoomsCalculations.getObeyaRoom(
            obeyaRoomId,
            orgId
        );
        this.cache.set(key, obeyaRoom);
        return obeyaRoom;
    }

    computeBoundaries(obeyaRoom: ObeyaRoom, obeyaData: ExtendedStateItem[]) {
        let lowerBoundaryDate = DateTime.min(
            ...obeyaData.reduce((acc: DateTime[], item: StateItem) => {
                if (item.arrivalDateTime?.isValid) {
                    acc.push(item.arrivalDateTime);
                }
                return acc;
            }, []),
        );
        if (lowerBoundaryDate === undefined && obeyaRoom.beginDate) {
            lowerBoundaryDate = DateTime.fromJSDate(obeyaRoom.beginDate);
        }

        let upperBoundaryDate = DateTime.max(
            ...obeyaData.reduce((acc: DateTime[], item: StateItem) => {
                if (item.departureDateTime?.isValid) {
                    acc.push(item.departureDateTime);
                }
                return acc;
            }, []),
        );
        if (upperBoundaryDate === undefined && obeyaRoom.endDate) {
            upperBoundaryDate = DateTime.fromJSDate(obeyaRoom.endDate);
        }
        if (obeyaRoom.endDate) {
            upperBoundaryDate = DateTime.min(
                DateTime.fromJSDate(obeyaRoom.endDate),
                upperBoundaryDate,
            );
        }
        return {
            lowerBoundaryDate,
            upperBoundaryDate
        };
    }

    /**
     * Get the contexts created for the obeya room
     */
    async getContextsOfObeya(orgId: string, obeyaRoom: ObeyaRoom) {
        const contextModel = await ContextModel();
        const where: any = {
            obeyaId: obeyaRoom.roomId,
            orgId,
        };
        const result = await contextModel.findAll({
            where,
            raw: true,
        });

        const contexts = result.map((item) => {
            return {
                contextId: item.contextId,
                positionInHierarchy: item.positionInHierarchy,
            };
        });
        return contexts;
    }
}

export const getFormattedWorkflowItem = (
    workItem: StateItem,
    excludeWeekends = false
): DefaultWorkFlowItem => {
    let leadTimeInWholeDays = getLeadTimeInWholeDaysFunc({
        arrivalDateTime: DateTime.fromISO(workItem.arrivalDate!),
        commitmentDateTime: DateTime.fromISO(workItem.commitmentDate!),
        departureDateTime: DateTime.fromISO(workItem.departureDate!),
        excludeWeekends
    });

    return {
        workItemId: workItem.workItemId,
        title: workItem.title,
        state: workItem.state,
        stateCategory: workItem.stateCategory,
        workItemType: workItem.workItemType,
        arrivalDate: workItem?.arrivalDate,
        commitmentDate: workItem?.commitmentDate,
        departureDate: workItem?.departureDate,
        commitmentDateTime: workItem?.commitmentDateTime,
        departureDateTime: workItem?.departureDateTime,
        flomatikaWorkItemTypeLevel: workItem?.flomatikaWorkItemTypeLevel,
        flagged: (workItem as any)?.flagged,
        parentId: workItem?.parentId,
        assignedTo: workItem?.assignedTo,
        targetStart: workItem?.targetStart,
        targetEnd: workItem?.targetEnd,
        targetStartDateTime: workItem?.targetStartDateTime,
        targetEndDateTime: workItem?.targetEndDateTime,
        baselines: workItem?.baselines,
        dependencies: workItem?.dependencies,
        leadTimeInWholeDays,
        flomatikaWorkItemTypeId: workItem?.flomatikaWorkItemTypeId,
        flomatikaWorkItemTypeServiceLevelExpectationInDays:
            workItem?.flomatikaWorkItemTypeServiceLevelExpectationInDays,
        linkedItems: workItem?.linkedItems,
    };


};

const getIndividualContributors = (
    workItem: StateItem,
): DefaultIndividualContributor => {
    return {
        workItemId: workItem.workItemId,
        state: workItem.state,
        stateCategory: workItem.stateCategory,
        workItemType: workItem.workItemType,
        assignedTo: workItem.assignedTo,
    };
};
