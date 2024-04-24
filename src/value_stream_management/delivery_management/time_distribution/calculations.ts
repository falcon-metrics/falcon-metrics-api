import { chain } from 'lodash';

import { IBoxPlot } from '../../../common/box_plot';
import { DateAnalysisOptions, IQueryFilters } from '../../../common/filters_v2';
import {
    getPerspectiveProfile,
    PerspectiveKey,
} from '../../../common/perspectives';
import { SecurityContext } from '../../../common/security';
import { IWorkItemType } from '../../../data_v2/work_item_type_aurora';
import { FQLFilterModel } from '../../../models/FilterModel';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { FG_COLOR } from '../../../utils/log_colors';
import { getTargetVariability } from '../../../utils/statistics';
import { HistogramDatum } from '../../../wip/calculations';
import { StateItem } from '../../../workitem/interfaces';
import { IState, StateCategory } from '../../../workitem/state_aurora';
import { PredefinedWidgetTypes } from '../common/enum';
import {
    getMax,
    getMean,
    getMedian,
    getMin,
    getModes,
    getPercentile
} from '../common/statistics';

export type ScatterplotDatum = {
    workItemId: string | undefined;
    title: string | undefined;
    workItemType: string | undefined;
    arrivalDateNoTime: string | undefined;
    commitmentDateNoTime: string | undefined;
    departureDateNoTime: string | undefined;
    leadTimeInWholeDays: number | undefined;
    wipAgeInWholeDays: number | undefined;
    inventoryAgeInWholeDays: number | undefined;
};

interface DistributionStatistics {
    minimum: number | null;
    maximum: number | null;
    modes: number[] | null;
    average: number | null;
    percentile50th: number | null;
    percentile85th: number | null;
    percentile95th: number | null;
    percentile98th: number | null;
    targetForPredictability: number | null;
}

type ScatterplotDatumWithDates = ScatterplotDatum & {
    arrivalDate?: string;
    commitmentDate?: string;
    departureDate?: string;
};

export interface TimeDistributionData {
    distribution: DistributionStatistics;
    histogram: HistogramDatum[];
    scatterplot: ScatterplotDatumWithDates[];
    boxPlot: IBoxPlot | null;
}

export class Calculations {
    private orgId: string;
    private state: IState;
    private filters: IQueryFilters;
    private workItemCache: Map<string, Array<StateItem>> = new Map();
    private currentPeriodFilter: string;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(opts: {
        security: SecurityContext;
        state: IState;
        workItemType: IWorkItemType;
        filters: IQueryFilters;
        widgetInformationUtils: WidgetInformationUtils;
    }) {
        this.currentPeriodFilter = 'past';
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
        this.filters = opts.filters;
        this.widgetInformationUtils = opts.widgetInformationUtils;
    }

    async getItemsByPerspective(
        perspective: PerspectiveKey,
    ): Promise<StateItem[]> {
        const { stateCategory } = getPerspectiveProfile(perspective);

        const PAST: PerspectiveKey = 'past';

        if (perspective === PAST) {
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }

        const orgId = this.orgId;
        const selectedCategory = StateCategory[stateCategory];
        const { filterByDate, filterByStateCategory, dateAnalysisOption } = this.filters || {};
        const cacheKey = `${orgId}#${selectedCategory}#${filterByDate}#${filterByStateCategory}#${dateAnalysisOption}`;

        if (
            this.workItemCache.has(cacheKey) &&
            this.currentPeriodFilter === this.getCurrentPeriod()
        ) {
            return this.workItemCache.get(cacheKey) || [];
        } else {
            const NO_FQL_FILTER: FQLFilterModel | undefined = undefined;
            const workItems = await this.state.getExtendedWorkItems(
                this.orgId,
                [stateCategory],
                this.filters,
                NO_FQL_FILTER,
                [
                    'id',
                    'flomatikaWorkItemTypeName',
                    'title',
                    'workItemId',
                    'arrivalDate',
                    'commitmentDate',
                    'departureDate',
                    'flomatikaWorkItemTypeId',
                    'leadTimeInWholeDays',
                    'wipAgeInWholeDays',
                    'inventoryAgeInWholeDays',
                ],
            );

            this.workItemCache.set(cacheKey, workItems);
            return workItems;
        }
    }

