import { Sequelize } from 'sequelize';
import { chain, sortBy, uniqBy } from 'lodash';
import { SecurityContext } from '../../../common/security';
import {
    PredefinedFilterTags,
    IQueryFilters,
    DateAnalysisOptions,
} from '../../../common/filters_v2';
import { IState, StateCategory } from '../../../workitem/state_aurora';
import { ExtendedStateItem, StateItem } from '../../../workitem/interfaces';
import getWorkItemListService, {
    NumberKey,
    ProjectData,
    ProjectStateItem,
    WorkItemListService,
} from '../../../workitem/WorkItemList';
import {
    IWorkItemType,
    WorkItemTypeItem,
} from '../../../data_v2/work_item_type_aurora';
import { getNormalisedWorkItems } from '../../../utils/getNormalisedWorkItems';
import {
    AssignedToDatum,
    extractAssignmentDataFromWorkItems,
} from '../../../utils/assigned_to';
import { IContextFilter } from '../../../context/context_filter';
import { FG_COLOR } from '../../../utils/log_colors';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { PredefinedWidgetTypes } from '../common/enum';
import { PerspectiveKey } from '../../../common/perspectives';
import { DateTime, Interval } from 'luxon';
import { generateDateArray } from '../../../common/aggregation';
import { CustomFieldItem, CustomFieldModel } from '../../../models/CustomFieldModel';
import getNormalisationCategoryList from '../../delivery_governance/normalisation_charts_options/utils';
import CustomFields, { tags, CustomFieldConfigModel } from '../../../models/CustomFieldConfigModel';
import _ from 'lodash';
import ContextModel, { ContextModel as ContextModelStatic } from '../../../models/ContextModel';

export type IdDisplayNamePair = [string, string | undefined];
export interface WorkItemGroupCount {
    groupName: string | undefined;
    count: number;
}
export enum EMPTY_NORMALISATION_TAG_NAME {
    UNCLASSIFIED = 'Not classified',
}

export interface WorkItemData {
    workItemList: ProjectStateItem[];
    assignedToAnalysisData: AssignedToDatum[];
    workItemTypeAnalysisData: WorkItemGroupCount[];
    stateAnalysisData: WorkItemGroupCount[];
    startStatusAnalysisData: WorkItemGroupCount[];
}

type ProjectStateItemTimeBucket = {
    dateStart: DateTime;
    dateEnd: DateTime;
    workItemList: {
        workItemId: string;
        dateTime: DateTime;
        dateTimeToExclude: DateTime | undefined;
        original: ProjectStateItem;
    }[];
};


export class Calculations {
    private orgId: string;
    private state: IState;
    private filters: IQueryFilters;
    private contextFilter: IContextFilter;
    private workItemType: IWorkItemType;
    private workItemCache: Map<string, Array<ExtendedStateItem>> = new Map();
    private normalisedItemCache: Map<string, Array<ExtendedStateItem>> = new Map();
    private customFieldCache: Promise<any> | null = null;
    readonly widgetInformationUtils: WidgetInformationUtils;
    private aurora: Promise<Sequelize>;
    private completedWorkItemListCache: { [orgId: string]: Promise<StateItem[]> | StateItem[]; } = {};


    constructor(opts: {
        security: SecurityContext;
        state: IState;
        workItemType: IWorkItemType;
        filters: IQueryFilters;
        contextFilter: IContextFilter;
        widgetInformationUtils: WidgetInformationUtils;
        aurora: Promise<Sequelize>;
    }) {
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
        this.filters = opts.filters;
        this.contextFilter = opts.contextFilter;
        this.workItemType = opts.workItemType;
        this.widgetInformationUtils = opts.widgetInformationUtils;
        this.aurora = opts.aurora;
    }

