import { chain, filter, intersection, omit, orderBy, result, values } from 'lodash';
import { DateAnalysisOptions, IQueryFilters } from '../../../common/filters_v2';
import { ExtendedItemGroups, WorkItemGroup } from '../../../common/interfaces';
import { SecurityContext } from '../../../common/security';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { ExtendedStateItem, RetrievalScenario, StateItem } from '../../../workitem/interfaces';
import { IState, StateCategory } from '../../../workitem/state_aurora';
import { PredefinedWidgetTypes } from '../common/enum';
import { ItemSelectionOptions } from './handler';
import { Calculations as SourceOfDelayAndWasteCalculations } from '../../delivery_governance/sources_of_delay_and_waste/calculations';

export interface WorkItemsByCategory {
    proposedItems: ExtendedStateItem[];
    inProgressItems: ExtendedStateItem[];
    completedItems: ExtendedStateItem[];
}

export interface KanbanBoardData {
    proposed: ExtendedItemGroups;
    inProgress: ExtendedItemGroups;
    completed: ExtendedItemGroups;
}

export type ExtendedStateItemSelector = (
    workItem: ExtendedStateItem,
) => boolean;

export class Calculations {
    readonly orgId: string;
    readonly state: IState;
    private filters?: IQueryFilters;
    private workItemCache: Map<string, Array<StateItem>> = new Map();
    readonly sourceOfDelayAndWasteCalculations: SourceOfDelayAndWasteCalculations;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(opts: {
        security: SecurityContext;
        state: IState;
        filters?: IQueryFilters;
        widgetInformationUtils: WidgetInformationUtils;
        sourceOfDelayAndWasteCalculations: SourceOfDelayAndWasteCalculations;
    }) {
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
        this.filters = opts.filters;
        this.widgetInformationUtils = opts.widgetInformationUtils;
        this.sourceOfDelayAndWasteCalculations = opts.sourceOfDelayAndWasteCalculations;
    }

    private static isToggled = (toggled: boolean | undefined) =>
        toggled === true;

    private async getItemsByScenario(
        stateCategory: StateCategory,
        dateAnalysisOption: DateAnalysisOptions,
        columnNames?: string[],
        ignoreDiscardedItems?: boolean,
    ): Promise<ExtendedStateItem[]> {
        const orgId = this.orgId;

        this.filters!.dateAnalysisOption = dateAnalysisOption;

        const { filterByDate, filterByStateCategory } = this.filters || {};

        const cacheKey = `${orgId}#${stateCategory}#${filterByDate}#${filterByStateCategory}#${dateAnalysisOption}#${JSON.stringify(columnNames)}#${JSON.stringify(ignoreDiscardedItems)}`;

        if (this.workItemCache.has(cacheKey)) {
            return this.workItemCache.get(cacheKey) || [];
        } else {
            const NO_FQL_FILTER = undefined;
            let scenario: RetrievalScenario;

            if (stateCategory === StateCategory.COMPLETED) {
                scenario = RetrievalScenario.BECAME_COMPLETED_BETWEEN_DATES;
            } else if (stateCategory === StateCategory.INPROGRESS) {
                scenario = RetrievalScenario.CURRENT_WIP_ONLY;
            } else if (stateCategory === StateCategory.PROPOSED) {
                scenario = RetrievalScenario.CURRENT_INVENTORY_ONLY;
            }

            const workItems = await this.state.getExtendedWorkItemsWithScenarios(
                this.orgId,
                [scenario!],
                this.filters,
                NO_FQL_FILTER,
                columnNames,
                undefined,
                ignoreDiscardedItems,
            );

            this.workItemCache.set(cacheKey, workItems);
            return workItems;
        }
    }

