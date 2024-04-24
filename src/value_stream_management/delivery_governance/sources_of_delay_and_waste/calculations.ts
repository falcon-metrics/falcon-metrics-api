import { groupBy, uniqBy, flatten, cloneDeep } from 'lodash';
import { QueryTypes, Sequelize } from 'sequelize';
import { DateTime, Interval } from 'luxon';
import { generateDateArray } from '../../../common/aggregation';
import { mean } from 'mathjs';
import { Logger } from 'log4js';
import {
    IQueryFilters,
    PredefinedFilterTags,
} from '../../../common/filters_v2';
import { SecurityContext } from '../../../common/security';
import {
    IWorkItemType,
} from '../../../data_v2/work_item_type_aurora';
import {
    Calculations as ThroughputCalculations
} from '../../../throughput/calculations';
import {
    ExtendedStateItem,
    RetrievalScenario,
    StateItem,
} from '../../../workitem/interfaces';
import { ISnapshotQueries } from '../../../workitem/snapshot_queries';
import {
    IState,
    StateCategory,
} from '../../../workitem/state_aurora';
import {
    Calculations as LeadTimeCalculations,
} from '../../../leadtime/calculations';
import { Calculations as WipCalculations } from '../../../wip/calculations';
import {
    OrganizationSettings as OrganizationSettingsCalculations,
} from '../../../organization-settings/handleSettings';
import { isDateLastDayOfWeek } from '../../../utils/date_utils';
import { roundToDecimalPlaces } from '../../../utils/statistics';
import { PredefinedWidgetTypes } from '../common/enum';
import { WidgetInformation, WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { WorkItemGroupCount } from '../../delivery_management/profile_of_work/calculations';
import CustomFields, { tags, CustomFieldConfigModel } from '../../../models/CustomFieldConfigModel';
import ContextModel from '../../../models/ContextModel';
import getWorkItemListService, {
    ProjectStateItem,
} from '../../../workitem/WorkItemList';
import { getPerspectiveProfile, PerspectiveKey } from '../../../common/perspectives';

export type WidgetStateItems = {
    staleWork?: ExtendedStateItem[];
    blockers?: ExtendedStateItem[];
    discardedBeforeStart?: ExtendedStateItem[];
    discardedAfterStart?: ExtendedStateItem[];
    delayedItems?: ExtendedStateItem[];
};

export type WidgetProjectItems = {
    staleWork: ProjectStateItem[];
    blockers: ProjectStateItem[];
    discardedBeforeStart: ProjectStateItem[];
    discardedAfterStart: ProjectStateItem[];
    delayedItems: ProjectStateItem[];
};

export type SeparatedDiscardedItems = {
    after: StateItem[] | ExtendedStateItem[];
    before: StateItem[] | ExtendedStateItem[];
    activeTime: number;
};

export class Calculations {
    readonly orgId: string;
    readonly logger: Logger;
    readonly aurora: Promise<Sequelize>;
    readonly state: IState;
    readonly filters?: IQueryFilters;
    readonly workItemType: IWorkItemType;
    readonly throughputCalculations: ThroughputCalculations;
    readonly snapshotQueries: ISnapshotQueries;
    readonly leadtimeCalculations: LeadTimeCalculations;
    readonly wipCalculations: WipCalculations;
    readonly organisationsSettingsCalculations: OrganizationSettingsCalculations;

    readonly widgetInformationUtils: WidgetInformationUtils;

    private normalizedWorkItemCache: {
        [orgId: string]: {
            [tag: string]: {
                [stateCategory: string]: StateItem[] | Promise<StateItem[]>;
            };
        };
    } = {};

    private workItemListCache: {
        [orgId: string]: {
            [stateCategory: string]: Promise<StateItem[]> | StateItem[];
        };
    } = {};

    private completedWorkItemListCache: {
        [orgId: string]: Promise<StateItem[]> | StateItem[];
    } = {};

    private separatedDiscardedWorkItemListCache: Promise<SeparatedDiscardedItems> | SeparatedDiscardedItems | null = null;

    private customFieldsConfigsCache: Promise<CustomFieldConfigModel[]> | CustomFieldConfigModel[] | undefined = undefined;
    private contextCache: Promise<any> | any | null = null;
    private projectsCache: Promise<any> | any | null = null;
    constructor(opts: {
        security: SecurityContext;
        logger: Logger;
        aurora: Promise<Sequelize>;
        state: IState;
        filters: IQueryFilters;
        workItemType: IWorkItemType;
        throughputCalculations: ThroughputCalculations;
        snapshotQueries: ISnapshotQueries;
        leadtimeCalculations: LeadTimeCalculations;
        wipCalculations: WipCalculations;
        organisationsSettingsCalculations: OrganizationSettingsCalculations;
        widgetInformationUtils: WidgetInformationUtils;
    }) {
        this.orgId = opts.security.organisation!;
        this.logger = opts.logger;
        this.aurora = opts.aurora;
        this.state = opts.state;
        this.snapshotQueries = opts.snapshotQueries;
        this.filters = opts.filters;
        this.workItemType = opts.workItemType;
        this.throughputCalculations = opts.throughputCalculations;
        this.leadtimeCalculations = opts.leadtimeCalculations;
        this.wipCalculations = opts.wipCalculations;
        this.organisationsSettingsCalculations = opts.organisationsSettingsCalculations;

        this.widgetInformationUtils = opts.widgetInformationUtils;
    }

    async getTargetWip() {
        const targetWipScenario = [RetrievalScenario.CURRENT_WIP_ONLY];

        const [inProgressWorkItems, completedWorkItems] = await Promise.all([
            this.state.getExtendedWorkItemsWithScenarios(
                this.orgId,
                targetWipScenario,
                this.filters,
            ),
            this.getCachedWorkItemByStateCategory(StateCategory.COMPLETED),
        ]);

        // If there are no inprogress nor completed work items then there is no data available
        if (inProgressWorkItems.length === 0 && completedWorkItems.length === 0) {
            return {
                wipExcessValue: null,
                wipExcessTitle: '',
                currentWip: null,
                targetWip: null,
                pattern: 'neutral',
            };
        }

        const wipCount = inProgressWorkItems.length;

        const avgThroughput: number = await this.getAverageThroughput(
            completedWorkItems,
        );

        const wipExcessValue = wipCount - avgThroughput;

        // Calculate the pattern for traffic light
        let pattern = 'neutral';
        {
            const ratio = (Math.max(0, wipExcessValue) / avgThroughput);
            if (ratio < (avgThroughput / 4)) {
                pattern = 'good';
            } else if (ratio >= (avgThroughput / 4) && ratio <= (avgThroughput / 3)) {
                pattern = 'average';
            } else if (ratio > (avgThroughput / 3)) {
                pattern = 'bad';
            }
        }

        return {
            wipExcessValue: wipExcessValue <= 0 ? null : wipExcessValue,
            wipExcessTitle: wipExcessValue <= 0 ? 'WIP under control' : 'Value Stream with WIP excess of',
            currentWip: wipCount,
            targetWip: avgThroughput,
            pattern
        };
    }

    private checkIfItemStale(
        endDate: DateTime,
        changedDate: DateTime,
        staleItemDays: number,
    ) {
        const diffInDays: number = Math.round(
            endDate.diff(changedDate, 'days').days,
        );
        return diffInDays > staleItemDays;
    }

    async getStaleWork() {
        const staleWorkScenario = [RetrievalScenario.CURRENT_WIP_ONLY];
        const inProgressWorkItems = await this.state.getExtendedWorkItemsWithScenarios(
            this.orgId,
            staleWorkScenario,
            this.filters,
        );

        const settings = await this.organisationsSettingsCalculations.getSettings(
            this.orgId,
        );

        const staledItemPortfolioLevelNumberOfDays: number = settings?.staledItemPortfolioLevelNumberOfDays
            ? Number(settings?.staledItemPortfolioLevelNumberOfDays)
            : 30;

        const staledItemTeamLevelNumberOfDays: number = settings?.staledItemTeamLevelNumberOfDays
            ? Number(settings?.staledItemTeamLevelNumberOfDays)
            : 7;

        const staledItemIndividualContributorNumberOfDays: number = settings?.staledItemIndividualContributorNumberOfDays
            ? Number(settings?.staledItemIndividualContributorNumberOfDays)
            : 3;

        const totalInProgressCount = inProgressWorkItems.length || 0;

        const workItemsListByLevel = groupBy(
            inProgressWorkItems,
            'flomatikaWorkItemTypeLevel',
        );

        const workItemByLevel = {
            Team: workItemsListByLevel?.['Team'] || [],
            Portfolio: workItemsListByLevel?.['Portfolio'] || [],
            'Individual Contributor':
                workItemsListByLevel?.['Individual Contributor'] || [],
        };

        const endDate = this.filters?.filterByDate ? (await this.filters.datePeriod()).end : DateTime.now();
        endDate.setZone(this.filters?.clientTimezone ?? 'utc');
        let staleCount = 0;
        const staleItemDaysMap: { [key: string]: number; } = {
            Portfolio: staledItemPortfolioLevelNumberOfDays,
            Team: staledItemTeamLevelNumberOfDays,
            'Individual Contributor': staledItemIndividualContributorNumberOfDays
        };
        const staleItems: ExtendedStateItem[] = [];
        Object.keys(workItemByLevel).forEach(
            (key) => {
                workItemByLevel[
                    key as 'Team' | 'Portfolio' | 'Individual Contributor'
                ].forEach((w: ExtendedStateItem) => {
                    if (
                        this.checkIfItemStale(
                            endDate,
                            DateTime.fromISO(w.changedDate!),
                            staleItemDaysMap[key],
                        )
                    ) {
                        staleItems.push(w);
                        staleCount += 1;
                    }
                });
            });
        const stalePercent = !staleCount || !totalInProgressCount ? 0 : Math.round((staleCount / totalInProgressCount) * 100);
        // Calculate the pattern for traffic light
        let pattern = 'neutral';
        {
            if (stalePercent < 20) {
                pattern = 'good';
            } else if (stalePercent >= 20 && stalePercent <= 40) {
                pattern = 'average';
            } else if (stalePercent > 40) {
                pattern = 'bad';
            }
        }

        const projectItems = staleItems.length > 0 ? await this.getProjectItemsFromStateItems(staleItems, "present") : [];
        return {
            stalePercent,
            staleCount,
            pattern,
            items: projectItems
        };
    }

    async getCachedCompletedWorkItemList() {
        if (this.completedWorkItemListCache[this.orgId] instanceof Promise) {
            return await this.completedWorkItemListCache[this.orgId];
        } else if (
            this.completedWorkItemListCache[this.orgId] instanceof Array
        ) {
            return this.completedWorkItemListCache[this.orgId];
        }
        const filterCopy = cloneDeep(this.filters);
        if (filterCopy && filterCopy.queryParameters && filterCopy.queryParameters['departureDateUpperBoundary']) {
            filterCopy.queryParameters['departureDateLowerBoundary'] = DateTime.fromISO(filterCopy.queryParameters['departureDateUpperBoundary']).minus({ days: 90 }).startOf('day').toISO();
        }
        this.completedWorkItemListCache[this.orgId] = this.state.getWorkItems(
            this.orgId,
            StateCategory.COMPLETED,
            filterCopy,
            undefined,//fql
            undefined,//column names
            undefined,//isDelayed
            undefined,//disabledDelayed
            undefined,//disabledDiscarded
        );

        this.completedWorkItemListCache[this.orgId] = await this.completedWorkItemListCache[this.orgId];
        return this.completedWorkItemListCache[this.orgId];
    }

    async getCachedCustomFieldsConfigs() {
        if (this.customFieldsConfigsCache instanceof Promise) {
            return await this.customFieldsConfigsCache;
        } else if (
            this.customFieldsConfigsCache instanceof Array
        ) {
            return this.customFieldsConfigsCache;
        }
        const model = await CustomFields();
        this.customFieldsConfigsCache = model.findAll({
            where: { orgId: this.orgId, deletedAt: null } as any,
        });
        this.customFieldsConfigsCache = await this.customFieldsConfigsCache;
        return this.customFieldsConfigsCache;
    }

    async getCachedContext() {
        if (this.contextCache instanceof Promise) {
            return await this.contextCache;
        } else if (
            this.contextCache !== null
        ) {
            return this.contextCache;
        }
        const contextModel = await ContextModel();
        this.contextCache = contextModel.findOne({
            where: {
                contextId: this.filters?.getContextId() ?? ''
            } as any
        });
        this.contextCache = await this.contextCache;
        return this.contextCache;
    }

    async getCachedProjectsData() {
        if (this.projectsCache instanceof Promise) {
            return await this.projectsCache;
        } else if (
            this.projectsCache !== null
        ) {
            return this.projectsCache;
        }
        const workItemListService = await getWorkItemListService();
        this.projectsCache = workItemListService.getProjectsData(this.orgId);
        this.projectsCache = await this.projectsCache;
        return this.projectsCache;
    }

    async getSeparatedDiscardedWorkItems() {
        if (this.separatedDiscardedWorkItemListCache instanceof Promise) {
            return await this.separatedDiscardedWorkItemListCache;
        } else if (this.separatedDiscardedWorkItemListCache !== null) {
            return this.separatedDiscardedWorkItemListCache;
        }
        this.separatedDiscardedWorkItemListCache = this.getAndSeparateDiscardedItems();
        this.separatedDiscardedWorkItemListCache = await this.separatedDiscardedWorkItemListCache;
        return this.separatedDiscardedWorkItemListCache;
    }

    async getAndSeparateDiscardedItems() {
        const discardedItems = await this.state.getNormalisedExtendedWorkItemsWithScenarios(
            this.orgId,
            [RetrievalScenario.BECAME_COMPLETED_BETWEEN_DATES],
            this.filters,
            PredefinedFilterTags.DISCARDED,
            undefined,
            undefined,
            false
        );
        const res = await this.separateDiscardedBeforeAndAfter(discardedItems);
        return res;
    }

    getCustomFieldDistributionForItems(items: ExtendedStateItem[], customFieldName: string) {
        const result: WorkItemGroupCount[] = [];

        items.forEach(item => {
            const value = item.customFields?.find(f => f.name === customFieldName)?.value;
            const idx = result.findIndex(i => i.groupName === value);
            if (idx !== -1) {
                result[idx].count = result[idx].count + 1;
            } else {
                result.push({
                    groupName: value || 'No reason specified.',
                    count: 1
                });
            }
        });
        return result;
    };

    async getProjectItemsFromStateItems(items: ExtendedStateItem[], perspective: PerspectiveKey) {
        const { ageField } = getPerspectiveProfile(perspective);
        const workItemServicePromise = getWorkItemListService();
        const completedItemsPromise = this.getCachedCompletedWorkItemList();
        const customFieldsConfigPromise = this.getCachedCustomFieldsConfigs();
        const contextPromise = this.getCachedContext();
        const projectDataPromise = this.getCachedProjectsData();
        const [
            workItemListService,
            completedItems,
            customFieldConfigs,
            context,
            projectsData
        ] = await Promise.all(
            [
                workItemServicePromise,
                completedItemsPromise,
                customFieldsConfigPromise,
                contextPromise,
                projectDataPromise
            ]);
        let desiredDeliveryDateCustomField: string[] | undefined = undefined;
        let classOfServiceCustomField: string | undefined = undefined;
        if (customFieldConfigs.length > 0 && context) {
            desiredDeliveryDateCustomField = customFieldConfigs.filter(i => i.datasourceId === context.datasourceId && i.tags?.includes(tags.desiredDeliveryDate)).map(i => i.datasourceFieldName);
            classOfServiceCustomField = customFieldConfigs.find(i => i.datasourceId === context.datasourceId && i.tags?.includes(tags.classOfService))?.datasourceFieldName;
        }

        const uniqueItems: ExtendedStateItem[] = uniqBy(
            items,
            'workItemId',
        );

        // const projectsData = await workItemListService.getProjectsData(this.orgId);

        const projectWorkItems: ProjectStateItem[] = workItemListService.getProjectsItemList(
            projectsData,
            uniqueItems,
            ageField,
            completedItems,
            perspective,
            desiredDeliveryDateCustomField,
            classOfServiceCustomField
        );
        if (perspective === 'present') {
            projectWorkItems.forEach((workItem) => {
                workItem.isAboveSle = workItem.isAboveSleByWipAge;
            });
        }
        return projectWorkItems;
    };

    async getBlockers() {
        const blockersScenarios = [RetrievalScenario.CURRENT_WIP_ONLY];
        const inProcessItemsPromise = this.state.getNormalisedExtendedWorkItemsWithScenarios(
            this.orgId,
            blockersScenarios,
            this.filters,
            PredefinedFilterTags.BLOCKERS);
        const customFieldConfigsPromise = this.getCachedCustomFieldsConfigs();
        const contextPromise = this.getCachedContext();
        const [
            inProcessItems,
            customFieldConfigs,
            context
        ] = await Promise.all([
            inProcessItemsPromise,
            customFieldConfigsPromise,
            contextPromise
        ]);
        const blockers = inProcessItems.length;
        // Calculate the pattern for traffic light
        let pattern = 'neutral';
        {
            if (blockers < 20) {
                pattern = 'good';
            } else if (blockers >= 20 && blockers <= 40) {
                pattern = 'average';
            } else if (blockers > 40) {
                pattern = 'bad';
            }
        }
        let distribution = null;
        if (customFieldConfigs.length > 0 && context) {
            const blockedReasonFieldName = customFieldConfigs.find(i => i.datasourceId === context.datasourceId && i.tags?.includes(tags.blockedReason))?.datasourceFieldName;
            if (blockedReasonFieldName) {
                distribution = this.getCustomFieldDistributionForItems(inProcessItems, blockedReasonFieldName);
            }
        }

        const projectItems = inProcessItems.length > 0 ? await this.getProjectItemsFromStateItems(inProcessItems, "present") : [];
        return {
            count: blockers,
            pattern,
            distribution,
            items: projectItems
        };
    }

    async separateDiscardedBeforeAndAfter(discardedWorkItems: ExtendedStateItem[] | ExtendedStateItem[]): Promise<SeparatedDiscardedItems> {
        const afterStart: StateItem[] | ExtendedStateItem[] = [];
        const beforeStart: StateItem[] | ExtendedStateItem[] = [];
        let activeTime = 0;

        const aurora = await this.aurora;
        const dateRange = await this.filters!.datePeriod();
        const beginDate = dateRange?.start;
        const endDate = dateRange?.end;
        const areValidDates = beginDate && beginDate.isValid && endDate && endDate.isValid;

        if (!beginDate || !endDate || dateRange === undefined || !dateRange.isValid || !areValidDates) {
            return {
                after: [],
                before: [],
                activeTime: 0
            };
        }

        const rows = discardedWorkItems.length <= 0
            ? []
            : await aurora.query(`
                WITH events AS (
                    SELECT
                        ROW_NUMBER() OVER (ORDER BY snapshots."workItemId", snapshots."flomatikaSnapshotDate") AS "row_number",
                        snapshots."workItemId",
                        snapshots."flomatikaSnapshotDate" at time zone :timeZone AS "formattedDate",
                        snapshots."stateType",
                        snapshots."state",
                        snapshots."stepCategory",
                        snapshots."flomatikaWorkItemTypeLevel"
                    FROM
                        snapshots
                    WHERE
                        snapshots."partitionKey" = 'snapshot#' || :orgId
                        AND snapshots."workItemId" in (:workItemId)
                        and snapshots."isFiller" = false
                        and snapshots."type" = 'state_change'
                ),
                events_with_duration as (
                    SELECT
                        current_events."workItemId",
                        current_events ."formattedDate" AS "previousDate",
                        COALESCE(next_events."formattedDate", :endDate) as "nextDate",
                        current_events."stateType" AS "previousStateType",
                        current_events."state" AS "previousState",
                        current_events."stepCategory" AS "previousStepCategory",
                        current_events."flomatikaWorkItemTypeLevel" as "flomatikaWorkItemTypeLevel",
                        EXTRACT(EPOCH FROM (COALESCE(next_events."formattedDate", :endDate) - current_events."formattedDate")) AS "difference"
                    FROM events AS current_events
                    LEFT JOIN events AS next_events ON
                        current_events.row_number + 1 = next_events.row_number
                        AND next_events."workItemId" = current_events."workItemId"
                )
                SELECT
                "workItemId",
                MAX(
                    CASE 
                        WHEN ("previousStepCategory" = 'inprogress' and "difference" > 0)
                        THEN 1 
                        ELSE 0 
                    end
                ) AS is_after,
                sum(
                    case
                        when ("previousStateType" = 'active' and "flomatikaWorkItemTypeLevel" = 'Team')
                        then "difference"
                        else 0
                    end
                ) as active_time
                FROM
                    events_with_duration
                GROUP BY
                    "workItemId"`,
                {
                    replacements: {
                        workItemId: discardedWorkItems.map(workItem => workItem.workItemId),
                        orgId: this.orgId,
                        timeZone: this.filters?.clientTimezone,
                        endDate: endDate.toISO().toString(),
                    },
                    type: QueryTypes.SELECT,
                });
        rows.map((row: any) => {
            const item = discardedWorkItems.find(x => x.workItemId === row.workItemId);
            if (item) {
                if (row.is_after) {
                    item.activeTime = row.active_time;
                    afterStart.push(item);
                    activeTime = activeTime + row.active_time;
                } else
                    beforeStart.push(item);
            }
        });
        return {
            after: afterStart,
            before: beforeStart,
            activeTime
        };
    }

    async getDiscardedBeforeStart() {
        const separatedDiscardedItemsPromise = this.getSeparatedDiscardedWorkItems();
        const customFieldConfigsPromise = this.getCachedCustomFieldsConfigs();
        const contextPromise = this.getCachedContext();
        const [
            separatedDiscardedItems,
            customFieldConfigs,
            context
        ] = await Promise.all([
            separatedDiscardedItemsPromise,
            customFieldConfigsPromise,
            contextPromise
        ]);
        const { before } = separatedDiscardedItems;

        let distribution = null;
        if (customFieldConfigs.length > 0 && context) {
            const discardedReasonFieldName = customFieldConfigs.find(i => i.datasourceId === context.datasourceId && i.tags?.includes(tags.discardedReason))?.datasourceFieldName;
            if (discardedReasonFieldName) {
                distribution = this.getCustomFieldDistributionForItems(before, discardedReasonFieldName);
            }
        }
        const projectItems = before.length > 0 ? await this.getProjectItemsFromStateItems(before, "past") : [];

        return {
            discardedCount: before.length,
            distribution,
            items: projectItems
        };
    }

    async getDiscardedAfterStart() {
        const separatedDiscardedItemsPromise = this.getSeparatedDiscardedWorkItems();
        const customFieldConfigsPromise = this.getCachedCustomFieldsConfigs();
        const contextPromise = this.getCachedContext();
        const [
            separatedDiscardedItems,
            customFieldConfigs,
            context
        ] = await Promise.all([
            separatedDiscardedItemsPromise,
            customFieldConfigsPromise,
            contextPromise
        ]);

        const { after, activeTime } = separatedDiscardedItems;

        let distribution = null;
        if (customFieldConfigs.length > 0 && context) {
            const discardedReasonFieldName = customFieldConfigs.find(i => i.datasourceId === context.datasourceId && i.tags?.includes(tags.discardedReason))?.datasourceFieldName;
            if (discardedReasonFieldName) {
                distribution = this.getCustomFieldDistributionForItems(after, discardedReasonFieldName);
            }
        }
        const projectItems = after.length > 0 ? await this.getProjectItemsFromStateItems(after, "past") : [];
        return {
            discardedCount: after.length,
            activeDaysSpent: Math.ceil(activeTime / 86400),
            distribution,
            items: projectItems
        };
    }

    async getFlowDebt() {
        const [
            leadtimePercentile,
            wipAgePercentile
        ] = await Promise.all([
            this.leadtimeCalculations.getPercentileByWorkItemTypeLevel(85, 'Team'),
            this.wipCalculations.getPercentileByWorkItemTypeLevel(85, 'Team'),
        ]);
        //Current WIP [LEAD TIME =  BECOME COMPLETED] / [WIP AGE = CURRENT WIP]

        const flowDebt = roundToDecimalPlaces(
            (!leadtimePercentile ? 0
                : wipAgePercentile / leadtimePercentile)
            , 1);

        // Calculate the pattern for traffic light
        let pattern = 'neutral';
        {
            /* Traffic lights business rules
                 Red: 20X+ Flow Debt --- bad
                 Amber:  Between 1X and 20X Flow Debt --- average
                 Green: < 1X Flow Debt --- good */

            if (flowDebt < 1) pattern = 'good';
            if (flowDebt >= 1 && flowDebt <= 20) pattern = 'average';
            if (flowDebt > 20) pattern = 'bad';
        }

        const leadtimePercentile85th = Math.round(leadtimePercentile);
        const wipAgePercentile85th = Math.round(wipAgePercentile);

        return {
            value: flowDebt,
            leadtimePercentile85th,
            wipAgePercentile85th,
            pattern
        };
    }

    async getDelayedItems() {
        const shouldFetchDelayed = true;

        const currentWipItems = await this.state.getExtendedWorkItemsWithScenarios(
            this.orgId,
            [RetrievalScenario.CURRENT_WIP_ONLY],
            this.filters,
            undefined,
            undefined,
            shouldFetchDelayed
        );

        const delayedItems = currentWipItems
            .filter(d => d.stateCategory?.toLowerCase() !== 'completed' && d.isDelayed === true);

        const projectItems = delayedItems.length > 0 ? await this.getProjectItemsFromStateItems(delayedItems, "present") : [];
        return {
            count: delayedItems.length,
            items: projectItems,
        };
    }

    async getTopWaitSteps() {
        const [
            proposedWorkItems,
            inProgressWorkItems,
            completedWorkItems,
        ] = await Promise.all([
            this.getCachedWorkItemByStateCategory(StateCategory.PROPOSED),
            this.getCachedWorkItemByStateCategory(StateCategory.INPROGRESS),
            this.getCachedWorkItemByStateCategory(StateCategory.COMPLETED),
        ]);

        const uniqueWorkItemList = uniqBy([
            ...(proposedWorkItems || []),
            ...(inProgressWorkItems || []),
            ...(completedWorkItems || []),
        ], 'workItemId');

        const aurora = await this.aurora;

        const dateRange = await this.filters?.datePeriod();

        const beginDate = dateRange?.start;
        const endDate = dateRange?.end;
        const areValidDates = beginDate && beginDate.isValid && endDate && endDate.isValid;

        if (!beginDate || !endDate || dateRange === undefined || !dateRange.isValid || !areValidDates) {
            return [];
        }

        const rows: Record<any, any>[] = uniqueWorkItemList.map(workItem => workItem.workItemId).length <= 0 ? [] : await aurora.query(`
        WITH events AS (
            SELECT
                ROW_NUMBER() OVER (ORDER BY snapshots."workItemId", snapshots."flomatikaSnapshotDate") AS "row_number",
                snapshots."workItemId",
                snapshots."flomatikaSnapshotDate" at time zone :timeZone AS "formattedDate",
                snapshots."stateType",
                snapshots."state",
                snapshots."stepCategory"
            FROM
                snapshots
            WHERE
                snapshots."partitionKey" = 'snapshot#' || :orgId
                AND snapshots."type" = 'state_change'
                AND snapshots."workItemId" in (:workItemId)
                and snapshots."isFiller" = false
        )
        SELECT
            current_events."workItemId",
            current_events ."formattedDate" AS "previousDate",
--                                next_events."flomatikaSnapshotDate" AS "nextDate",
                            COALESCE(next_events."formattedDate", :endDate) as "nextDate",
            current_events."stateType" AS "previousStateType",
            current_events."state" AS "previousState",
            current_events."stepCategory" AS "previousStepCategory",
            --next_events."stateType" AS "nextStateType",
            --next_events."state" AS "nextState",
             CASE
                WHEN (
                    COALESCE(next_events."formattedDate", :endDate) < :startDate OR current_events ."formattedDate" > :endDate
                ) THEN
                    0::FLOAT
                WHEN (
                    current_events."formattedDate" < :startDate AND
                   COALESCE(next_events."formattedDate", :endDate) > :startDate
                ) THEN
                    EXTRACT(EPOCH FROM (COALESCE(next_events."formattedDate", :endDate) - :startDate))
                WHEN (
                    current_events."formattedDate" < :endDate AND
                    COALESCE(next_events."formattedDate", :endDate) > :endDate
                ) THEN
                    EXTRACT(EPOCH FROM (:endDate - current_events."formattedDate"))
                ELSE
                    EXTRACT(EPOCH FROM (COALESCE(next_events."formattedDate", :endDate) - current_events."formattedDate"))
                END
            AS "difference"
        FROM events AS current_events
        LEFT JOIN events AS next_events ON
            current_events.row_number + 1 = next_events.row_number
            AND next_events."workItemId" = current_events."workItemId"
        WHERE
            COALESCE(next_events."formattedDate", :endDate) >= :startDate
            AND current_events."formattedDate" < :endDate
        `, {
            replacements: {
                workItemId: uniqueWorkItemList.map(workItem => workItem.workItemId),
                orgId: this.orgId,
                timeZone: this.filters?.clientTimezone,
                startDate: beginDate.toISO().toString(),
                endDate: endDate.toISO().toString(),
            },
            type: QueryTypes.SELECT,
        });

        const stateElapsedRecord: { [state: string]: number; } = {};
        const workItemInvolved: { [state: string]: Set<string>; } = {};

        for (const row of rows) {
            if (row.difference === null || !row.previousState || !row.nextDate || !row.previousDate) {
                continue;
            }
            if (row.previousStateType !== 'queue') {
                continue;
            }
            if (row.previousStepCategory !== 'inprogress') {
                continue;
            }
            if (row.nextDate.getTime() < beginDate.toMillis()) {
                continue;
            }
            if (row.previousDate.getTime() > endDate.toMillis()) {
                continue;
            }
            if (!workItemInvolved[row.previousState]) {
                workItemInvolved[row.previousState] = new Set<string>();
            }
            if (!workItemInvolved[row.previousState].has(row.workItemId)) {
                workItemInvolved[row.previousState].add(row.workItemId);
            }
            if (!stateElapsedRecord[row.previousState]) {
                stateElapsedRecord[row.previousState] = 0;
            }
            stateElapsedRecord[row.previousState] += row.difference;
        }

        let elapsedInState = 0;
        for (const state in stateElapsedRecord) {
            if (typeof stateElapsedRecord[state] !== 'number' || isNaN(stateElapsedRecord[state])) {
                throw new Error(`Unexpected invalid numeric value on state "${state}"`);
            }
            elapsedInState += stateElapsedRecord[state];
        }

        const keySourcesOfDelay = [];
        for (let state in stateElapsedRecord) {
            if (!workItemInvolved[state]) {
                throw new Error(`Unexpected missing work item involved record on state "${state}"`);
            }
            if (typeof workItemInvolved[state].size !== 'number' || isNaN(workItemInvolved[state].size) || workItemInvolved[state].size === 0) {
                throw new Error(`Work item involved on state "${state}" has invalid size`);
            }
            const averageOfDays = stateElapsedRecord[state] / workItemInvolved[state].size;
            const percentage = stateElapsedRecord[state] / elapsedInState;
            keySourcesOfDelay.push({
                state,
                countOfDelays: stateElapsedRecord[state] / 86400,
                count: workItemInvolved[state].size,
                averageOfDays: averageOfDays / 86400,
                percentage: percentage * 100,
            });
        }

        return {
            keySourcesOfDelay
        };
    }

    async getNormWorkItemsByAllStateCategories(
        tag?: PredefinedFilterTags,
        disabledDiscarded?: boolean,
    ): Promise<StateItem[]> {
        const getCompleted: Promise<StateItem[]> = this.getNormalisedItemsByStateCategory(
            StateCategory.COMPLETED,
            tag,
            disabledDiscarded,
        );
        const getInProcess: Promise<StateItem[]> = this.getNormalisedItemsByStateCategory(
            StateCategory.INPROGRESS,
            tag,
            disabledDiscarded,
        );
        const getProposed: Promise<StateItem[]> = this.getNormalisedItemsByStateCategory(
            StateCategory.PROPOSED,
            tag,
            disabledDiscarded
        );
        const result = await Promise.all([
            getCompleted,
            getInProcess,
            getProposed,
        ]);
        return uniqBy(flatten(result), 'workItemId');
    }

    private async getNormalisedItemsByStateCategory(
        stateCategory: StateCategory,
        tag = PredefinedFilterTags.DEMAND,
        disableDiscarded?: boolean,
    ): Promise<StateItem[]> {
        if (!this.normalizedWorkItemCache[this.orgId]) {
            this.normalizedWorkItemCache[this.orgId] = {};
        }
        if (!this.normalizedWorkItemCache[this.orgId][tag]) {
            this.normalizedWorkItemCache[this.orgId][tag] = {};
        }
        if (this.normalizedWorkItemCache[this.orgId][tag][stateCategory] instanceof Promise) {
            return await this.normalizedWorkItemCache[this.orgId][tag][stateCategory];
        }
        if (this.normalizedWorkItemCache[this.orgId][tag][stateCategory]) {
            return this.normalizedWorkItemCache[this.orgId][tag][stateCategory];
        }
        this.normalizedWorkItemCache[this.orgId][tag][stateCategory] = this.state.getNormalisedWorkItems(
            this.orgId!,
            stateCategory,
            this.filters,
            tag,
            undefined,
            undefined,
            disableDiscarded,
        );
        this.normalizedWorkItemCache[this.orgId][tag][stateCategory] = await this.normalizedWorkItemCache[this.orgId][tag][stateCategory];
        return this.normalizedWorkItemCache[this.orgId][tag][stateCategory];
    }

    async getCachedWorkItemByStateCategory(stateCategory: StateCategory) {
        if (!this.workItemListCache[this.orgId]) {
            this.workItemListCache[this.orgId] = {};
        }
        if (this.workItemListCache[this.orgId][stateCategory] instanceof Promise) {
            return await this.workItemListCache[this.orgId][stateCategory];
        } else if (this.workItemListCache[this.orgId][stateCategory] instanceof Array) {
            return this.workItemListCache[this.orgId][stateCategory];
        }
        const disabledDelayed = true;
        this.workItemListCache[this.orgId][stateCategory] = this.state.getWorkItems(
            this.orgId!,
            stateCategory,
            this.filters,
            undefined,
            undefined,
            undefined,
            disabledDelayed,
        );
        this.workItemListCache[this.orgId][stateCategory] = await this.workItemListCache[this.orgId][stateCategory];
        return this.workItemListCache[this.orgId][stateCategory];
    }

    private async getAverageThroughput(
        completedWorkItems: StateItem[],
    ): Promise<number> {
        const dateRange:
            | Interval
            | undefined = await this.filters?.datePeriod();

        const areValidDates = dateRange?.start?.isValid && dateRange?.end?.isValid;

        if (dateRange === undefined || !dateRange.isValid || !areValidDates) {
            return 0;
        }

        const startDate = dateRange.start;
        let endDate = dateRange.end;

        // Remove week if the end date does not fall on the last day of a week because it would be incomplete
        if (!isDateLastDayOfWeek(endDate)) {
            endDate = dateRange.end
                .minus({
                    weeks: 1,
                })
                .endOf('week');
        }

        const interval = Interval.fromDateTimes(startDate, endDate);

        const groupedWorkItemByAggregation = generateDateArray(interval, 'week').map(
            startDate => {
                const endDate = startDate.endOf('week');
                return {
                    startDate,
                    endDate,
                    workItemList: completedWorkItems.filter(
                        workItem => (
                            startDate.valueOf() < workItem.departureDateTime!.valueOf() &&
                            workItem.departureDateTime!.valueOf() <= endDate.valueOf()
                        )
                    )
                };
            }
        );

        if (!groupedWorkItemByAggregation.length) {
            return 0;
        }

        // Remove last week if it is incomplete (necessary because sometimes the generateDateArray returns one extra week)
        if (groupedWorkItemByAggregation[groupedWorkItemByAggregation.length - 1].endDate.valueOf() > endDate.valueOf()) {
            groupedWorkItemByAggregation.pop();
        }

        const throuputWeeklyValues = groupedWorkItemByAggregation.map(
            group => group.workItemList.length
        );

        if (!throuputWeeklyValues.length) {
            return 0;
        }

        return Math.round(mean(throuputWeeklyValues));
    }


    async getWidgetInformation(): Promise<{
        wipExcess?: WidgetInformation[];
        staleWork?: WidgetInformation[];
        blockers?: WidgetInformation[];
        discardedBeforeStart?: WidgetInformation[];
        discardedAfterStart?: WidgetInformation[];
        flowDebt?: WidgetInformation[];
        delayedItems?: WidgetInformation[];
        keySourcesOfDelay?: WidgetInformation[];
    }> {
        const wipExcess = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.WIPEXCESS);
        const staleWork = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.STALEWORK);
        const blockers = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.IMPEDIMENTS);
        const discardedBeforeStart = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.RETURNED_TO_BACKLOG);
        const discardedAfterStart = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.ABORTED_ITEMS);
        const flowDebt = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.PRODUCTIVITY_DEBT);
        const delayedItems = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.DELAYEDITEMS);
        const keySourcesOfDelay = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.TOP_WAIT_STEPS);

        return {
            wipExcess,
            staleWork,
            blockers,
            discardedBeforeStart,
            discardedAfterStart,
            flowDebt,
            delayedItems,
            keySourcesOfDelay
        };
    }
}