    getNormalisationFieldsHistorical(
        buckets: ProjectStateItemTimeBucket[],
        normalisedWorkItemList: {
            [normalisationCategoryTagId: string]: {
                [normalisedDisplayName: string]: string[];
            };
        },
    ) {
        const normalisationFieldsHistoricalRecord: {
            [normalisationCategoryTagId: string]: {
                dateStart: DateTime;
                dateEnd: DateTime;
                values: { [normalisedDisplayName: string]: string[]; };
            }[];
        } = {};

        for (let i = 0; i < buckets.length; i++) {
            const bucket = buckets[i];

            const record: { [categoryTagId: string]: { [displayName: string]: string[]; }; } = {};

            for (const categoryTagId in normalisedWorkItemList) {
                if (!record[categoryTagId]) {
                    record[categoryTagId] = {};
                }
                for (const workItem of bucket.workItemList) {
                    for (let normalisedDisplayName in normalisedWorkItemList[categoryTagId]) {
                        if (normalisedWorkItemList[categoryTagId][normalisedDisplayName].includes(workItem.workItemId)) {
                            const displayName = normalisedDisplayName;
                            if (!record[categoryTagId][displayName]) {
                                record[categoryTagId][displayName] = [];
                            }
                            record[categoryTagId][displayName].push(workItem.workItemId);
                        }
                    }
                }
            }

            for (const categoryTagId in record) {
                if (!normalisationFieldsHistoricalRecord[categoryTagId]) {
                    normalisationFieldsHistoricalRecord[categoryTagId] = buckets.map(bucket => ({
                        dateStart: bucket.dateStart,
                        dateEnd: bucket.dateEnd,
                        values: {},
                    }));
                }
                for (const displayName in record[categoryTagId]) {
                    const targetBucketInRecord = normalisationFieldsHistoricalRecord[categoryTagId][i];
                    if (!targetBucketInRecord.values[displayName]) {
                        targetBucketInRecord.values[displayName] = [];
                    }
                    const workItemList = record[categoryTagId][displayName];
                    for (const workItem of workItemList) {
                        if (!targetBucketInRecord.values[displayName].includes(workItem)) {
                            targetBucketInRecord.values[displayName].push(workItem);
                        }
                    }
                }
            }
        }

        // Format dates as string and values as numeric length
        const normalisationFieldsHistoricalRecordNumeric: {
            [normalisationFieldColumnName: string]: {
                dateStart: string;
                dateEnd: string;
                values: { [normalisedDisplayName: string]: number; };
            }[];
        } = {};

        for (const normalisationCategoryTagId in normalisationFieldsHistoricalRecord) {
            normalisationFieldsHistoricalRecordNumeric[normalisationCategoryTagId] = normalisationFieldsHistoricalRecord[normalisationCategoryTagId].map(
                (bucket) => {
                    const values: Record<string, number> = {};
                    for (const fieldValue in bucket.values) {
                        values[fieldValue] = bucket.values[fieldValue].length;
                    }
                    return {
                        dateStart: bucket.dateStart.toISO(),
                        dateEnd: bucket.dateEnd.toISO(),
                        values
                    };
                }
            );
        }

        return normalisationFieldsHistoricalRecordNumeric;
    }

    groupWorkItemByCustomField(
        customFields: CustomFieldItem[],
        workItemList: ProjectStateItem[]
    ) {
        const record: { [displayName: string]: { [fieldValue: string]: string[]; }; } = {};
        for (const { displayName } of customFields) {
            if (!record[displayName]) {
                record[displayName] = {};
            }
            for (const workItem of workItemList) {
                const customFieldValue = (
                    workItem.customFields &&
                    workItem.customFields[displayName] &&
                    // Handle null values as a special case
                    workItem.customFields[displayName] !== 'null'
                ) ? workItem.customFields[displayName] as string : 'Not classified';

                if (!record[displayName][customFieldValue]) {
                    record[displayName][customFieldValue] = [];
                }
                if (!record[displayName][customFieldValue].includes(workItem.workItemId as string)) {
                    record[displayName][customFieldValue].push(workItem.workItemId as string);
                }
            }
        }
        return record;
    }

    /**
     * Get the list of distinct display names
     */
    async loadCustomFieldList(orgId: string) {
        const aurora = await this.aurora;

        const model = CustomFieldModel(aurora);
        const rawCustomFieldList: any[] = await model.findAll({
            where: {
                orgId,
            },
            attributes: ["displayName"],
            group: ["displayName"],
        });

        return rawCustomFieldList;
    }

