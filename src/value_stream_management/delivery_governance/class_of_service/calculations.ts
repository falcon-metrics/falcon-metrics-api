import { countBy } from 'lodash';
import { Logger } from 'log4js';
import { DateTime } from 'luxon';
import {
    AggregationKey,
} from '../../../common/aggregation';
import {
    IQueryFilters,
    PredefinedFilterTags,
} from '../../../common/filters_v2';
import { SecurityContext } from '../../../common/security';
import { IWorkItemType } from '../../../data_v2/work_item_type_aurora';
import { WidgetInformation, WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import {
    ExtendedStateItem,
    RetrievalScenario,
} from '../../../workitem/interfaces';
import { ISnapshotQueries } from '../../../workitem/snapshot_queries';
import { IState } from '../../../workitem/state_aurora';
import { PredefinedWidgetTypes } from '../common/enum';
import { groupWorkItemListByAggregation } from '../utils';

export type ClassOfServiceWidgetData = {
    distribution: {
        [normalizedDisplayName: string]: number;
    };
    historical: {
        dateStart: string;
        dateEnd: string;
        values: {
            [normalizedDisplayName: string]: number;
        };
    }[];
    widgetInfo?: WidgetInformation[];
};

export type ClassOfServiceWorkItem = {
    workItemId: string;
    dateTime: DateTime;
    dateTimeToExclude?: DateTime;
    normalizedDisplayName: string;
};
export class Calculations {
    readonly orgId: string;
    readonly state: IState;
    readonly filters: IQueryFilters;
    readonly snapshotQueries: ISnapshotQueries;
    readonly aggregation: AggregationKey;

    private tag: PredefinedFilterTags;
    private isBecameScenario: boolean;
    
    readonly widgetInformationUtils: WidgetInformationUtils;

    private normWorkItemListCache: {
        [orgId: string]: {
            [scenario: string]: {
                [tag: string]:
                    | Promise<ExtendedStateItem[]>
                    | ExtendedStateItem[];
            };
        };
    } = {};

    constructor(opts: {
        security: SecurityContext;
        logger: Logger;
        state: IState;
        filters: IQueryFilters;
        workItemType: IWorkItemType;
        snapshotQueries: ISnapshotQueries;
        widgetInformationUtils: WidgetInformationUtils;
    }) {
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
        this.filters = opts.filters;
        this.snapshotQueries = opts.snapshotQueries;
        this.aggregation = this.filters.getCurrentDataAggregation();
        this.tag = PredefinedFilterTags.CLASS_OF_SERVICE;

        this.isBecameScenario = !this.filters.dateAnalysisOption;
        this.widgetInformationUtils = opts.widgetInformationUtils;
    }

    async getUpcomingWorkClassesOfService(): Promise<ClassOfServiceWidgetData> {
        //historical view = WAS
        //distribution view = ALL

        const proposedItemsForDistribution = await this.getNormalisedItemsByStateCategory(
            this.orgId,
            RetrievalScenario.CURRENT_INVENTORY_ONLY,
            this.tag,
        );

        const proposedItemsForHistorical = await this.getNormalisedItemsByStateCategory(
            this.orgId,
            RetrievalScenario.WAS_INVENTORY_BETWEEN_DATES,
            this.tag,
        );

        const dateFieldForStateCategory = 'arrivalDateTime';

        const prepareItems = (items: ExtendedStateItem[]): ClassOfServiceWorkItem[] => {
            return items.map((workItem) => ({
                workItemId: workItem.workItemId as string,
                dateTime: workItem[dateFieldForStateCategory] as DateTime,
                normalizedDisplayName: workItem.normalisedDisplayName || '',
                dateTimeToExclude: workItem['commitmentDateTime'] as DateTime,
            }));
        };

        const workItemListForDistribution = prepareItems(proposedItemsForDistribution);
        const workItemListForHistorical = prepareItems(proposedItemsForHistorical);

        const distribution: {
            [normalizedDisplayName: string]: number;
        } = countBy(workItemListForDistribution, 'normalizedDisplayName');

        const historical = await this.groupWorkItemListByAggregation(
            workItemListForHistorical,
            this.aggregation,
        );

        // get widget information
        const widgetInfo = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.CLASSOFSERVICE_UPCOMINGWORK);
        
        return {
            distribution,
            historical,
            widgetInfo : widgetInfo || undefined
        };
    }

    async getWorkInProcessClassesOfService(): Promise<ClassOfServiceWidgetData> {
        //historical view = WAS
        //distribution view = ALL


        const inProcessItemsForDistribution = await this.getNormalisedItemsByStateCategory(
            this.orgId,
            RetrievalScenario.CURRENT_WIP_ONLY,
            this.tag,
        );

        const inProcessItemsForHistorical = await this.getNormalisedItemsByStateCategory(
            this.orgId,
            RetrievalScenario.WAS_WIP_BETWEEN_DATES,
            this.tag,
        );

        const dateFieldForStateCategory = 'commitmentDateTime';

        const prepareItems = (items: ExtendedStateItem[]): ClassOfServiceWorkItem[] => {
            return items.filter((workItem) => {
                if (!workItem[dateFieldForStateCategory]) {
                    console.warn(
                        `Warning: Work item ${workItem.workItemId} is missing ${dateFieldForStateCategory}`,
                    );
                    return false;
                }
                return true;
            })
            .map((workItem) => ({
                workItemId: workItem.workItemId as string,
                dateTime: workItem[dateFieldForStateCategory] as DateTime,
                dateTimeToExclude: workItem['departureDateTime'],
                normalizedDisplayName: workItem.normalisedDisplayName || '',
            }));
        }

        const workItemListForDistribution = prepareItems(inProcessItemsForDistribution);
        const workItemListForHistorical = prepareItems(inProcessItemsForHistorical);

        const distribution: {
            [normalizedDisplayName: string]: number;
        } = countBy(workItemListForDistribution, 'normalizedDisplayName');

        const historical = await this.groupWorkItemListByAggregation(
            workItemListForHistorical,
            this.aggregation,
        );

        // get widget information
        const widgetInfo = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.CLASSOFSERVICE_WORKINPROCESS);
        
        return {
            distribution,
            historical,
            widgetInfo : widgetInfo || undefined
        };
    }

    async getCompletedWorkClassesOfService(): Promise<ClassOfServiceWidgetData> {
        const completedItems = await this.getNormalisedItemsByStateCategory(
            this.orgId,
            RetrievalScenario.BECAME_COMPLETED_BETWEEN_DATES,
            this.tag,
        );
        const dateFieldForStateCategory = 'departureDateTime';
        const workItemList = completedItems
            .filter((workItem) => {
                if (!workItem[dateFieldForStateCategory]) {
                    console.warn(
                        `Warning: Work item ${workItem.workItemId} is missing ${dateFieldForStateCategory}`,
                    );
                    return false;
                }
                return true;
            })
            .map((workItem) => ({
                workItemId: workItem.workItemId as string,
                dateTime: workItem[dateFieldForStateCategory] as DateTime,
                normalizedDisplayName: workItem.normalisedDisplayName || '',
            }));
        const distribution: {
            [normalizedDisplayName: string]: number;
        } = countBy(workItemList, 'normalizedDisplayName');
        const historical = await this.groupWorkItemListByAggregation(
            workItemList,
            this.aggregation,
        );

        // get widget information
        const widgetInfo = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.CLASSOFSERVICE_COMPLETEDWORK);
        
        return {
            distribution,
            historical,
            widgetInfo : widgetInfo || undefined
        };
    }

    private async getNormalisedItemsByStateCategory(
        orgId: string,
        scenario: RetrievalScenario,
        tag: PredefinedFilterTags,
    ): Promise<ExtendedStateItem[]> {
        // Setup cache
        if (!this.normWorkItemListCache[orgId]) {
            this.normWorkItemListCache[orgId] = {};
        }
        if (!this.normWorkItemListCache[orgId][scenario]) {
            this.normWorkItemListCache[orgId][scenario] = {};
        }
        // Check cache
        if (
            this.normWorkItemListCache[orgId][scenario][tag] instanceof Promise
        ) {
            return await this.normWorkItemListCache[orgId][scenario][tag];
        } else if (this.normWorkItemListCache[orgId][scenario][tag]) {
            return this.normWorkItemListCache[orgId][scenario][tag];
        }
        // Generate cache promise
        this.normWorkItemListCache[orgId][scenario][
            tag
        ] = this.state.getNormalisedExtendedWorkItemsWithScenarios(
            this.orgId!,
            [scenario],
            this.filters,
            tag,
            undefined,
        );
        // Save cache result
        this.normWorkItemListCache[orgId][scenario][tag] = await this
            .normWorkItemListCache[orgId][scenario][tag];
        // Return cache result
        return this.normWorkItemListCache[orgId][scenario][tag];
    }

    private async groupWorkItemListByAggregation(
        workItemList: {
            workItemId: string;
            dateTime: DateTime;
            normalizedDisplayName: string;
            dateTimeToExclude?: DateTime;
        }[],
        aggregation: AggregationKey,
    ) {
        const interval = await this.filters.datePeriod();
        return groupWorkItemListByAggregation(
            workItemList,
            aggregation,
            this.isBecameScenario,
            interval,
        );
    }
}
