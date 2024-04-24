import { countBy } from 'lodash';
import { DateTime } from 'luxon';
import { AggregationKey } from '../../../common/aggregation';
import {
    IQueryFilters,
    PredefinedFilterTags,
} from '../../../common/filters_v2';
import {
    ExtendedStateItem,
    RetrievalScenario,
} from '../../../workitem/interfaces';
import { IState } from '../../../workitem/state_aurora';
import { groupWorkItemListByAggregation } from '../utils';
import { WidgetInformation, WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { PredefinedWidgetTypes } from '../common/enum';

export type DemandDistributionWidgetData = {
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
export type DemandDistributionWorkItem = {
    workItemId: string;
    dateTime: DateTime;
    dateTimeToExclude?: DateTime;
    normalizedDisplayName: string;
};
export class Calculations {
    readonly orgId: string;
    readonly state: IState;
    readonly filters: IQueryFilters;
    readonly aggregation: AggregationKey;

    private tag: PredefinedFilterTags;
    private isBecameScenario: boolean;
    
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(opts: {
        orgId: string;
        state: IState;
        filters: IQueryFilters;
        widgetInformationUtils: WidgetInformationUtils;
    }) {
        this.orgId = opts.orgId;
        this.state = opts.state;
        this.filters = opts.filters;
        this.aggregation = this.filters.getCurrentDataAggregation();
        this.tag = PredefinedFilterTags.DEMAND;
        this.isBecameScenario = !this.filters.dateAnalysisOption; ///date analysis = was

        this.widgetInformationUtils = opts.widgetInformationUtils;
    }

    async getUpcomingWorkDemandDistribution(): Promise<DemandDistributionWidgetData> {
        //historical view = WAS
        //distribution view = ALL

        const prepareDemandItems = (items: ExtendedStateItem[]): DemandDistributionWorkItem[] => {
            return items.filter((workItem) => {
                if (!workItem.arrivalDateTime) {
                    console.warn(
                        `Warning: Work item ${workItem.workItemId} is missing ${workItem.arrivalDateTime}`,
                    );
                    return false;
                }
                return true;
            })
                .map((workItem) => ({
                    workItemId: workItem.workItemId as string,
                    dateTime: workItem.arrivalDateTime as DateTime,
                    normalizedDisplayName: workItem.normalisedDisplayName || '',
                    dateTimeToExclude: workItem.commitmentDateTime as DateTime,
                }));
        };

        const proposedItemsForDistribution = await this.getNormalisedItemsByScenario(
            this.orgId,
            RetrievalScenario.CURRENT_INVENTORY_ONLY,
            this.tag,
        );

        // Include delayed items
        const proposedItemsForHistorical = await this.getNormalisedItemsByScenario(
            this.orgId,
            RetrievalScenario.WAS_INVENTORY_BETWEEN_DATES,
            this.tag,
            true
        );

        const workItemListForDistribution: DemandDistributionWorkItem[] = prepareDemandItems(proposedItemsForDistribution);
        const workItemListForHistorical: DemandDistributionWorkItem[] = prepareDemandItems(proposedItemsForHistorical);

        const distribution: {
            [normalizedDisplayName: string]: number;
        } = countBy(workItemListForDistribution, 'normalizedDisplayName');

        const historical = await this.groupWorkItemListByAggregation(
            workItemListForHistorical,
            this.aggregation,
            false
        );

        // get widget information
        const widgetInfo = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.DEMANDDISTRIBUTION_UPCOMINGWORK);
        
        return {
            distribution,
            historical,
            widgetInfo : widgetInfo || undefined
        };
    }

    async getWorkInProcessDemandDistribution(): Promise<DemandDistributionWidgetData> {
        //historical view = WAS
        //distribution view = ALL

        const inProcessItemsForDistribution = await this.getNormalisedItemsByScenario(
            this.orgId,
            RetrievalScenario.CURRENT_WIP_ONLY,
            this.tag,
        );

        const inProcessItemsForHistorical = await this.getNormalisedItemsByScenario(
            this.orgId,
            RetrievalScenario.WAS_WIP_BETWEEN_DATES,
            this.tag,
        );

        const dateFieldForStateCategory = 'commitmentDateTime';
        const dateFieldToExcludeForStateCategory = 'departureDateTime';

        const prepareDemandItems = (items: ExtendedStateItem[]): DemandDistributionWorkItem[] => {
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
                    dateTimeToExclude: workItem[
                        dateFieldToExcludeForStateCategory
                    ] as DateTime,
                    normalizedDisplayName: workItem.normalisedDisplayName || '',
                }));
        }

        const workItemListForDistribution: DemandDistributionWorkItem[] = prepareDemandItems(inProcessItemsForDistribution);
        const workItemListForHistorical: DemandDistributionWorkItem[] = prepareDemandItems(inProcessItemsForHistorical);

        const distribution: {
            [normalizedDisplayName: string]: number;
        } = countBy(workItemListForDistribution, 'normalizedDisplayName');

        //should check for each week if the item is still in process
        const historical = await this.groupWorkItemListByAggregation(
            workItemListForHistorical,
            this.aggregation,
            false
        );
        
        // get widget information
        const widgetInfo = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.DEMANDDISTRIBUTION_WORKINPROCESS);
        
        return {
            distribution,
            historical,
            widgetInfo : widgetInfo || undefined
        };
    }

    async getCompletedWorkDemandDistribution(): Promise<DemandDistributionWidgetData> {
        // Include delayed items
        const completedItems = await this.getNormalisedItemsByScenario(
            this.orgId,
            RetrievalScenario.BECAME_COMPLETED_BETWEEN_DATES,
            this.tag,
            true
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
                dateTimeStr: (workItem[dateFieldForStateCategory] as DateTime).toString(),
                weekNumber: (workItem[dateFieldForStateCategory] as DateTime).weekNumber,
                normalizedDisplayName: workItem.normalisedDisplayName || '',
            }));

        const distribution: {
            [normalizedDisplayName: string]: number;
        } = countBy(workItemList, 'normalizedDisplayName');
        const historical = await this.groupWorkItemListByAggregation(
            workItemList,
            this.aggregation,
            true
        );
        
        // get widget information
        const widgetInfo = await this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.DEMANDDISTRIBUTION_COMPLETEDWORK);
        
        return {
            distribution,
            historical,
            widgetInfo : widgetInfo || undefined
        };
    }
    private async getNormalisedItemsByScenario(
        orgId: string,
        scenario: RetrievalScenario,
        tag: PredefinedFilterTags,
        /**
         * Fetch delayed items
         * 
         * Delayed items will not be fetched by default
         */
        forceDelayed = false
    ): Promise<ExtendedStateItem[]> {
        return this.state.getNormalisedExtendedWorkItemsWithScenarios(
            orgId,
            [scenario],
            this.filters,
            tag,
            undefined,
            forceDelayed,
        );
    }

    private async groupWorkItemListByAggregation(
        workItemList: DemandDistributionWorkItem[],
        aggregation: AggregationKey,
        isBecameScenario?: boolean
    ) {
        isBecameScenario = isBecameScenario ?? this.isBecameScenario

        return groupWorkItemListByAggregation(
            workItemList,
            aggregation,
            isBecameScenario,
            await this.filters.datePeriod(),
        );
    }
}