    async getCustomFieldsHistoricalRecord(
        buckets: ProjectStateItemTimeBucket[],
        customFieldList: CustomFieldItem[]
    ) {
        const customFieldsHistoricalRecord: {
            [displayName: string]: {
                dateStart: DateTime;
                dateEnd: DateTime;
                values: { [fieldValue: string]: string[]; };
            }[];
        } = {};

        for (let i = 0; i < buckets.length; i++) {
            const bucket = buckets[i];
            const customFieldBucketList = this.groupWorkItemByCustomField(customFieldList, bucket.workItemList.map(entry => entry.original));
            for (const displayName in customFieldBucketList) {
                if (!customFieldsHistoricalRecord[displayName]) {
                    customFieldsHistoricalRecord[displayName] = buckets.map(bucket => ({
                        dateStart: bucket.dateStart,
                        dateEnd: bucket.dateEnd,
                        values: {},
                    }));
                }
                for (const fieldValue in customFieldBucketList[displayName]) {
                    const targetBucketInRecord = customFieldsHistoricalRecord[displayName][i];
                    if (!targetBucketInRecord.values[fieldValue]) {
                        targetBucketInRecord.values[fieldValue] = [];
                    }
                    const workItemList = customFieldBucketList[displayName][fieldValue];
                    for (const workItem of workItemList) {
                        if (!targetBucketInRecord.values[fieldValue].includes(workItem)) {
                            targetBucketInRecord.values[fieldValue].push(workItem);
                        }
                    }
                }
            }
        }

        // Format dates as string and values as numeric length
        const customFieldsHistoricalRecordNumeric: {
            [customFieldColumnName: string]: {
                dateStart: string;
                dateEnd: string;
                values: { [fieldValue: string]: number; };
            }[];
        } = {};

        for (const columnName in customFieldsHistoricalRecord) {
            customFieldsHistoricalRecordNumeric[columnName] = customFieldsHistoricalRecord[columnName].map(
                (bucket) => {
                    const values: Record<string, number> = {};
                    for (const fieldValue in bucket.values) {
                        values[fieldValue] = bucket.values[fieldValue].length;
                    }
                    return {
                        dateStart: bucket.dateStart.toISO(),
                        dateEnd: bucket.dateEnd.toISO(),
                        values
                    };
                }
            );
        }

        return customFieldsHistoricalRecordNumeric;
    }

    async getCustomFieldsValues(
        workItemList: any[],
        perspective: string,
    ) {
        const { buckets, full } = await this.separateWorkItemsInTimeBuckets(workItemList, perspective);

        const customFieldList: CustomFieldItem[] = await this.loadCustomFieldList(this.orgId);

        const customFieldHistorical = await this.getCustomFieldsHistoricalRecord(buckets, customFieldList);

        const customFieldDistributionAsList = await this.getCustomFieldsHistoricalRecord([full], customFieldList);

        const customFieldDistribution: {
            [fieldName: string]: {
                [fieldValue: string]: number;
            };
        } = {};

        // Group the distribution together
        for (const customFieldColumnName in customFieldDistributionAsList) {
            const bucketList = customFieldDistributionAsList[customFieldColumnName];
            for (const fieldValue in bucketList[0].values) {
                if (!customFieldDistribution[customFieldColumnName]) {
                    customFieldDistribution[customFieldColumnName] = {};
                }
                if (!customFieldDistribution[customFieldColumnName][fieldValue]) {
                    customFieldDistribution[customFieldColumnName][fieldValue] = 0;
                }
                customFieldDistribution[customFieldColumnName][fieldValue] += bucketList[0].values[fieldValue];
            }
        }
        return {
            historical: customFieldHistorical,
            distribution: customFieldDistribution,
        };
    }

