import { chain } from 'lodash';
import { DateTime, Interval } from 'luxon';

import { AggregationKey, generateDateArray } from '../../../common/aggregation';
import {
    generateInCategoryFilter,
    generateJoinedCategoryFilter,
} from '../../../common/dateAnalysis';
import { DateAnalysisOptions, IQueryFilters } from '../../../common/filters_v2';
import {
    getPerspectiveProfile,
    PerspectiveKey,
} from '../../../common/perspectives';
import { SecurityContext } from '../../../common/security';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { FG_COLOR } from '../../../utils/log_colors';
import { ExtendedStateItem, StateItem } from '../../../workitem/interfaces';
import { IState } from '../../../workitem/state_aurora';
import { PredefinedWidgetTypes } from '../common/enum';

export type ChartRecord = [string, number];
type ItemFilter = (workItem: ExtendedStateItem) => boolean;
export interface ChartData {
    totalItemsData: ChartRecord[];
    newItemsData: ChartRecord[];
}
export class Calculations {
    private orgId: string;
    private state: IState;
    private filters: IQueryFilters;
    private workItemCache: Map<string, Array<StateItem>> = new Map();
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

    private async getItemsByPerspective(
        perspective: PerspectiveKey,
    ): Promise<ExtendedStateItem[]> {
        const orgId = this.orgId;
        const { filterByDate, filterByStateCategory, dateAnalysisOption } =
            this.filters || {};
        const cacheKey = `${orgId}#${perspective}#${filterByDate}#${filterByStateCategory}#${dateAnalysisOption}`;

        const { historicalAnalysisCategories } = getPerspectiveProfile(
            perspective,
        );

        if (perspective === 'past') {
            console.log(FG_COLOR.GREEN, '------past > became');
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }

        if (this.workItemCache.has(cacheKey)) {
            return this.workItemCache.get(cacheKey) || [];
        } else {
            const workItems = await this.state.getExtendedWorkItems(
                this.orgId,
                historicalAnalysisCategories,
                this.filters,
                undefined,
                undefined,
            );

            this.workItemCache.set(cacheKey, workItems);
            return workItems;
        }
    }

    private async retrieveWorkItems(
        perspective: PerspectiveKey,
    ): Promise<ExtendedStateItem[]> {
        if (this.filters?.filterByDate) {
            this.filters.filterByDate = true;
        }

        const workItems: ExtendedStateItem[] = await this.getItemsByPerspective(
            perspective,
        );

        return workItems;
    }

    private preprocessWorkItems(
        workItems: ExtendedStateItem[],
        perspective: PerspectiveKey,
    ): ExtendedStateItem[] {
        const { joinDateFieldName } = getPerspectiveProfile(perspective);

        const uniqueWorkItems: ExtendedStateItem[] = chain(workItems)
            .uniqBy('workItemId')
            .sortBy(joinDateFieldName)
            .value();

        return uniqueWorkItems;
    }

    async getRunChartByPerspective(
        perspective: PerspectiveKey,
        aggregation: AggregationKey,
    ): Promise<ChartData> {
        // Determine and Validate Analysis Time Window
        const dateRange = await this.filters.datePeriod();
        const { start: startDate, end: endDate } = dateRange;
        const areValidDates = startDate?.isValid && endDate?.isValid;
        const timeZone = this.filters.clientTimezone;

        if (!areValidDates || !timeZone) {
            return {
                totalItemsData: [],
                newItemsData: [],
            };
        }

        // Create Analysis Date Range from Client Time Zone Point of View
        const clientStartDate = startDate.setZone(timeZone);
        const clientEndDate = endDate.setZone(timeZone);

        const analysisDateRange = Interval.fromDateTimes(
            clientStartDate,
            clientEndDate,
        );

        if (perspective === 'past') {
            console.log(FG_COLOR.GREEN, '------past > became');
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }

        // Prepare Work Items for Analysis
        const rawWorkItems: ExtendedStateItem[] = await this.retrieveWorkItems(
            perspective,
        );

        const workItems: ExtendedStateItem[] = this.preprocessWorkItems(
            rawWorkItems,
            perspective,
        );

        // Generate Time Points for Both Charts
        const chartTimePoints: DateTime[] = generateDateArray(
            analysisDateRange,
            aggregation,
        );

        // Determine Items in Category in Each Time Block
        const mapToTotalItemsCount = (date: DateTime): ChartRecord => {
            const inCategoryFilter: ItemFilter = generateInCategoryFilter(
                perspective,
                date,
                aggregation,
            );
            const inCategoryCount = workItems.filter(inCategoryFilter).length;

            const itemsInCategory: ChartRecord = [
                date.toISODate(),
                inCategoryCount,
            ];

            return itemsInCategory;
        };
        const totalItemsRecords: ChartRecord[] = chartTimePoints.map(
            mapToTotalItemsCount,
        );

        // Determine Items joining Category in Each Time Block
        const mapToNewItemsCount = (date: DateTime): ChartRecord => {
            const joinedCategoryFilter: ItemFilter = generateJoinedCategoryFilter(
                perspective,
                date,
                aggregation,
            );
            const joinedCategoryCount = workItems.filter(joinedCategoryFilter)
                .length;

            const itemsJoiningCategory: ChartRecord = [
                date.toISODate(),
                joinedCategoryCount,
            ];

            return itemsJoiningCategory;
        };
        const newItemsRecords: ChartRecord[] = chartTimePoints.map(
            mapToNewItemsCount,
        );

        return {
            totalItemsData: totalItemsRecords,
            newItemsData: newItemsRecords,
        };
    }

    public async getWidgetInformation(perspective: PerspectiveKey)
    {
        let type;
        
        if (perspective === 'past') type = PredefinedWidgetTypes.THROUGHPUTRUNCHART
        else if (perspective === 'present') type = PredefinedWidgetTypes.WIPRUNCHART
        else type = PredefinedWidgetTypes.INVENTORYRUNCHART

        return this.widgetInformationUtils.getWidgetInformation(type);
    }
}