    static getInventoryItemsFilter(
        delayedItemsSelection: string,
    ): ExtendedStateItemSelector {
        const filter = ({
            stateCategory,
            isDelayed,
            commitmentDate,
            departureDate,
        }: ExtendedStateItem) => {
            if (delayedItemsSelection === 'inventory') {
                // Retrieve Items belonging to Proposed Category
                if (stateCategory === 'proposed') {
                    return true;
                }

                // Account for Delayed Items Selection
                if (stateCategory === 'inprogress' && isDelayed === true) {
                    return true;
                }

                return false;
            } else {
                // Retrieve only Items that have never been started or completed
                if (
                    stateCategory === 'proposed' &&
                    !commitmentDate &&
                    !departureDate
                ) {
                    return true;
                }

                return false;
            }
        };

        return filter;
    }

    static getInProgressItemsFilter(
        delayedItemsSelection: string,
    ): ExtendedStateItemSelector {
        const filter = ({ stateCategory, isDelayed }: ExtendedStateItem) => {
            if (delayedItemsSelection === 'wip') {
                // Retrieve all In Progress items, even delayed ones
                if (stateCategory === 'inprogress') {
                    return true;
                }

                return false;
            } else {
                // Retrieve only items that aren't delayed
                if (stateCategory === 'inprogress' && !isDelayed) {
                    return true;
                }

                return false;
            }
        };

        return filter;
    }

    static groupItemsByCategory(
        workItems: ExtendedStateItem[],
        delayedItemsSelection: string,
    ): WorkItemsByCategory {
        const inventoryFilter = Calculations.getInventoryItemsFilter(
            delayedItemsSelection,
        );
        const inProgressFilter = Calculations.getInProgressItemsFilter(
            delayedItemsSelection,
        );

        const proposedItems: ExtendedStateItem[] = workItems.filter(
            inventoryFilter,
        );
        const inProgressItems: ExtendedStateItem[] = workItems.filter(
            inProgressFilter,
        );
        const completedItems: ExtendedStateItem[] = filter(workItems, {
            stateCategory: 'completed',
        });

        return {
            proposedItems,
            inProgressItems,
            completedItems,
        };
    }

    private async retrieveWorkItems(includeDiscardedItems: boolean): Promise<ExtendedStateItem[]> {
        const requestedColumns = [
            'workItemId',
            'title',
            'state',
            'stateCategory',
            'workItemType',
            'arrivalDate',
            'commitmentDate',
            'departureDate',
            'changedDate',
            'flomatikaWorkItemTypeServiceLevelExpectationInDays',
            'assignedTo',
            'isUnassigned',
            'isStale',
            'isDelayed',
            'isAboveSle',
            'isAboveSleByWipAge',
            'flagged'
        ];
        // Retrieve Categories NOT Filtered by Date
        if (this.filters) {
            this.filters.filterByDate = false;
        }

        const proposedItems: ExtendedStateItem[] = await this.getItemsByScenario(
            StateCategory.PROPOSED,
            DateAnalysisOptions.all,
            requestedColumns,
            includeDiscardedItems ? false : undefined,
        );

        const inprogressItems: ExtendedStateItem[] = await this.getItemsByScenario(
            StateCategory.INPROGRESS,
            DateAnalysisOptions.all,
            requestedColumns,
            includeDiscardedItems ? false : undefined,
        );

        const completedItems: ExtendedStateItem[] = await this.getItemsByScenario(
            StateCategory.COMPLETED,
            DateAnalysisOptions.became,
            requestedColumns,
            includeDiscardedItems ? false : undefined,
        );

        const allWorkItems: ExtendedStateItem[] =
            inprogressItems.concat(proposedItems).concat(completedItems);

        for (const item of allWorkItems) {
            item.isDiscardedAfter = false;
            item.isDiscardedBefore = false;
        }

        if (includeDiscardedItems) {
            // Select discarded for calling source of delay and waste function to separate discarded items
            // Then apply the veredict into the ExtendedStateItem properties related to discarded items
            const discarded = await this.state.getDiscardedFromList(this.orgId, allWorkItems.map(a => a.workItemId as string));

            const discardedExtendedStateItems = allWorkItems.filter(item => discarded.includes(item.workItemId as string));
            const results = await this.sourceOfDelayAndWasteCalculations.separateDiscardedBeforeAndAfter(discardedExtendedStateItems as StateItem[]);
            const { before, after } = results as { before: ExtendedStateItem[], after: ExtendedStateItem[]; };


            for (const item of before) {
                item.isDiscardedAfter = false;
                item.isDiscardedBefore = true;
            }

            for (const item of after) {
                item.isDiscardedAfter = true;
                item.isDiscardedBefore = false;
            }

        }
        return allWorkItems;
    }