    async getSystemFields(workItemData: WorkItemData) {
        return {
            assignedTo: workItemData.assignedToAnalysisData,
            workItemType: workItemData.workItemTypeAnalysisData,
            stageOfWorkflow: workItemData.stateAnalysisData,
            startStatus: workItemData.startStatusAnalysisData
        };
    }
    async getCustomFieldsRecord(workItemList: ProjectStateItem[], perspective: string, emptyDataset: boolean) {
        if (emptyDataset)
            return {};

        type CustomFieldsRecord = {
            [displayName: string]: {
                displayName: string,
                distribution: { [fieldValue: string]: number; };
                historical: {
                    dateStart: string;
                    dateEnd: string;
                    values: { [fieldValue: string]: number; };
                }[];
            };
        };

        const customFields: CustomFieldsRecord = {};

        const customFieldsValues = await this.getCustomFieldsValues(
            workItemList,
            perspective,
        );

        for (const displayName in customFieldsValues.historical) {
            if (!customFields[displayName]) {
                customFields[displayName] = {
                    displayName,
                    distribution: {},
                    historical: []
                };
            }
            customFields[displayName].historical = customFieldsValues.historical[displayName];
        }

        for (const displayName in customFieldsValues.distribution) {
            if (!customFields[displayName]) {
                customFields[displayName] = {
                    displayName,
                    distribution: {},
                    historical: []
                };
            }
            for (const fieldValue in customFieldsValues.distribution[displayName]) {
                customFields[displayName].distribution[fieldValue] = customFieldsValues.distribution[displayName][fieldValue];
            }
        }

        return customFields;
    }

    async getNormalisationFields(
        stateCategory: StateCategory,
        workItemList: any[],
        perspective: string,
        emptyDataset: boolean
    ) {
        if (emptyDataset)
            return {};
        type NormalisationFieldsRecord = {
            [normalisationCategoryId: string]: {
                distribution: {
                    [normalisedDisplayName: string]: number;
                };
                historical: {
                    dateStart: string;
                    dateEnd: string;
                    values: {
                        [normalisedDisplayName: string]: number;
                    };
                }[];
            };
        };

        const normalisationFields: NormalisationFieldsRecord = {};

        const normalisedWorkItemList = await this.getNormalisedWorkItemsCount(
            stateCategory,
            workItemList.map(workItem => workItem.workItemId as string),
        );

        const { buckets } = await this.separateWorkItemsInTimeBuckets(workItemList, perspective);

        const normalisationFieldsHistorical = this.getNormalisationFieldsHistorical(buckets, normalisedWorkItemList);

        for (const normalisationCategoryId in normalisedWorkItemList) {
            normalisationFields[normalisationCategoryId] = {
                distribution: {},
                historical: []
            };

            for (const displayName in normalisedWorkItemList[normalisationCategoryId]) {
                if (!normalisationFields[normalisationCategoryId].distribution[displayName]) {
                    normalisationFields[normalisationCategoryId].distribution[displayName] = 0;
                }
                normalisationFields[normalisationCategoryId].distribution[displayName] += normalisedWorkItemList[normalisationCategoryId][displayName].length;
            }

            for (const bucket of normalisationFieldsHistorical[normalisationCategoryId]) {
                const numericBucket: {
                    dateStart: string;
                    dateEnd: string;
                    values: { [normalisedDisplayName: string]: number; };
                } = {
                    dateStart: bucket.dateStart,
                    dateEnd: bucket.dateEnd,
                    values: {}
                };
                normalisationFields[normalisationCategoryId].historical.push(numericBucket);
                for (const key in bucket.values) {
                    if (!numericBucket.values[key]) {
                        numericBucket.values[key] = 0;
                    }
                    numericBucket.values[key] += bucket.values[key];
                }
            }
        }

        return normalisationFields;
    }