    getWorkItemTimesByPerspective(
        workItems: StateItem[],
        perspective: PerspectiveKey,
    ): number[] {
        const { ageField } = getPerspectiveProfile(perspective);
        const PAST: PerspectiveKey = 'past';

        if (perspective === PAST) {
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }
        const perspectiveTimeField = ageField ?? 'leadTimeInWholeDays';

        const workItemTimes = workItems
            .filter((workItem) => workItem[perspectiveTimeField] !== undefined)
            .map((workItem) => workItem[perspectiveTimeField] ?? 0);

        return workItemTimes;
    }

    static sortAscending(a: number, b: number): number {
        return a - b;
    }

    static keepOnlyFirstOccurence(
        item: number,
        index: number,
        array: number[],
    ): boolean {
        return array.indexOf(item) === index;
    }

    getTimeDistributionBoxPlot(workItemTimes: number[]): IBoxPlot | null {
        const { sortAscending, keepOnlyFirstOccurence } = Calculations;

        const median: number | null = getMedian(workItemTimes);
        const quartile1st: number | null = getPercentile(0.25, workItemTimes);
        const quartile3rd: number | null = getPercentile(0.75, workItemTimes);

        if (!median || !quartile1st || !quartile3rd) {
            return null;
        }

        const interQuartileRange: number = Math.round(
            quartile3rd - quartile1st,
        );
        const lowerWhisker: number = quartile1st - 1.5 * interQuartileRange;
        const upperWhisker: number = quartile3rd + 1.5 * interQuartileRange;

        const orderedTimes: number[] = workItemTimes.sort(sortAscending);
        const lowerOutliers: Array<number> = orderedTimes
            .filter((time) => time < lowerWhisker)
            .filter(keepOnlyFirstOccurence)
            .sort(sortAscending);

        const upperOutliers: Array<number> = orderedTimes
            .filter((time) => time > upperWhisker)
            .filter(keepOnlyFirstOccurence)
            .sort(sortAscending);

        const boxPlot: IBoxPlot = {
            median,
            quartile1st,
            quartile3rd,
            interQuartileRange,
            lowerWhisker,
            upperWhisker,
            lowerOutliers,
            upperOutliers,
        };

        return boxPlot;
    }

    async getTargetPredictability(
        perspective: PerspectiveKey,
        preloadedCompletedItems?: StateItem[],
    ): Promise<number | null> {
        // No Target for Future Work
        if (perspective === 'future') {
            return null;
        }

        const PAST: PerspectiveKey = 'past';

        if (perspective === PAST) {
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }

        // Reuse completed work data?
        const completedWorkItemsPromise = preloadedCompletedItems
            ? preloadedCompletedItems
            : this.getItemsByPerspective('past');

        const completedWorkItems: StateItem[] = await completedWorkItemsPromise;

        const leadTimes: number[] = this.getWorkItemTimesByPerspective(
            completedWorkItems,
            'past',
        );
        const median: number | null = getMedian(leadTimes);
        const target: number | null = median
            ? getTargetVariability(median)
            : null;

        return target;
    }

    getHistogramDataV2(
        workItems: StateItem[],
        perspective: PerspectiveKey,
    ): Array<HistogramDatum> {
        const { ageField } = getPerspectiveProfile(perspective);
        const PAST: PerspectiveKey = 'past';

        if (perspective === PAST) {
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }
        const perspectiveTimeField = ageField ?? 'leadTimeInWholeDays';

        const timeGroups = chain(workItems)
            .sortBy(perspectiveTimeField)
            .groupBy(perspectiveTimeField)
            .value();

        const timeBoxes = Object.keys(timeGroups);

        const histogramData = timeBoxes.map((time) => ({
            ageInDays: Number(time),
            workItems: timeGroups[time].map(({ workItemId }) => ({
                id: workItemId ?? '',
            })),
        }));

        return histogramData;
    }