    static getItemSelector(
        selectionOptions: Partial<ItemSelectionOptions>,
        selectionOperator: string = 'or',
    ): ExtendedStateItemSelector {
        const { isToggled } = Calculations;

        const enabledSelectors: string[] = chain(selectionOptions)
            .pickBy(isToggled)
            .keys()
            .value();

        const pickItem = ({
            isBlocked,
            isStale,
            isAboveSle,
            isExpedited,
            isUnassigned,
            isDelayed,
            isDiscardedAfter,
            isDiscardedBefore,
        }: ExtendedStateItem): boolean => {
            const selectionCriterionMap = {
                includeBlocked: isBlocked,
                includeStale: isStale,
                includeAboveSle: isAboveSle,
                includeExpedited: isExpedited,
                includeUnassigned: isUnassigned,
                includeDelayed: isDelayed,
                includeDiscardedAfter: isDiscardedAfter,
                includeDiscardedBefore: isDiscardedBefore,
            };

            const validConditions = chain(selectionCriterionMap)
                .pick(enabledSelectors)
                .values()
                .value();

            // Check if AND operator requested. Default operator is OR.
            const isSelectedItem: boolean =
                selectionOperator === 'and'
                    ? validConditions.every(isToggled)
                    : validConditions.some(isToggled);

            return isSelectedItem;
        };

        return pickItem;
    }

    static containsActiveRestrictedFlags(
        selectionOptions: Partial<ItemSelectionOptions>,
        restrictedFlags: string[],
    ): boolean {
        const { isToggled } = Calculations;

        const activeFlagNames: string[] = chain(selectionOptions)
            .pickBy(isToggled)
            .keys()
            .value();

        const restrictedFlagsInOptions: string[] = intersection(
            activeFlagNames,
            restrictedFlags,
        );

        return restrictedFlagsInOptions.length > 0;
    }

    static applySelectionOptions(
        workItems: ExtendedStateItem[],
        selectionOptions: Partial<ItemSelectionOptions>,
        selectionOperator: string,
        restrictedFlags: string[] = [],
    ): ExtendedStateItem[] {
        const { isToggled, containsActiveRestrictedFlags } = Calculations;

        // Optionally censor flags
        const adjustedOptions: Partial<ItemSelectionOptions> = omit(
            selectionOptions,
            restrictedFlags,
        );

        const noRemainingOptions: boolean = !values(adjustedOptions).some(
            isToggled,
        );

        const isNecessarilyEmpty: boolean =
            selectionOperator === 'and' &&
            containsActiveRestrictedFlags(selectionOptions, restrictedFlags);

        if (noRemainingOptions || isNecessarilyEmpty) {
            return [];
        }

        // Apply Filters
        const selectValidItems = Calculations.getItemSelector(
            adjustedOptions,
            selectionOperator,
        );

        const results = workItems.filter(selectValidItems);

        return results;
    }

