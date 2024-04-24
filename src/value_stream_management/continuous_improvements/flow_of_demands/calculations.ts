import { uniqBy } from 'lodash';
import { DateTime, Interval } from 'luxon';
import { AggregationKey, generateDateArray, separateWorkItemsInIntervalBuckets } from '../../../common/aggregation';
import { calculateCapacity } from '../../../common/capacity';
import { calculateDemand } from '../../../common/demand';

import { IQueryFilters } from '../../../common/filters_v2';
import { calculateInflow } from '../../../common/inflow';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { RetrievalScenario, StateItem } from '../../../workitem/interfaces';
import {
    IState, StateCategory,
} from '../../../workitem/state_aurora';
import { PredefinedWidgetTypes } from '../common/enum';
import _ from 'lodash';

export type FlowOfDemandDayItem = {
    date: string;
    amount: number;
};

export class Calculations {
    private orgId: string;
    private state: IState;
    private filters: IQueryFilters;
    private workItemCache: {
        [orgId: string]: {
            [stateCategory: string]: Promise<StateItem[]> | StateItem[];
        };
    } = {};
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
        this.widgetInformationUtils = opts.widgetInformationUtils;
        this.filters.setSafeAggregation();
    }

    async getDemandVsCapacityWidgetData() {
        const aggregation = this.filters.aggregation;
        const interval = await this.filters.datePeriod();

        const [
            totalDemand,
            totalCapacity,
            demandOverTime,
            capacityOverTime,
        ] = await Promise.all([
            this.getTotalsForDemand(),
            this.getTotalsForCapacity(),
            this.getDemandOverTime(interval, aggregation),
            this.getCapacityOverTime(interval, aggregation),
        ]);

        const demandOverCapacityPercent = this.getDemandOverCapacityPercent(totalDemand, totalCapacity);
        const inventoryGrowth = this.getInventoryGrowth(totalDemand, totalCapacity);

        return {
            totalDemand,
            totalCapacity,
            demandOverCapacityPercent,
            inventoryGrowth,
            demandOverTime,
            capacityOverTime,
        };
    }

    async getInflowVsOutflowWidgetData() {
        const aggregation = this.filters.aggregation;
        const interval = await this.filters.datePeriod();

        const [
            totalInflow,
            totalOutflow,
            inflowOverTime,
            outflowOverTime,
        ] = await Promise.all([
            this.getTotalsForInflow(),
            this.getTotalsForOutflow(),
            this.getInflowOverTime(interval, aggregation),
            this.getOutflowOverTime(interval, aggregation),
        ]);

        const inflowOverOutflowPercent = this.getInflowOverOutflowPercent(totalInflow, totalOutflow);
        const wipGrowth = this.getWipGrowth(totalInflow, totalOutflow);

        return {
            totalInflow,
            totalOutflow,
            inflowOverOutflowPercent,
            wipGrowth,
            inflowOverTime,
            outflowOverTime,
        };
    }

    async getWidgetInformation(type: PredefinedWidgetTypes) {
        return this.widgetInformationUtils.getWidgetInformation(type);
    }

    async getTotalsForDemand() {
        const [
            proposed,
            inprogress,
            completed,
        ] = await Promise.all([
            this.getCachedWorkItemByStateCategory(StateCategory.PROPOSED),
            this.getCachedWorkItemByStateCategory(StateCategory.INPROGRESS),
            this.getCachedWorkItemByStateCategory(StateCategory.COMPLETED),
        ]);

        const workItemList = uniqBy([...proposed, ...inprogress, ...completed], 'workItemId');

        const demand = calculateDemand(workItemList);

        return demand;
    }

    async getTotalsForCapacity() {
        const completed = await this.getCachedWorkItemByStateCategory(StateCategory.COMPLETED);

        const capacity = calculateCapacity(completed);

        return capacity;
    }

    async getDemandOverTime(interval: Interval, aggregation: AggregationKey) {

        const processInterval = async (dateStart: DateTime, dateEnd: DateTime) => {
            const filterCopy = _.cloneDeep(this.filters);
            if (filterCopy.queryParameters) {
                filterCopy.queryParameters["departureDateLowerBoundary"] = dateStart.toISO();
                filterCopy.queryParameters["departureDateUpperBoundary"] = dateEnd.toISO();
            }
            const [
                proposed,
                inprogress,
                completed,
            ] = await Promise.all([
                this.state.getExtendedWorkItemsWithScenarios(
                    this.orgId,
                    [RetrievalScenario.BECAME_INVENTORY_BETWEEN_DATES],
                    filterCopy,
                    undefined,
                ),
                this.state.getWorkItems(
                    this.orgId,
                    StateCategory.INPROGRESS,
                    filterCopy,
                    undefined,//fqlFilter
                    ['workItemId', 'arrivalDate', 'commitmentDate', 'departureDate', 'stateCategory', 'stepCategory'],
                    undefined,//isDelayed
                    undefined,//disabledDelayed
                    undefined,//disableDiscaded
                ),
                this.state.getWorkItems(
                    this.orgId,
                    StateCategory.COMPLETED,
                    filterCopy,
                    undefined,//fqlFilter
                    ['workItemId', 'arrivalDate', 'commitmentDate', 'departureDate', 'stateCategory', 'stepCategory'],
                    undefined,//isDelayed
                    undefined,//disabledDelayed
                    undefined,//disableDiscaded
                )
            ]);
            const workItemList = uniqBy([...proposed, ...inprogress, ...completed], 'workItemId');
            return {
                date: dateStart,
                demand: calculateDemand(workItemList)
            };
        };
        const promises = generateDateArray(interval, aggregation).map((dateStart) => {
            const dateEnd = dateStart.endOf(aggregation);
            return processInterval(dateStart, dateEnd);
        });
        const results = await Promise.all(promises);

        return results;
    }

    async getCapacityOverTime(interval: Interval, aggregation: AggregationKey) {

        const processInterval = async (dateStart: DateTime, dateEnd: DateTime) => {
            const filterCopy = _.cloneDeep(this.filters);
            if (filterCopy.queryParameters) {
                filterCopy.queryParameters["departureDateLowerBoundary"] = dateStart.toISO();
                filterCopy.queryParameters["departureDateUpperBoundary"] = dateEnd.toISO();
            }
            const completed = await this.state.getWorkItems(
                this.orgId,
                StateCategory.COMPLETED,
                filterCopy,
                undefined,//fqlFilter
                ['workItemId', 'arrivalDate', 'commitmentDate', 'departureDate', 'stateCategory', 'stepCategory'],
                undefined,//isDelayed
                undefined,//disabledDelayed
                undefined,//disableDiscaded
            );
            const workItemList = uniqBy([...completed], 'workItemId');
            return {
                date: dateStart,
                capacity: calculateCapacity(workItemList)
            };
        };
        const promises = generateDateArray(interval, aggregation).map((dateStart) => {
            const dateEnd = dateStart.endOf(aggregation);
            return processInterval(dateStart, dateEnd);
        });

        const results = await Promise.all(promises);

        return results;
    }

    getInventoryGrowth(demand: number, capacity: number) {
        return demand - capacity;
    }

    getDemandOverCapacityPercent(demand: number, capacity: number) {
        return capacity === 0 ? 0 : Math.round((demand / capacity - 1) * 100);
    }

    async getTotalsForInflow() {
        const [
            inprogress,
            completed,
        ] = await Promise.all([
            this.getCachedWorkItemByStateCategory(StateCategory.INPROGRESS),
            this.getCachedWorkItemByStateCategory(StateCategory.COMPLETED),
        ]);

        const workItemList = uniqBy([...inprogress, ...completed], 'workItemId');

        const inflow = calculateInflow(workItemList);

        return inflow;
    }

    async getTotalsForOutflow() {
        // Outflow is the same thing as capacity
        return await this.getTotalsForCapacity();
    }

    async getInflowOverTime(interval: Interval, aggregation: AggregationKey) {
        const [
            inprogress,
            completed,
        ] = await Promise.all([
            this.getCachedWorkItemByStateCategory(StateCategory.INPROGRESS),
            this.getCachedWorkItemByStateCategory(StateCategory.COMPLETED),
        ]);

        const workItemList = uniqBy([...inprogress, ...completed], 'workItemId');

        const buckets = separateWorkItemsInIntervalBuckets(
            workItemList,
            interval,
            aggregation,
            'commitmentDateTime'
        );

        const inflowOverTime = buckets.map(bucket => {
            const bucketDate = bucket.dateStart.toISO();
            const bucketInflow = calculateInflow(bucket.workItemList);
            return {
                date: bucketDate,
                inflow: bucketInflow,
            };
        });

        return inflowOverTime;
    }

    async getOutflowOverTime(interval: Interval, aggregation: AggregationKey) {
        // Outflow is the same thing as capacity
        const outflowOverTime = await this.getCapacityOverTime(interval, aggregation);
        return outflowOverTime.map(outflow => ({
            date: outflow.date,
            outflow: outflow.capacity
        }));
    }

    getWipGrowth(inflow: number, outflow: number) {
        return inflow - outflow;
    }

    getInflowOverOutflowPercent(inflow: number, outflow: number) {
        return Math.round((inflow / outflow - 1) * 100);
    }

    async getCachedWorkItemByStateCategory(stateCategory: StateCategory) {
        if (!this.workItemCache[this.orgId]) {
            this.workItemCache[this.orgId] = {};
        }
        if (this.workItemCache[this.orgId][stateCategory] instanceof Promise) {
            return await this.workItemCache[this.orgId][stateCategory];
        } else if (this.workItemCache[this.orgId][stateCategory]) {
            return this.workItemCache[this.orgId][stateCategory];
        }
        if (stateCategory === StateCategory.PROPOSED) {
            this.workItemCache[this.orgId][stateCategory] = this.state.getExtendedWorkItemsWithScenarios(
                this.orgId,
                [RetrievalScenario.BECAME_INVENTORY_BETWEEN_DATES],
                this.filters,
                undefined,
                ['workItemId', 'arrivalDate', 'commitmentDate', 'departureDate', 'stateCategory', 'stepCategory'],
                undefined,
            );
        } else {
            this.workItemCache[this.orgId][stateCategory] = this.state.getWorkItems(
                this.orgId,
                stateCategory,
                this.filters,
                undefined,//fqlFilter
                ['workItemId', 'arrivalDate', 'commitmentDate', 'departureDate', 'stateCategory', 'stepCategory'],
                undefined,//isDelayed
                undefined,//disabledDelayed
                undefined,//disableDiscaded
            );
        }
        this.workItemCache[this.orgId][stateCategory] = await this.workItemCache[this.orgId][stateCategory];
        return this.workItemCache[this.orgId][stateCategory];
    }
}