    getScatterplot(workItems: StateItem[]): Array<ScatterplotDatum> {
        return workItems.map((workItem) => {
            const datum: ScatterplotDatum = {
                workItemId: workItem.workItemId,
                title: workItem.title,
                workItemType: workItem.flomatikaWorkItemTypeName,
                arrivalDateNoTime: workItem.arrivalDate,
                commitmentDateNoTime: workItem.commitmentDate,
                departureDateNoTime: workItem.departureDate,
                leadTimeInWholeDays: workItem.leadTimeInWholeDays,
                wipAgeInWholeDays: workItem.wipAgeInWholeDays,
                inventoryAgeInWholeDays: workItem.inventoryAgeInWholeDays,
            };

            return datum;
        });
    }

    private getCurrentPeriod(): string {
        this.currentPeriodFilter =
            this.filters?.queryParameters?.summaryPeriodType || 'past';
        return this.currentPeriodFilter;
    }

    addFullDatesToScatterplotDatum(
        datum: ScatterplotDatumWithDates,
    ): ScatterplotDatumWithDates {
        const {
            arrivalDateNoTime,
            commitmentDateNoTime,
            departureDateNoTime,
        } = datum;

        datum.arrivalDate = arrivalDateNoTime
            ? arrivalDateNoTime.substring(0, 10)
            : '';
        datum.commitmentDate = commitmentDateNoTime
            ? commitmentDateNoTime.substring(0, 10)
            : '';
        datum.departureDate = departureDateNoTime
            ? departureDateNoTime.substring(0, 10)
            : '';

        return datum;
    }

    async getTimeDistributionData(
        perspective: PerspectiveKey,
    ): Promise<TimeDistributionData> {
        if (this.filters?.filterByDate) {
            this.filters.filterByDate = true;
        }
        if (perspective === 'past') {
            console.log(FG_COLOR.GREEN, '------past > became');
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }
        const workItems: StateItem[] = await this.getItemsByPerspective(
            perspective,
        );
        const workItemTimes: number[] = this.getWorkItemTimesByPerspective(
            workItems,
            perspective,
        );

        // Predictability Target
        const completedItemsCache =
            perspective === 'past' ? workItems : undefined;
        const targetForPredictability = await this.getTargetPredictability(
            perspective,
            completedItemsCache,
        );
        const distribution = {
            minimum: getMin(workItemTimes),
            maximum: getMax(workItemTimes),
            modes: getModes(workItemTimes),
            average: getMean(workItemTimes),
            percentile50th: getPercentile(0.5, workItemTimes),
            percentile85th: getPercentile(0.85, workItemTimes),
            percentile95th: getPercentile(0.95, workItemTimes),
            percentile98th: getPercentile(0.98, workItemTimes),
            targetForPredictability,
        };

        const histogram = this.getHistogramDataV2(workItems, perspective);

        const scatterplot = this.getScatterplot(workItems).map(
            this.addFullDatesToScatterplotDatum,
        );

        const boxPlot = this.getTimeDistributionBoxPlot(workItemTimes);

        return {
            distribution,
            histogram,
            scatterplot,
            boxPlot,
        };
    }

    public async getHistogramWidgetInformation(perspective: PerspectiveKey)
    {
        let type;
        
        if (perspective === 'past') type = PredefinedWidgetTypes.LEADTIMEHISTOGRAM
        else if (perspective === 'present') type = PredefinedWidgetTypes.WIPHISTOGRAM
        else type = PredefinedWidgetTypes.INVENTORYAGEHISTOGRAM

        return this.widgetInformationUtils.getWidgetInformation(type);
    }

    public async getScatterplotWidgetInformation(perspective: PerspectiveKey)
    {
        let type;
        
        if (perspective === 'past') type = PredefinedWidgetTypes.LEADTIMESCATTERPLOT
        else if (perspective === 'present') type = PredefinedWidgetTypes.WIPSCATTERPLOT
        else type = PredefinedWidgetTypes.INVENTORYAGESCATTERPLOT

        return this.widgetInformationUtils.getWidgetInformation(type);
    }
}