    private async separateWorkItemsInTimeBuckets(workItemList: ProjectStateItem[], perspective: string): Promise<{
        buckets: ProjectStateItemTimeBucket[],
        full: ProjectStateItemTimeBucket,
    }> {
        const workItemListWithSingleDate = workItemList.map(
            workItem => {
                let dateTime: DateTime | undefined;
                let dateTimeToExclude: DateTime | undefined;
                if (perspective === 'future') {
                    dateTime = workItem.arrivalDateTime;
                    dateTimeToExclude = workItem.commitmentDateTime;
                } else if (perspective === 'present') {
                    dateTime = workItem.commitmentDateTime;
                    dateTimeToExclude = workItem.departureDateTime;
                } else if (perspective === 'past') {
                    dateTime = workItem.departureDateTime;
                }
                return {
                    workItemId: workItem.workItemId as string,
                    dateTime: dateTime as DateTime,
                    dateTimeToExclude,
                    original: workItem
                };
            }
        );

        const interval = await this.filters.datePeriod();

        const aggregation = this.filters.getCurrentDataAggregation();

        let isBecameScenario = !['past', 'future'].includes(perspective);

        const preBucket = generateDateArray(
            interval,
            aggregation
        ).map((dateTime) => ({
            dateStart: dateTime,
            dateEnd: dateTime.endOf(aggregation),
        }));

        // Add the full bucket at the end
        preBucket.push({
            dateStart: interval.start,
            dateEnd: interval.end,
        });

        const workItemDateBucketList = preBucket.map(({ dateStart, dateEnd }) => ({
            dateStart,
            dateEnd,
            workItemList: workItemListWithSingleDate.filter((workItem) => {
                const interval = Interval.fromDateTimes(dateStart, dateEnd);

                if (isBecameScenario) {
                    return interval.contains(workItem.dateTime);
                } else {
                    // This is the "was" scenario
                    // If the value of date in the database is NULL, the DateTime object will be "Invalid DateTime" instead of  undefined
                    // Therefore, we have to explicity check if its a non-null date with isValid
                    if (workItem.dateTimeToExclude?.isValid) {
                        // For upcoming work, commitment date is present
                        // For wip, departure date is present
                        const condition = (
                            workItem.dateTime <= dateEnd
                            &&
                            workItem.dateTimeToExclude >= dateStart
                        );

                        return condition;
                    } else {
                        // For upcoming work, commitment date is not present
                        // For wip, departure date is not present
                        const condition = (
                            workItem.dateTime <= dateEnd
                        );

                        return condition;
                    }
                }
            }),
        }));

        return {
            buckets: workItemDateBucketList.slice(0, workItemDateBucketList.length - 1),
            full: workItemDateBucketList[workItemDateBucketList.length - 1]
        };
    }

    private async getItemsByPerspective(
        stateCategory: StateCategory,
    ): Promise<ExtendedStateItem[]> {
        const orgId = this.orgId;
        const selectedCategory = StateCategory[stateCategory];
        const { filterByDate, filterByStateCategory, dateAnalysisOption } =
            this.filters || {};

        const cacheKey = `${orgId}#${selectedCategory}#${filterByDate}#${filterByStateCategory}#${dateAnalysisOption}`;

        if (this.workItemCache.has(cacheKey)) {
            return this.workItemCache.get(cacheKey) || [];
        } else {
            const workItems = await this.state.getExtendedWorkItems(
                this.orgId,
                [stateCategory],
                this.filters,
                undefined,
                undefined,
            );

            this.workItemCache.set(cacheKey, workItems);
            return workItems;
        }
    }

    private convertPairToGroupCount([selector, count]: [
        string,
        number,
    ]): WorkItemGroupCount {
        return {
            groupName: selector,
            count,
        };
    }

    private getWorkItemTypeAnalysis(
        workItems: StateItem[],
        workItemTypes: WorkItemTypeItem[],
    ): WorkItemGroupCount[] {
        // Identify Available Types
        const idDisplayNamePairs: Array<IdDisplayNamePair> = workItemTypes.map(
            ({ id, displayName }) => [id, displayName],
        );
        const workItemTypesMap = new Map(idDisplayNamePairs);

        // Count Work Items by Type
        const typeCounts: WorkItemGroupCount[] = chain(workItems)
            .countBy('flomatikaWorkItemTypeId')
            .toPairs()
            .map(this.convertPairToGroupCount)
            .value();

        const setDisplayNameAsIdentifier = ({
            groupName,
            count,
        }: WorkItemGroupCount): WorkItemGroupCount => {
            const idKey: string = groupName ?? '';
            const displayName = workItemTypesMap.get(idKey) ?? '';

            return {
                groupName: displayName,
                count,
            };
        };

        const typeCountsByDisplayName: WorkItemGroupCount[] = typeCounts.map(
            setDisplayNameAsIdentifier,
        );

        const sortedTypeCounts: WorkItemGroupCount[] = sortBy(
            typeCountsByDisplayName,
            'groupName',
        );

        return sortedTypeCounts;
    }

    private getWorkItemStateAnalysis(
        workItems: StateItem[],
    ): WorkItemGroupCount[] {
        const stateCounts: WorkItemGroupCount[] = chain(workItems)
            .countBy('state')
            .toPairs()
            .map(this.convertPairToGroupCount)
            .value();

        const setUnknownStatePlaceholder = ({
            groupName,
            count,
        }: WorkItemGroupCount): WorkItemGroupCount => {
            const stateName: string = groupName ?? 'Unknown state';

            return {
                groupName: stateName,
                count,
            };
        };
        const stateCountsWithAdjustedName: WorkItemGroupCount[] = stateCounts.map(
            setUnknownStatePlaceholder,
        );

        const sortedStateCounts: WorkItemGroupCount[] = sortBy(
            stateCountsWithAdjustedName,
            'groupName',
        );

        return sortedStateCounts;
    }