    static filterItems(
        workItems: ExtendedStateItem[],
        selectionOptions?: ItemSelectionOptions,
        selectionOperator?: string,
        restrictedFlags: string[] = [],
    ): ExtendedStateItem[] {
        // Filter out Redundant Data
        const redundantColumns = [
            'arrivalDate',
            'commitmentDate',
            'departureDate',
        ];
        const removeRedundantColumns = (
            workItem: ExtendedStateItem,
        ): ExtendedStateItem => omit(workItem, redundantColumns);

        const filteredWorkItems: ExtendedStateItem[] = chain(workItems)
            .uniqBy('workItemId')
            .map(removeRedundantColumns)
            .value();

        // Optionally Filter by Selection Options
        const { isToggled } = Calculations;

        if (
            selectionOperator !== undefined &&
            selectionOptions &&
            values(selectionOptions).some(isToggled)
        ) {
            // Handle remaining flags
            return Calculations.applySelectionOptions(
                filteredWorkItems,
                selectionOptions,
                selectionOperator,
                restrictedFlags,
            );
        }

        return filteredWorkItems;
    }

    static formatKanbanData(
        proposedItems: ExtendedStateItem[],
        inProgressItems: ExtendedStateItem[],
        completedItems: ExtendedStateItem[],
    ): KanbanBoardData {
        const [
            sortedProposedItems,
            sortedInProgressItems,
            sortedCompletedItems,
        ]: [ExtendedStateItem[], ExtendedStateItem[], ExtendedStateItem[]] = [
                orderBy(proposedItems, 'arrivalDateTime', 'desc'),
                orderBy(inProgressItems, 'commitmentDateTime', 'desc'),
                orderBy(completedItems, 'departureDateTime', 'desc'),
            ];

        const proposedItemsEntry: WorkItemGroup = {
            groupName: 'Upcoming Work',
            workItems: sortedProposedItems,
        };
        const inProgressItemsEntry: WorkItemGroup = {
            groupName: 'Work in Process',
            workItems: sortedInProgressItems,
        };
        const completedEntry: WorkItemGroup = {
            groupName: 'Completed Work',
            workItems: sortedCompletedItems,
        };

        const kanbanData: KanbanBoardData = {
            proposed: [proposedItemsEntry],
            inProgress: [inProgressItemsEntry],
            completed: [completedEntry],
        };

        return kanbanData;
    }

    async getWorkItemPerState(
        selectionOptions?: ItemSelectionOptions,
        selectionOperator?: string,
    ): Promise<KanbanBoardData> {
        const includeDiscardedItems = selectionOptions?.includeDiscardedBefore || selectionOptions?.includeDiscardedAfter || false;
        const workItems: ExtendedStateItem[] = await this.retrieveWorkItems(includeDiscardedItems);

        const delayedItemsSelection: string =
            this.filters?.delayedItemsSelection ?? 'inventory';
        const {
            proposedItems,
            inProgressItems,
            completedItems,
        } = Calculations.groupItemsByCategory(workItems, delayedItemsSelection);

        const restrictedFlags = ['includeStale'];

        // Only allow some flags to be ignored if the user selected it
        // so that not selecting it defaults to showing all
        if (!selectionOptions?.includeAboveSle) {
            restrictedFlags.push('includeAboveSle');
        }
        if (!selectionOptions?.includeDiscardedBefore) {
            restrictedFlags.push('includeDiscardedBefore');
        }
        if (!selectionOptions?.includeDiscardedAfter) {
            restrictedFlags.push('includeDiscardedAfter');
        }

        const filteredProposed = Calculations.filterItems(
            proposedItems,
            selectionOptions,
            selectionOperator,
            restrictedFlags,
        );
        const filteredInProgress = Calculations.filterItems(
            inProgressItems,
            selectionOptions,
            selectionOperator,
        );
        const filteredCompleted = Calculations.filterItems(
            completedItems,
            selectionOptions,
            selectionOperator,
            restrictedFlags,
        );

        const kanbanData: KanbanBoardData = Calculations.formatKanbanData(
            filteredProposed,
            filteredInProgress,
            filteredCompleted,
        );

        return kanbanData;
    }

    public async getWidgetInformation() {
        return this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.SMARTBOARD);
    }
}
