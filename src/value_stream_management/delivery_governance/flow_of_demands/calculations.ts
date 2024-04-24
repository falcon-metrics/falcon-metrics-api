import { uniqBy } from 'lodash';
import { mean } from 'mathjs';
import { DateAnalysisOptions, IQueryFilters } from '../../../common/filters_v2';
import { SecurityContext } from '../../../common/security';
import { IWorkItemType } from '../../../data_v2/work_item_type_aurora';
import { ExtendedStateItem, RetrievalScenario, StateItem } from '../../../workitem/interfaces';
import { ISnapshotQueries } from '../../../workitem/snapshot_queries';
import { IState, StateCategory } from '../../../workitem/state_aurora';
import { Calculations as ThroughputCalculations } from '../../../throughput/calculations';
import { Calculations as InventoryCalculations } from '../../../inventory/calculations';
import { Calculations as FlowOfDemandsCalculations } from '../../../value_stream_management/continuous_improvements/flow_of_demands/calculations';
import { getPercentile } from '../../../utils/statistics';
import { Calculations as WipCalculations } from '../../../wip/calculations';
import { DateTime } from 'luxon';
import { WidgetInformation, WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import getWorkItemListService, {
    ProjectStateItem,
    WorkItemListService,
} from '../../../workitem/WorkItemList';
import { PerspectiveKey, getPerspectiveProfile } from '../../../common/perspectives';
import CustomFields, { tags, CustomFieldConfigModel } from '../../../models/CustomFieldConfigModel';
import ContextModel from '../../../models/ContextModel';
import _ from 'lodash';
import { PredefinedWidgetTypes } from '../common/enum';

export type WidgetProjectItems = {
    inventoryItems: ProjectStateItem[];
    wipItems: ProjectStateItem[];
    completedItems: ProjectStateItem[];
};

export type WidgetStateItems = {
    inventoryItems?: ExtendedStateItem[];
    wipItems?: ExtendedStateItem[];
    completedItems?: ExtendedStateItem[];
};
export class Calculations {
    readonly orgId: string;
    readonly filters: IQueryFilters;
    readonly state: IState;
    readonly snapshotQueries: ISnapshotQueries;
    readonly throughputCalculations: ThroughputCalculations;
    readonly inventoryCalculations: InventoryCalculations;
    readonly flowOfDemandsCalculations: FlowOfDemandsCalculations;
    readonly wipCalculations: WipCalculations;

    readonly widgetInformationUtils: WidgetInformationUtils;

    private workItemListCache: {
        [orgId: string]: {
            [stateCategory: string]: Promise<ExtendedStateItem[]> | ExtendedStateItem[];
        };
    } = {};

    private completedWorkItemListCache: {
        [orgId: string]: Promise<StateItem[]> | StateItem[];
    } = {};

    private customFieldsConfigsCache: Promise<CustomFieldConfigModel[]> | CustomFieldConfigModel[] | undefined = undefined;
    private contextCache: Promise<any> | any | null = null;

    constructor(opts: {
        security: SecurityContext;
        filters: IQueryFilters;
        workItemType: IWorkItemType;
        state: IState;
        snapshotQueries: ISnapshotQueries;
        throughputCalculations: ThroughputCalculations;
        inventoryCalculations: InventoryCalculations;
        flowOfDemandsCalculations: FlowOfDemandsCalculations;
        wipCalculations: WipCalculations;
        widgetInformationUtils: WidgetInformationUtils;
    }) {
        this.orgId = opts.security.organisation!;
        this.filters = opts.filters;
        this.state = opts.state;
        this.snapshotQueries = opts.snapshotQueries;
        this.throughputCalculations = opts.throughputCalculations;
        this.inventoryCalculations = opts.inventoryCalculations;
        this.flowOfDemandsCalculations = opts.flowOfDemandsCalculations;
        this.wipCalculations = opts.wipCalculations;

        this.widgetInformationUtils = opts.widgetInformationUtils;
    }

    async getCachedWorkItemByStateCategory(stateCategory: StateCategory) {
        if (!this.workItemListCache[this.orgId]) {
            this.workItemListCache[this.orgId] = {};
        }
        if (
            this.workItemListCache[this.orgId][stateCategory] instanceof Promise
        ) {
            return await this.workItemListCache[this.orgId][stateCategory];
        } else if (
            this.workItemListCache[this.orgId][stateCategory] instanceof Array
        ) {
            return this.workItemListCache[this.orgId][stateCategory];
        }

        if (stateCategory === StateCategory.COMPLETED) {
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        } else {
            this.filters.dateAnalysisOption = DateAnalysisOptions.all;
        }
        this.workItemListCache[this.orgId][
            stateCategory
        ] = await this.state.getExtendedWorkItems(
            this.orgId,
            [stateCategory],
            this.filters,
            undefined, //fql
            undefined, //column names
            undefined, //isDelayed,
            true
        );
        this.workItemListCache[this.orgId][stateCategory] = await this
            .workItemListCache[this.orgId][stateCategory];

        return this.workItemListCache[this.orgId][stateCategory];
    }

    getUniqueWorkItems(
        proposedWorkItems: StateItem[] = [],
        inProgressWorkItems: StateItem[] = [],
        completedWorkItems: StateItem[] = [],
    ): StateItem[] {
        return uniqBy(
            [
                ...proposedWorkItems,
                ...inProgressWorkItems,
                ...completedWorkItems,
            ],
            'workItemId',
        );
    }

    async getDemandVsCapacity() {
        const [demand, capacity] = await Promise.all([
            this.flowOfDemandsCalculations.getTotalsForDemand(),
            this.flowOfDemandsCalculations.getTotalsForCapacity(),
        ]);

        const demandOverCapacityPercent = this.flowOfDemandsCalculations.getDemandOverCapacityPercent(
            demand,
            capacity,
        );
        const inventoryGrowth = this.flowOfDemandsCalculations.getInventoryGrowth(
            demand,
            capacity,
        );

        // Calculate the pattern for traffic light
        let pattern = 'neutral';
        {
            const accumulativeInventory =
                capacity === 0 ? 0 : demand / capacity;

            if (accumulativeInventory < 1) {
                pattern = 'good';
            } else if (accumulativeInventory < 4) {
                pattern = 'average';
            } else if (accumulativeInventory >= 4) {
                pattern = 'bad';
            }
        }

        return {
            demand,
            capacity,
            demandOverCapacityPercent,
            inventoryGrowth,
            pattern
        };
    }

    async getInflowVsOutflow() {
        const [inflow, outflow] = await Promise.all([
            this.flowOfDemandsCalculations.getTotalsForInflow(),
            this.flowOfDemandsCalculations.getTotalsForOutflow(),
        ]);

        const inflowOverOutflowPercent = this.flowOfDemandsCalculations.getInflowOverOutflowPercent(
            inflow,
            outflow,
        );
        const wipGrowth = this.flowOfDemandsCalculations.getWipGrowth(
            inflow,
            outflow,
        );

        // Calculate the pattern for traffic light
        let pattern = 'neutral';
        {
            const accumulativeInventory = outflow === 0 ? 0 : inflow / outflow;

            if (accumulativeInventory < 1) {
                pattern = 'good';
            } else if (accumulativeInventory < 4) {
                pattern = 'average';
            } else if (accumulativeInventory >= 4) {
                pattern = 'bad';
            }
        }

        return {
            inflow,
            outflow,
            inflowOverOutflowPercent,
            wipGrowth,
            pattern,
        };
    }

    async getInventorySize() {
        const [inventoryData, completedWorkItems] = await Promise.all([
            this.state.getExtendedWorkItemsWithScenarios(
                this.orgId,
                [RetrievalScenario.CURRENT_INVENTORY_ONLY],
                this.filters,
                undefined,
            ),
            this.getCachedWorkItemByStateCategory(StateCategory.COMPLETED),
        ]);

        // If there are no completed work items and there are no inventory data then there is no data available
        if (completedWorkItems.length === 0 && inventoryData.length === 0) {
            return {
                inventoryCount: null,
                pattern: 'average',
                weeksWorthCount: null,
            };
        }

        const inventoryCount = inventoryData.length;

        // Calculate no. of weeks worth of work = inventory size / avg. throughput per week
        const avgThroughput: number = await this.throughputCalculations.getAverageThroughput(
            completedWorkItems,
        );

        const weeksWorthCount = Math.round(inventoryCount / avgThroughput);

        return {
            inventoryCount,
            weeksWorthCount,
            items: inventoryData
        };
    }

    async getCommitmentRate() {
        const [
            proposedWorkItems,
            inProgressWorkItems,
            completedWorkItems,
        ] = await Promise.all([
            this.getCachedWorkItemByStateCategory(StateCategory.PROPOSED),
            this.getCachedWorkItemByStateCategory(StateCategory.INPROGRESS),
            this.getCachedWorkItemByStateCategory(StateCategory.COMPLETED),
        ]);
        const uniqueWorkItems = this.getUniqueWorkItems(
            proposedWorkItems,
            inProgressWorkItems,
            completedWorkItems,
        );

        let commitedItemCount = 0;
        for (const item of uniqueWorkItems) {
            if (item.commitmentDate) {
                commitedItemCount += 1;
            }
        }

        const commitmentRatePercent = Math.round(
            (100 * commitedItemCount) / uniqueWorkItems.length,
        );

        // Calculate the pattern for traffic light
        let pattern = 'neutral';
        if (commitmentRatePercent <= 64) {
            pattern = 'bad';
        } else if (commitmentRatePercent > 64 && commitmentRatePercent <= 84) {
            pattern = 'average';
        } else if (commitmentRatePercent > 84) {
            pattern = 'good';
        }

        return {
            commitmentRatePercent,
            pattern
        };
    }

    async getLeadTimes(completedWorkItems: StateItem[]): Promise<number[]> {
        return completedWorkItems
            .filter(
                (item) =>
                    item.leadTimeInWholeDays !== undefined &&
                    item.leadTimeInWholeDays !== null,
            )
            .map((item) => item.leadTimeInWholeDays as number);
    }

    async getTimeToCommit() {
        const [inProgressWorkItems, completedWorkItems] = await Promise.all([
            this.getCachedWorkItemByStateCategory(StateCategory.INPROGRESS),
            this.getCachedWorkItemByStateCategory(StateCategory.COMPLETED),
        ]);

        const uniqueWorkItems = this.getUniqueWorkItems(
            [],
            inProgressWorkItems,
            completedWorkItems,
        );

        const timeToCommitList = [];

        for (const workItem of uniqueWorkItems) {
            if (!workItem.arrivalDateTime) {
                continue;
            } else if (!workItem.commitmentDateTime) {
                continue;
            }
            const commitmentDateString = workItem.commitmentDateTime.toFormat(
                'yyyy/MM/dd',
                { timeZone: this.filters.clientTimezone },
            );

            const commitmentDate = DateTime.fromFormat(
                commitmentDateString,
                'yyyy/MM/dd',
                { zone: this.filters.clientTimezone },
            );

            const arrivalDateString = workItem.arrivalDateTime.toFormat(
                'yyyy/MM/dd',
                { timeZone: this.filters.clientTimezone },
            );

            const arrivalDate = DateTime.fromFormat(
                arrivalDateString,
                'yyyy/MM/dd',
                { zone: this.filters.clientTimezone },
            );

            const durationBetweenArrivalAndCommitment = commitmentDate.diff(
                arrivalDate,
            );
            const differenceInDays =
                durationBetweenArrivalAndCommitment.as('days') + 1;

            timeToCommitList.push(differenceInDays);
        }

        const timeToCommit = Math.round(getPercentile(85, timeToCommitList));

        // Calculate the pattern for traffic light
        let pattern = 'neutral';
        {
            const leadTimeList = await this.getLeadTimes(completedWorkItems);

            const averageOfLeadTime: number =
                leadTimeList.length === 0 ? 0 : mean(...leadTimeList);

            /* Traffic lights business rules
             Red: 5X+ Average Lead Time --- bad
             Amber:  Between 3X and 5X Average Lead Time --- average
             Green: ≤ 3X Average Lead Time --- good */

            if (timeToCommit <= 3 * averageOfLeadTime) pattern = 'good';
            if (
                timeToCommit > 3 * averageOfLeadTime &&
                timeToCommit <= 5 * averageOfLeadTime
            )
                pattern = 'average';
            if (timeToCommit > 5 * averageOfLeadTime) pattern = 'bad';
        }

        return {
            timeToCommit,
            pattern
        };
    }

    async getWipCount() {
        const inProgressWorkItems = await this.state.getExtendedWorkItemsWithScenarios(
            this.orgId,
            [RetrievalScenario.CURRENT_WIP_ONLY],
            this.filters,
        );

        const wipCount = inProgressWorkItems.length;

        // Getting the count of unassigned items
        const unassignedItemsCount = inProgressWorkItems.filter(
            (item) => item.assignedTo === null,
        ).length;

        // Getting the list of unique assignedTo
        const uniqueAssignees = inProgressWorkItems
            .map((workItem) => workItem.assignedTo)
            .filter((item, index, array) => array.indexOf(item) === index);

        // Getting the count of unique assignedTo
        const uniqueAssigneesCount = uniqueAssignees.filter(
            (item) => item != null,
        ).length;

        return {
            count: wipCount,
            assigneesCount: uniqueAssigneesCount,
            unassignedItems: unassignedItemsCount,
            avgWipCount: Math.round(wipCount / uniqueAssigneesCount),
            items: inProgressWorkItems
        };
    }

    async getAvgWipAge() {
        const [inProgressWorkItems, completedWorkItems, avgWipAgesBetweenDates] = await Promise.all([
            this.state.getExtendedWorkItemsWithScenarios(
                this.orgId,
                [RetrievalScenario.CURRENT_WIP_ONLY],
                this.filters
            ),
            this.getCachedWorkItemByStateCategory(StateCategory.COMPLETED),
            this.getAvgWipAgeByScenario(
                RetrievalScenario.WAS_WIP_BETWEEN_DATES
            )
        ]);

        const wipAgeValues: number[] = [];

        for (const workItem of inProgressWorkItems) {
            wipAgeValues.push(workItem.wipAgeInWholeDays!);
        }

        const avgWipAge: number | null = wipAgeValues.length
            ? Math.round(mean(wipAgeValues))
            : null;

        // Calculate the pattern for traffic light
        let pattern = 'neutral';
        if (avgWipAge !== null) {
            const leadTimeList = await this.getLeadTimes(completedWorkItems);

            const averageOfLeadTime: number =
                leadTimeList.length === 0 ? 0 : mean(...leadTimeList);

            if (avgWipAge > 5 * averageOfLeadTime) {
                pattern = 'bad';
            } else if (
                avgWipAge > 3 * averageOfLeadTime &&
                avgWipAge <= 5 * averageOfLeadTime
            ) {
                pattern = 'average';
            } else if (avgWipAge < 3 * averageOfLeadTime) {
                pattern = 'good';
            }
        }

        return {
            averageAge: avgWipAge,
            avgWipAgesBetweenDates, // for performance checkpoints
            pattern
        };
    }

    async getThroughput() {
        const completedWorkItems = await this.getCachedWorkItemByStateCategory(
            StateCategory.COMPLETED,
        );

        const avgThroughput: number = await this.throughputCalculations.getAverageThroughput(
            completedWorkItems,
        );

        return {
            count: completedWorkItems.length,
            avgThroughput: avgThroughput,
            items: completedWorkItems
        };
    }

    async getWidgetInformation(): Promise<{
        demandVsCapacity?: WidgetInformation[];
        inFlowVsOutFlow?: WidgetInformation[];
        inventorySize?: WidgetInformation[];
        commitmentRate?: WidgetInformation[];
        timeToCommit?: WidgetInformation[];
        wipCount?: WidgetInformation[];
        avgWipAge?: WidgetInformation[];
        throughput?: WidgetInformation[];
    }> {
        const demandVsCapacity = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.DEMANDVSCAPACITY);
        const inFlowVsOutFlow = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.WORK_STARTED_COMPLETED);
        const inventorySize = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.TOTAL_UPCOMING_WORK);
        const commitmentRate = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.COMMITTED_WORK_RATE);
        const timeToCommit = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.TIMETOSTART);
        const wipCount = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.WIPCOUNT);
        const avgWipAge = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.WIPAGE);
        const throughput = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.TOTAL_WORK_COMPLETED);

        return {
            demandVsCapacity,
            inFlowVsOutFlow,
            inventorySize,
            commitmentRate,
            timeToCommit,
            wipCount,
            avgWipAge,
            throughput
        };
    }

    async getAvgWipAgeByScenario(scenario: RetrievalScenario) {
        const [inProgressWorkItems] = await Promise.all([
            this.state.getExtendedWorkItemsWithScenarios(
                this.orgId,
                [scenario],
                this.filters
            )
        ]);
        const wipAgeValues: number[] = [];
        // Need to use leadTimeInWholeDays to calculate wipAge for completed items ( for performance checkpoints )

        let endDate: any = await this.filters.datePeriod();
        endDate = endDate.end;
        for (const workItem of inProgressWorkItems) {
            if (workItem.departureDateTime && endDate && workItem.departureDateTime < endDate) {
                wipAgeValues.push(workItem.leadTimeInWholeDays!);
            } else {
                wipAgeValues.push(workItem.wipAgeInWholeDays!);
            }
        }


        const avgWipAge: number | null = wipAgeValues.length
            ? Math.round(getPercentile(85, wipAgeValues))
            : null;

        return avgWipAge;
    }
    async getCachedCompletedWorkItemList() {
        if (this.completedWorkItemListCache[this.orgId] instanceof Promise) {
            return await this.completedWorkItemListCache[this.orgId];
        } else if (
            this.completedWorkItemListCache[this.orgId] instanceof Array
        ) {
            return this.completedWorkItemListCache[this.orgId];
        }
        const filterCopy = _.cloneDeep(this.filters);
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
                contextId: this.filters.getContextId() ?? ''
            } as any
        });
        this.contextCache = await this.contextCache;
        return this.contextCache;
    }
    async getProjectItemsFromStateItems(items: ExtendedStateItem[], perspective: PerspectiveKey) {
        const { ageField } = getPerspectiveProfile(perspective);
        const workItemServicePromise = getWorkItemListService();
        const completedItemsPromise = this.getCachedCompletedWorkItemList();
        const customFieldsConfigPromise = this.getCachedCustomFieldsConfigs();
        const contextPromise = this.getCachedContext();
        const [
            workItemListService,
            completedItems,
            customFieldConfigs,
            context
        ] = await Promise.all(
            [
                workItemServicePromise,
                completedItemsPromise,
                customFieldsConfigPromise,
                contextPromise
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

        const projectsData = await workItemListService.getProjectsData(this.orgId);

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

    async getItemsPerWidget(items: WidgetStateItems): Promise<WidgetProjectItems> {
        console.log(items.inventoryItems?.length);
        const inventoryItems = await this.getProjectItemsFromStateItems(items.inventoryItems ?? [], "future");
        const wipItems = await this.getProjectItemsFromStateItems(items.wipItems ?? [], "present");
        const completedItems = await this.getProjectItemsFromStateItems(items.completedItems ?? [], "past");


        const results: WidgetProjectItems = {
            inventoryItems: inventoryItems,
            wipItems: wipItems,
            completedItems: completedItems
        };
        return results;
    }
}