    private getStartStatusAnalysis(
        workItems: ProjectStateItem[]
    ): WorkItemGroupCount[] {
        const startStatusCounts: WorkItemGroupCount[] = [];
        workItems.forEach(item => {
            const idx = startStatusCounts.findIndex(i => i.groupName === item.startStatus);
            if (idx > -1) {
                startStatusCounts[idx].count += 1;
            } else {
                startStatusCounts.push({
                    groupName: item.startStatus,
                    count: 1
                });
            }
        });

        const setUnknownStatePlaceholder = ({
            groupName,
            count,
        }: WorkItemGroupCount): WorkItemGroupCount => {
            const stateName: string = groupName ?? 'Not classified';

            return {
                groupName: stateName,
                count,
            };
        };
        const startStatusCountsAdjustedName: WorkItemGroupCount[] = startStatusCounts.map(
            setUnknownStatePlaceholder,
        );
        const sortedstartStatusCountsAdjustedName: WorkItemGroupCount[] = sortBy(
            startStatusCountsAdjustedName,
            'groupName',
        );
        return sortedstartStatusCountsAdjustedName;
    }
    async getCachedCompletedWorkItemList() {
        if (this.completedWorkItemListCache[this.orgId] instanceof Promise) {
            return await this.completedWorkItemListCache[this.orgId];
        } else if (this.completedWorkItemListCache[this.orgId] instanceof Array) {
            return this.completedWorkItemListCache[this.orgId];
        }
        const filterCopy = _.cloneDeep(this.filters);
        if (filterCopy.queryParameters && filterCopy.queryParameters['departureDateUpperBoundary']) {
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

    async getWorkItemData(
        stateCategory: StateCategory,
        ageField: NumberKey,
        perspective?: string
    ): Promise<WorkItemData> {
        // Primary Asynchronous Data Operations
        if (this.filters?.filterByDate) {
            this.filters.filterByDate = true;
        }

        if (stateCategory === StateCategory.COMPLETED) {
            console.log(FG_COLOR.GREEN, '------past > became');
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }

        const workItemsPromise = this.getItemsByPerspective(stateCategory);
        const workItemListServicePromise = getWorkItemListService();
        const workItemTypesPromise = this.workItemType.getTypes(this.orgId);
        const completedWorkPromise = this.getCachedCompletedWorkItemList();
        const model = await CustomFields();
        const customFieldsConfigPromise = await model.findAll({
            where: { orgId: this.orgId, deletedAt: null } as any,
        });
        const contextModel = await ContextModel();
        const contextPromise = await contextModel.findOne({
            where: {
                contextId: this.filters.getContextId() ?? ''
            } as any
        });

        const [workItems, workItemListService, workItemTypes, completedWorkItems, customFieldConfigs, context]: [
            ExtendedStateItem[],
            WorkItemListService,
            WorkItemTypeItem[],
            StateItem[],
            CustomFieldConfigModel[],
            ContextModelStatic | null
        ] = await Promise.all([
            workItemsPromise,
            workItemListServicePromise,
            workItemTypesPromise,
            completedWorkPromise,
            customFieldsConfigPromise,
            contextPromise
        ]);

        const uniqueItems: ExtendedStateItem[] = uniqBy(
            workItems,
            'workItemId',
        );

        // Secondary Asynchronous Data Operations
        const projectsDataPromise = workItemListService.getProjectsData(
            this.orgId,
        );
        const assignedToAnalysisDataPromise = extractAssignmentDataFromWorkItems(
            uniqueItems,
        );

        const [projectsData, assignedToAnalysisData]: [
            ProjectData[],
            AssignedToDatum[],
        ] = await Promise.all([
            projectsDataPromise,
            assignedToAnalysisDataPromise,
        ]);

        let desiredDeliveryDateCustomField: string[] | undefined = undefined;
        let classOfServiceCustomField: string | undefined = undefined;
        if (customFieldConfigs.length > 0 && context) {
            desiredDeliveryDateCustomField = customFieldConfigs.filter(i => i.datasourceId === context.datasourceId && i.tags?.includes(tags.desiredDeliveryDate)).map(i => i.datasourceFieldName);
            classOfServiceCustomField = customFieldConfigs.find(i => i.datasourceId === context.datasourceId && i.tags?.includes(tags.classOfService))?.datasourceFieldName;
        }
        const workItemList = workItemListService.getProjectsItemList(
            projectsData,
            uniqueItems,
            ageField,
            completedWorkItems,
            perspective,
            desiredDeliveryDateCustomField,
            classOfServiceCustomField
        );

        // Other Operations
        const workItemTypeAnalysisData: WorkItemGroupCount[] = this.getWorkItemTypeAnalysis(
            workItems,
            workItemTypes,
        );
        const stateAnalysisData: WorkItemGroupCount[] = this.getWorkItemStateAnalysis(
            workItems,
        );
        const startStatusAnalysisData: WorkItemGroupCount[] = this.getStartStatusAnalysis(
            workItemList
        );

        return {
            workItemList,
            assignedToAnalysisData,
            workItemTypeAnalysisData,
            stateAnalysisData,
            startStatusAnalysisData
        };
    }

    private getNormalisedItemRetriever(stateCategory: StateCategory) {
        // Builds a Retrieving Function for a Given Perspective
        const retriever = async (
            filterTags: string = PredefinedFilterTags.NORMALISATION,
            parsedQuery?: string | undefined,
        ): Promise<ExtendedStateItem[]> => {
            const selectedCategory = StateCategory[stateCategory];
            const { filterByDate, filterByStateCategory, dateAnalysisOption } =
                this.filters || {};

            const cacheKey = `${this.orgId}#${selectedCategory}#${filterByDate}#${filterByStateCategory}#${filterTags}#${dateAnalysisOption}`;

            if (this.normalisedItemCache.has(cacheKey)) {
                return this.normalisedItemCache.get(cacheKey) || [];
            } else {
                const normalisedItems = await this.state.getNormalisedExtendedWorkItems(
                    this.orgId,
                    [stateCategory],
                    this.filters,
                    parsedQuery ? undefined : filterTags,
                    parsedQuery,
                    undefined,
                );

                this.normalisedItemCache.set(cacheKey, normalisedItems);
                return normalisedItems;
            }
        };

        return retriever;
    }

    public async getNormalisedWorkItemsCount(
        stateCategory: StateCategory,
        workItemIdList: string[],
    ) {
        let mustReloadDateAnalysisOption = false;
        let dateAnalysisOriginalValue = this.filters.dateAnalysisOption;

        // According to getWorkItemData method on this class this part is important, not sure why
        if (stateCategory === StateCategory.COMPLETED) {
            mustReloadDateAnalysisOption = true;
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }

        const aurora = await this.aurora;
        const normalisationCategoryList = await getNormalisationCategoryList(aurora, this.orgId);

        const filteredTags: PredefinedFilterTags[] = normalisationCategoryList.map(
            cat => cat.id as PredefinedFilterTags
        );

        const workItemRetriever = this.getNormalisedItemRetriever(
            stateCategory,
        ).bind(this);

        const obj: {
            [normalisationCategoryTagId: string]: {
                [normalisedDisplayName: string]: ExtendedStateItem[];
            };
        } = await getNormalisedWorkItems(workItemRetriever, filteredTags);

        if (mustReloadDateAnalysisOption) {
            this.filters.dateAnalysisOption = dateAnalysisOriginalValue;
        }

        const workItemRecord: {
            [normalisationCategoryTagId: string]: {
                [normalisedDisplayName: string]: string[];
            };
        } = {};

        for (const normalisationCategoryTagId in obj) {
            if (!workItemRecord[normalisationCategoryTagId]) {
                workItemRecord[normalisationCategoryTagId] = {};
            }
            for (const displayName in obj[normalisationCategoryTagId]) {
                if (!workItemRecord[normalisationCategoryTagId][displayName]) {
                    workItemRecord[normalisationCategoryTagId][displayName] = [];
                }
                const stateItemList = obj[normalisationCategoryTagId][displayName];
                for (const item of stateItemList) {
                    if (workItemRecord[normalisationCategoryTagId][displayName].includes(item.workItemId as string)) {
                        continue;
                    }
                    workItemRecord[normalisationCategoryTagId][displayName].push(item.workItemId as string);
                }
            }
        }

        for (const normalisationCategoryTagId in obj) {
            const matches: string[] = [];

            for (const displayName in obj[normalisationCategoryTagId]) {
                const workItemsWithThatDisplayName = obj[normalisationCategoryTagId][displayName].map(workItem => workItem.workItemId as string);
                for (const item of workItemsWithThatDisplayName) {
                    matches.push(item);
                }
            }

            if (matches.length > workItemIdList.length) {
                console.warn('Warning: The list of matches for ' + normalisationCategoryTagId + ' returned more items than the total (' + workItemIdList.length + ')');
                console.warn('The calculation of normalisation is probably incorrect');
            } else if (matches.length < workItemIdList.length) {
                // There are some missing work item ids from this tag
                // They were not matching any category, but they do exist in the time frame.
                // Let's add them here:
                workItemRecord[normalisationCategoryTagId][
                    EMPTY_NORMALISATION_TAG_NAME.UNCLASSIFIED
                ] = workItemIdList.filter(workItemId => !matches.includes(workItemId));
            }
        }

        return workItemRecord;
    }

    public async getAssignedToWidgetInformation(perspective: PerspectiveKey) {
        let type;

        if (perspective === 'past') type = PredefinedWidgetTypes.COMPLETEDASSIGNEDTO;
        else if (perspective === 'present') type = PredefinedWidgetTypes.WIPASSIGNEDTO;
        else type = PredefinedWidgetTypes.UPCOMINGASSIGNEDTO;

        return this.widgetInformationUtils.getWidgetInformation(type);
    }

    public async getWorkItemTypeWidgetInformation(perspective: PerspectiveKey) {
        let type;

        if (perspective === 'past') type = PredefinedWidgetTypes.COMPLETEDWORKITEMTYPE;
        else if (perspective === 'present') type = PredefinedWidgetTypes.WIPWORKITEMTYPE;
        else type = PredefinedWidgetTypes.UPCOMINGWORKITEMTYPE;

        return this.widgetInformationUtils.getWidgetInformation(type);
    }

    public async getStageOfWorkflowWidgetInformation(perspective: PerspectiveKey) {
        let type;

        if (perspective === 'past') type = PredefinedWidgetTypes.COMPLETEDSTAGEOFWORKFLOW;
        else if (perspective === 'present') type = PredefinedWidgetTypes.WIPSTAGEOFWORKFLOW;
        else type = PredefinedWidgetTypes.UPCOMINGSTAGEOFWORKFLOW;

        return this.widgetInformationUtils.getWidgetInformation(type);
    }

    public async getWorkItemsWidgetInformation(perspective: PerspectiveKey) {
        let type;

        if (perspective === 'past') type = PredefinedWidgetTypes.COMPLETEDWORKITEMS;
        else if (perspective === 'present') type = PredefinedWidgetTypes.WIPWORKITEMS;
        else type = PredefinedWidgetTypes.UPCOMINGWORKITEMS;

        return this.widgetInformationUtils.getWidgetInformation(type);
    }

    public async getCustomFieldsWidgetInformation(perspective: PerspectiveKey) {
        let type;

        if (perspective === 'past') type = PredefinedWidgetTypes.COMPLETEDCUSTOMFIELDS;
        else if (perspective === 'present') type = PredefinedWidgetTypes.WIPCUSTOMFIELDS;
        else type = PredefinedWidgetTypes.UPCOMINGCUSTOMFIELDS;

        return this.widgetInformationUtils.getWidgetInformation(type);
    }

    public async getNormaliseWidgetInformation(perspective: PerspectiveKey) {
        let type;

        if (perspective === 'past') type = PredefinedWidgetTypes.COMPLETEDNORMALISEFIELDS;
        else if (perspective === 'present') type = PredefinedWidgetTypes.WIPNORMALISEFIELDS;
        else type = PredefinedWidgetTypes.UPCOMINGNORMALISEFIELDS;

        return this.widgetInformationUtils.getWidgetInformation(type);
    }
}