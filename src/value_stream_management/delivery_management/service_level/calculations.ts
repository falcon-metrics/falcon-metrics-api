import { DateTime } from 'luxon';
import { chain, find, uniqBy } from 'lodash';

import {
    DateAnalysisOptions,
    IQueryFilters,
    PredefinedFilterTags,
} from '../../../common/filters_v2';
import { SecurityContext } from '../../../common/security';
import { isDateTimeValid } from '../../../common/aggregation';
import {
    getPerspectiveProfile,
    PerspectiveKey,
} from '../../../common/perspectives';
import { WorkItemGroup, ExtendedItemGroups } from '../../../common/interfaces';
import { FQLFilterModel } from '../../../models/FilterModel';
import WorkItemTypeModel, {
    WorkItemTypeStatic,
} from '../../../models/WorkItemTypeModel';
import { ExtendedStateItem } from '../../../workitem/interfaces';
import { IState, StateCategory } from '../../../workitem/state_aurora';
import { TrendAnalysisStructure } from '../../../utils/trend_analysis';

import {
    getMax,
    getMean,
    getMedian,
    getMin,
    getModes,
    getPercentile,
} from '../common/statistics';
import { FG_COLOR } from '../../../utils/log_colors';

import { getLastFourFullWeeks, Week } from '../../../utils/date_utils';
import { WidgetInformation, WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { PredefinedWidgetTypes } from '../common/enum';
import WorkItemTypeMapModel, { WorkItemTypeMapStatic } from '../../../models/WorkItemTypeMapModel';


export interface ServiceLevelEntry {
    displayName: string;
    count: number;
    serviceLevelExpectationInDays: number;
    mode: number[] | null;
    median: number | null;
    average: number | null;
    min: number | null;
    max: number | null;
    percentile85: number | null;
    tail: number | null;
    targetMet?: number;
    trendAnalysisSLE?: TrendAnalysisStructure;
    predictability?: string;
    projectId?: string;
}

export interface ServiceLevelData {
    normalisedDemands: ServiceLevelEntry[];
    workItemTypes: ServiceLevelEntry[];
}

export interface ServiceLevelExpectations {
    displayName: string;
    projectId?: string;
    serviceLevelExpectationInDays: number | undefined;
}

export type ServiceLevelCriteria = ServiceLevelExpectations[];

export class Calculations {
    private orgId: string;
    private state: IState;
    private filters: IQueryFilters;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(opts: {
        state: IState;
        security: SecurityContext;
        filters: IQueryFilters;
        widgetInformationUtils: WidgetInformationUtils;
    }) {
        this.orgId = opts.security.organisation!;
        this.filters = opts.filters;
        this.state = opts.state;
        this.widgetInformationUtils = opts.widgetInformationUtils;
    }

    private groupWorkItemsByProperty(
        propertyName: string,
        workItems: ExtendedStateItem[],
    ): ExtendedItemGroups {
        const workItemsByProperty = chain(workItems)
            .groupBy(propertyName)
            .toPairs()
            .value();

        const workItemGroups: ExtendedItemGroups = workItemsByProperty.map(
            ([groupName, workItems]) => ({ groupName, workItems }),
        );

        return workItemGroups;
    }

    private async getWorkItemsByDemand(
        stateCategory: StateCategory,
    ): Promise<ExtendedItemGroups> {
        // Get Normalised Items with Demand Tag
        const workItems: ExtendedStateItem[] = await this.state.getNormalisedExtendedWorkItems(
            this.orgId,
            [stateCategory],
            this.filters,
            PredefinedFilterTags.DEMAND,
            undefined,
            undefined,
        );

        const uniqueItems: ExtendedStateItem[] = uniqBy(
            workItems,
            'workItemId',
        );

        // Group Items by Normalised Demand
        const demandGroups: ExtendedItemGroups = this.groupWorkItemsByProperty(
            'normalisedDisplayName',
            uniqueItems,
        );

        return demandGroups;
    }

    private async getWorkItemsByType(
        stateCategory: StateCategory,
    ): Promise<ExtendedItemGroups> {
        const NO_FQL_FILTER = undefined;
        const workItems: ExtendedStateItem[] = await this.state.getExtendedWorkItems(
            this.orgId,
            [stateCategory],
            this.filters,
            NO_FQL_FILTER,
            undefined,
        );

        const uniqueItems: ExtendedStateItem[] = uniqBy(
            workItems,
            'workItemId',
        );

        // Group Items by Work Item Type
        const workItemGroups: ExtendedItemGroups = this.groupWorkItemsByProperty(
            'workItemType',
            uniqueItems,
        );

        return workItemGroups;
    }

    private async getDemandServiceLevelCriteria(): Promise<ServiceLevelCriteria> {
        // Retrieves Service Level Criteria for Each Normalised Demand
        const demandFilters: FQLFilterModel[] = await this.state.getFQLFilters(
            this.orgId,
            PredefinedFilterTags.DEMAND,
        );

        const normalisedDemandsCriteria: ServiceLevelCriteria = demandFilters.map(
            ({ SLE, displayName }) => ({
                serviceLevelExpectationInDays: SLE,
                displayName,
            }),
        );
        return normalisedDemandsCriteria;
    }

    private async getItemTypeServiceLevelCriteria(): Promise<ServiceLevelCriteria> {
        // Retrieves Service Level Criteria for Each Work Item Type
        const workItemTypeModel: WorkItemTypeStatic = await WorkItemTypeModel();

        const workItemTypeMapModel: WorkItemTypeMapStatic = await WorkItemTypeMapModel();

        const workItemTypes = await workItemTypeModel.findAll({
            where: {
                orgId: this.orgId,
                deletedAt: null,
            } as any,
        });

        const workItemTypeMaps = await workItemTypeMapModel.findAll({
            where: {
                orgId: this.orgId
            } as any
        });

        const workItemTypesCriteria: ServiceLevelCriteria = workItemTypeMaps.map(
            ({ projectId, workItemTypeId, serviceLevelExpectationInDays }) => {
                const matchingEntry = workItemTypes.find(i => i.workItemTypeId === workItemTypeId);
                return {
                    serviceLevelExpectationInDays,
                    displayName: matchingEntry ? matchingEntry.displayName : '',
                    projectId
                };
            },
        );

        const uniqueSles: ServiceLevelCriteria = [];
        workItemTypesCriteria.forEach(i => {
            const existingSleIndex = uniqueSles.findIndex(x => x.displayName === i.displayName);
            if (existingSleIndex > -1 && uniqueSles[existingSleIndex].serviceLevelExpectationInDays === i.serviceLevelExpectationInDays) {
                uniqueSles[existingSleIndex].projectId = uniqueSles[existingSleIndex].projectId + ',' + i.projectId;
            } else {
                uniqueSles.push(i);
            }
        });

        return uniqueSles;
    }

    private getPredictability(
        medianTime: number,
        percentile98: number,
    ): string {
        const predictabilityThreshold = 5.6;
        const isPredictabilityHigh: boolean = medianTime
            ? percentile98 / medianTime <= predictabilityThreshold
            : true;

        return isPredictabilityHigh ? 'high' : 'low';
    }

    static getTargetMet(
        workItems: ExtendedStateItem[],
        sleTarget: number,
        perspective: PerspectiveKey,
    ): number {
        const workItemTimes: number[] = Calculations.getWorkItemTimes(
            workItems,
            perspective,
        );

        if (workItemTimes.length === 0) {
            return 0;
        }

        const leadTimesUnderTarget: number[] = workItemTimes.filter(
            (workItemTime) => workItemTime <= sleTarget,
        );

        const proportionMet =
            leadTimesUnderTarget.length / workItemTimes.length;
        const percentagePoints = Math.round(proportionMet * 100);

        return percentagePoints;
    }

    /**
     * Returns a the list of work items that were completed
     * during the given week
     *
     * @param referenceWeek The week to check
     * @param workItems List of work items
     * @returns List of work items completed during the given week
     */
    static selectCompletedItemsInSameWeek(
        referenceWeek: Week,
        workItems: ExtendedStateItem[],
    ): ExtendedStateItem[] {
        const hasSameWeek = ({
            departureDateTime,
        }: ExtendedStateItem): boolean =>
            isDateTimeValid(departureDateTime) &&
            departureDateTime.weekNumber === referenceWeek.getWeekNumber() &&
            departureDateTime.year === referenceWeek.getYear();

        return workItems.filter(hasSameWeek);
    }

    /**
     * Calculates the percentage of items where the lead time
     * is less than or equal to the given service level expectation
     * during the two weeks
     *
     * @param firstWeek First week of the fortnight
     * @param secondWeek Second week of the fortnight
     * @param workItems List of work items
     * @param sleTarget Service Level Expectation
     * @returns Target met during the fortnight (2 weeks) as a percentage
     */
    private getTargetMetForFortnight(
        firstWeek: Week,
        secondWeek: Week,
        workItems: ExtendedStateItem[],
        sleTarget: number,
    ) {
        // Throw error if firstWeek and secondWeek aren't consecutive weeks
        if (!secondWeek.isNextWeekOf(firstWeek)) {
            throw new Error(
                'Invalid weeks. The weeks must be consecutive weeks. secondWeek should be the week after the firstWeek',
            );
        }

        const { selectCompletedItemsInSameWeek } = Calculations;

        const completedWorkFirstWeek: ExtendedStateItem[] = selectCompletedItemsInSameWeek(
            firstWeek,
            workItems,
        );

        const completedWorkSecondWeek: ExtendedStateItem[] = selectCompletedItemsInSameWeek(
            secondWeek,
            workItems,
        );

        const completedWork: ExtendedStateItem[] = completedWorkFirstWeek.concat(
            completedWorkSecondWeek,
        );

        const targetLastFortnight: number = Calculations.getTargetMet(
            completedWork,
            sleTarget,
            'past',
        );

        return targetLastFortnight;
    }

    /**
     * Calculates "target met" trend over the past two fortnights,
     * discounting the current week.
     * @param workItems Work items completed within the analysis period.
     * @param sleTarget Service Level Expectation target for work-item
     * completion.
     * @param endDate Date at which analysis time period ends. Used for
     * determining past two fortnights.
     */
    private getTrendAnalysis(
        workItems: ExtendedStateItem[],
        sleTarget: number,
        endDate: DateTime,
    ): TrendAnalysisStructure {
        /**
         * If the endDate is in the middle of the week,
         * Do not use that week for the calculations, use the last four whole weeks
         *
         * The trend calculation always has to consider whole weeks
         * It should not compare a full week with a partial week
         * */
        // week 2 and week 4 are not required
        const { week1, week2, week3, week4 } = getLastFourFullWeeks(endDate);

        // Determine Target Met over Last Full Fortnight
        const targetLastFortnight: number = this.getTargetMetForFortnight(
            week3,
            week4,
            workItems,
            sleTarget,
        );

        const targetSecondToLastFortnight: number = this.getTargetMetForFortnight(
            week1,
            week2,
            workItems,
            sleTarget,
        );

        // Determine Change over 4-week Period
        const targetMetChange: number =
            targetLastFortnight - targetSecondToLastFortnight;

        if (targetMetChange === 0) {
            return {
                percentage: targetMetChange,
                text: 'same compared to week before',
                arrowDirection: 'stable',
                arrowColour: 'yellow',
            };
        }

        if (targetMetChange > 0) {
            return {
                percentage: targetMetChange,
                text: 'more compared to week before',
                arrowDirection: 'up',
                arrowColour: 'green',
            };
        } else {
            return {
                percentage: targetMetChange,
                text: 'less compared to week before',
                arrowDirection: 'down',
                arrowColour: 'red',
            };
        }
    }

    private findGroupSLE(
        groupName: string,
        serviceLevelCriteria: ServiceLevelCriteria,
        projectId: string | undefined = undefined
    ): ServiceLevelExpectations {
        // Select Group Expectations in Service Level Criteria
        const matchingCriteria: any = {
            displayName: groupName
        };
        if (projectId) {
            matchingCriteria.projectId = projectId;
        }
        const matchingEntry = find(serviceLevelCriteria, matchingCriteria);

        // Parse Potentially Missing Attributes
        const { serviceLevelExpectationInDays, displayName } =
            matchingEntry || {};

        const parsedSLEInDays: number = serviceLevelExpectationInDays ?? 0;
        const parsedDisplayName: string =
            displayName ?? 'Unavailable Item Type Name';

        const parsedEntry: ServiceLevelExpectations = {
            serviceLevelExpectationInDays: parsedSLEInDays,
            displayName: parsedDisplayName,
        };

        return parsedEntry;
    }

    static getWorkItemTimes(
        workItems: ExtendedStateItem[],
        perspective: PerspectiveKey,
    ): number[] {
        const { ageField } = getPerspectiveProfile(perspective);
        const perspectiveTimeField = ageField ?? 'leadTimeInWholeDays';

        const workItemTimes = workItems.map(
            (workItem) => workItem[perspectiveTimeField] ?? 0,
        );

        return workItemTimes;
    }

    private getServiceLevelAnalyzer(
        serviceLevelCriteria: ServiceLevelCriteria,
        perspective: PerspectiveKey,
        analysisEndDate: DateTime,
        useProjectId: boolean = false
    ) {
        // Returns Function to Compute a Group's Service Level under Criteria
        const findGroupSLE = this.findGroupSLE;

        const calculateServiceLevel = (
            workItemGroup: WorkItemGroup,
        ): ServiceLevelEntry => {
            let groupSLE: ServiceLevelExpectations;
            const { groupName } = workItemGroup;

            let projectIdForResponse;
            //kanbanize group by project , just create dummy groups for all project
            if (useProjectId && groupName.includes('/:/:/:')) {
                const [displayName, projectId] = groupName.split('/:/:/:');
                groupSLE = findGroupSLE(
                    displayName,
                    serviceLevelCriteria,
                    projectId
                );
                projectIdForResponse = projectId;
            } else {
                const { groupName } = workItemGroup;
                groupSLE = findGroupSLE(
                    groupName,
                    serviceLevelCriteria,
                );
            }
            const serviceLevelEntry: ServiceLevelEntry = this.calculateStatistics(
                workItemGroup,
                groupSLE,
                perspective,
                analysisEndDate,
            );

            if (projectIdForResponse) {
                serviceLevelEntry.projectId = projectIdForResponse;
            }
            return serviceLevelEntry;
        };

        return calculateServiceLevel;
    }

    private calculateStatistics(
        workItemGroup: WorkItemGroup,
        serviceLevelExpectations: ServiceLevelExpectations,
        perspective: PerspectiveKey,
        analysisEndDate: DateTime,
    ): ServiceLevelEntry {
        const { workItems } = workItemGroup;

        // Get Service Level Expectations
        const {
            displayName,
            serviceLevelExpectationInDays: rawSLEInDays,
        } = serviceLevelExpectations;

        const serviceLevelExpectationInDays: number = rawSLEInDays ?? 0;
        const workItemTimes: number[] = Calculations.getWorkItemTimes(
            workItems,
            perspective,
        );

        // In case of Missing Work Items
        if (workItems.length === 0 || workItemTimes.length === 0) {
            return {
                displayName,
                count: 0,
                serviceLevelExpectationInDays: 0,
                targetMet: 100,
                trendAnalysisSLE: {
                    percentage: 0,
                    text: 'no data available',
                    arrowDirection: 'stable',
                    arrowColour: 'gray',
                },
                predictability: 'high',
                mode: null,
                median: null,
                average: null,
                min: null,
                max: null,
                percentile85: null,
                tail: null,
            };
        }

        const count: number = workItems.length;
        const averageTime: number | null = getMean(workItemTimes);
        const medianTime: number | null = getMedian(workItemTimes);
        const modeTime: number[] | null = getModes(workItemTimes);
        const minTime: number | null = getMin(workItemTimes);
        const maxTime: number | null = getMax(workItemTimes);

        const percentile85: number | null = getPercentile(0.85, workItemTimes);
        const percentile98: number | null = getPercentile(0.98, workItemTimes);

        // Perspective-Dependent Statistics
        const isPastView: boolean = perspective === 'past';
        const isPresentView: boolean = perspective === 'present';

        const useFullStatistics: boolean = isPastView || isPresentView;

        // Only Past and Present Views
        const predictability: string | undefined =
            useFullStatistics && medianTime && percentile98
                ? this.getPredictability(medianTime, percentile98)
                : undefined;

        const targetMet = useFullStatistics
            ? Calculations.getTargetMet(
                workItems,
                serviceLevelExpectationInDays,
                perspective,
            )
            : undefined;

        const trendAnalysis = isPastView
            ? this.getTrendAnalysis(
                workItems,
                serviceLevelExpectationInDays,
                analysisEndDate,
            )
            : undefined;

        return {
            displayName,
            count,
            serviceLevelExpectationInDays,
            mode: modeTime,
            median: medianTime,
            average: averageTime,
            min: minTime,
            max: maxTime,
            percentile85: percentile85,
            tail: percentile98,
            targetMet,
            trendAnalysisSLE: trendAnalysis,
            predictability,
        };
    }

    groupWorkItemsByUniqueSLE(
        workitemsGroupedByType: ExtendedItemGroups,
        serviceLevelConfigs: ServiceLevelCriteria
    ) {

        let uniqueItems: ExtendedStateItem[] = [];
        workitemsGroupedByType.forEach(i => uniqueItems = uniqueItems.concat(i.workItems));
        const uniqueSles: ServiceLevelCriteria = [];
        serviceLevelConfigs.forEach(i => {
            const existingSleIndex = uniqueSles.findIndex(x => x.displayName === i.displayName);
            if (existingSleIndex > -1 && uniqueSles[existingSleIndex].serviceLevelExpectationInDays === i.serviceLevelExpectationInDays) {
                uniqueSles[existingSleIndex].projectId = uniqueSles[existingSleIndex].projectId + ',' + i.projectId;
            } else {
                uniqueSles.push(i);
            }
        });
        const workItemGroups: ExtendedItemGroups = workitemsGroupedByType;
        uniqueItems.forEach(item => {
            const matchingSle = uniqueSles.find(i =>
                i.displayName === item.workItemType && item.projectId && (i.projectId?.includes(item.projectId) || i.projectId === 'NOT_APPLICABLE'));
            const groupName = item.workItemType + '/:/:/:' + matchingSle?.projectId;
            const existingGroupIndex = workItemGroups.findIndex(x => x.groupName === groupName);
            if (existingGroupIndex > -1) {
                workItemGroups[existingGroupIndex].workItems.push(item);
            } else {
                workItemGroups.push({
                    groupName,
                    workItems: [item]
                });
            }
        });
        return workItemGroups;
    }

    public async getServiceLevelData(
        perspective: PerspectiveKey,
    ): Promise<ServiceLevelData> {
        // Determine and Validate Analysis Time Window
        const dateRange = await this.filters.datePeriod();
        const { end: endDate } = dateRange;
        const { clientTimezone } = this.filters;

        if (!clientTimezone || !endDate?.isValid) {
            return {
                normalisedDemands: [],
                workItemTypes: [],
            };
        }

        const clientEndDate = endDate.setZone(clientTimezone);

        if (this.filters?.filterByDate) {
            this.filters.filterByDate = true;
        }

        const { stateCategory } = getPerspectiveProfile(perspective);

        if (perspective === 'past') {
            console.log(FG_COLOR.GREEN, '------past > became');
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }

        // Promises for Work Items by Normalised Demand and Work Item Type
        const itemsByDemandPromise: Promise<ExtendedItemGroups> = this.getWorkItemsByDemand(
            stateCategory,
        );
        const itemsByTypePromise: Promise<ExtendedItemGroups> = this.getWorkItemsByType(
            stateCategory,
        );

        // Promises for Service Level Criteria for Normalised Demands and Work Item Types
        const demandCriteriaPromise: Promise<ServiceLevelCriteria> = this.getDemandServiceLevelCriteria();
        const itemTypesCriteriaPromise: Promise<ServiceLevelCriteria> = this.getItemTypeServiceLevelCriteria();

        const [
            workItemsByDemand,
            workItemsByType,
            demandCriteria,
            itemTypesCriteria,
        ]: [
                ExtendedItemGroups,
                ExtendedItemGroups,
                ServiceLevelCriteria,
                ServiceLevelCriteria,
            ] = await Promise.all([
                itemsByDemandPromise,
                itemsByTypePromise,
                demandCriteriaPromise,
                itemTypesCriteriaPromise,
            ]);

        const groupedWorkItemsByType = this.groupWorkItemsByUniqueSLE(workItemsByType, itemTypesCriteria);
        // Calculate Service Level for Normalised Demands and Work Item Types
        const calculateDemandServiceLevel = this.getServiceLevelAnalyzer(
            demandCriteria,
            perspective,
            clientEndDate,
        );
        const normalisedDemandData: ServiceLevelEntry[] = workItemsByDemand.map(
            calculateDemandServiceLevel,
        );

        const calculateItemTypesServiceLevel = this.getServiceLevelAnalyzer(
            itemTypesCriteria,
            perspective,
            clientEndDate,
            true
        );
 
        const workItemTypesData: ServiceLevelEntry[] = groupedWorkItemsByType.map(
            calculateItemTypesServiceLevel,
        );

        return {
            normalisedDemands: normalisedDemandData,
            workItemTypes: workItemTypesData
        };
    }

    public async getWidgetInformation(perspective: PerspectiveKey) {
        let type;

        if (perspective === 'past') type = PredefinedWidgetTypes.COMPLETED_WORKTYPE_OVERVIEW;
        else if (perspective === 'present') type = PredefinedWidgetTypes.WIP_WORKTYPE_OVERVIEW;
        else type = PredefinedWidgetTypes.UPCOMING_WORKTYPE_OVERVIEW;

        return this.widgetInformationUtils.getWidgetInformation(type);
    }
}
