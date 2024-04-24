import { IQueryFilters } from '../../../common/filters_v2';
import { ISnapshotQueries } from '../../../workitem/snapshot_queries';
import { CFDNewDataItem, CFDSummaryItem } from './handler';
import { IState } from '../../../workitem/state_aurora';
import { DateTime, Interval } from 'luxon';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { PredefinedWidgetTypes } from '../common/enum';
import { TIMEZONE_UTC } from '../../../utils/date_utils';

type CFDDataRow = {
    state: string;
    date: Date;
    items: number;
};

export class Calculations {
    private orgId: string;
    private snapshotQueries: ISnapshotQueries;
    private filters: IQueryFilters;
    private state: IState;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(opts: {
        orgId: string;
        snapshotQueries: ISnapshotQueries;
        filters: IQueryFilters;
        state: IState;
        widgetInformationUtils: WidgetInformationUtils;
    }) {
        this.orgId = opts.orgId;
        this.snapshotQueries = opts.snapshotQueries;
        this.filters = opts.filters;
        this.state = opts.state;
        this.widgetInformationUtils = opts.widgetInformationUtils;
    }

    async getCumulativeFlowResponse(
        selectedWorkItemType: string[] | undefined,
        includeCompleted: boolean,
    ) {
        const workItemIdList = await this.state.getWorkItemIdsUsingPredicates(
            this.orgId,
            this.filters
        );
        if (workItemIdList.length === 0) {
            // Empty state
            return null;
        }

        const includeInprogress = true;

        const rawCFDData = await this.getRawCFDData(
            this.orgId,
            workItemIdList,
            selectedWorkItemType,
            includeInprogress,
            includeCompleted,
        );

        // When no workflows are selected, cfd returns stepCategory data
        // In step category mode, CFD only returns inprogress vs completed
        // so additional things must be done such as renaming 'inprogress' to 'In Progress'
        const isStepCategoryCFD = !selectedWorkItemType || selectedWorkItemType.length === 0;

        const cfdData = await this.transformRawCFDIntoGraphData(
            rawCFDData,
            isStepCategoryCFD,
        );

        // No summary data is necessary when CFD is on step category mode
        const summaryData = isStepCategoryCFD ? {} : await this.getCFDSummaryData(
            workItemIdList,
            cfdData,
            selectedWorkItemType,
        );

        const widgetInfo = await this.getWidgetInformation();

        return {
            cfdData,
            summaryData,
            widgetInfo
        };
    }

    async getWidgetInformation() {
        return this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.CUMULATIVEFLOWDIAGRAM);
    }

    async getCFDSummaryData(
        workItemIdList: string[],
        cfdData: { [state: string]: CFDNewDataItem; },
        workItemTypeList?: string[],
    ) {
        const period: Interval = await this.filters.datePeriod()!;

        const arrivalsPromise = this.state.getArrivalsByState(this.orgId, period, this.filters.clientTimezone ?? TIMEZONE_UTC, workItemIdList, workItemTypeList);
        const departurePromise = this.state.getDeparturesByState(this.orgId, period, this.filters.clientTimezone ?? TIMEZONE_UTC, workItemIdList, workItemTypeList);
        const averageCyclePromise = this.state.getAverageCycleTime(this.orgId, period, this.filters.clientTimezone ?? TIMEZONE_UTC, workItemIdList, workItemTypeList);

        const [
            arrivals,
            departures,
            averageCycles
        ] = await Promise.all([
            arrivalsPromise,
            departurePromise,
            averageCyclePromise
        ]);

        const numberOfDaysInPeriod = Interval.fromDateTimes(
            period.start.startOf('day'),
            period.end.endOf('day')
        ).splitBy({
            days: 1
        }).map(date =>
            date.start.toSQLDate()
        ).length;

        const summaryData: {
            [state: string]: CFDSummaryItem;
        } = {};

        const allowedStates = Object.keys(cfdData).filter(state => state !== 'completed');

        for (let state of allowedStates) {
            summaryData[state] = {};
        }

        // Assign arrivals to table
        for (let state in arrivals) {
            if (!summaryData[state]) {
                continue;
            }
            summaryData[state].arrivalRate = arrivals[state] / numberOfDaysInPeriod;
        }

        // Assign departure to table
        for (let state in departures) {
            if (!summaryData[state]) {
                continue;
            }
            summaryData[state].departureRate = departures[state] / numberOfDaysInPeriod;
        }

        // Count items in each state and add days so that we can calculate daily average (instead of querying the database for the data)
        const stateCount: Record<string, number> = {};
        for (let state in cfdData) {
            if (!stateCount[state]) {
                stateCount[state] = 0;
            }
            // For each date on cfd date, add it to state count
            const cfdDataItem = cfdData[state];
            for (const dateKey in cfdDataItem.cumulativeFlowData) {
                stateCount[state] += cfdDataItem.cumulativeFlowData[dateKey];
            }
        }

        // Calculate dailyAverage with stateCount
        for (let state in stateCount) {
            if (!summaryData[state]) {
                continue;
            }
            // Divide state count to get daily average
            summaryData[state].dailyAverage = stateCount[state] / numberOfDaysInPeriod;
        }

        // Assign averageCycle to table
        for (let state in averageCycles) {
            if (!summaryData[state]) {
                continue;
            }
            summaryData[state].averageCycleTime = averageCycles[state];
        }

        return summaryData;
    }

    async transformRawCFDIntoGraphData(
        rawCFDData: CFDDataRow[],
        shouldTransformStepCategoryToState: boolean
    ) {
        const period: Interval = await this.filters.datePeriod()!;

        const dates: ('2022-01-01' | string)[] = Interval.fromDateTimes(
            period.start.startOf('day'),
            period.end.endOf('day')
        ).splitBy({
            days: 1
        }).map(date =>
            date.start.toSQLDate()
        );

        const statesRecord: {
            [state: string]: {
                [date: string]: number;
            };
        } = {};

        for (const { state, date, items } of rawCFDData) {
            if (!statesRecord[state]) {
                statesRecord[state] = {};
            }
            const dateKey = DateTime.fromJSDate(date).toSQLDate();
            if (!statesRecord[state][dateKey]) {
                statesRecord[state][dateKey] = 0;
            }
            if (typeof items !== 'number' || isNaN(items)) {
                console.warn(`states record had invalid number (${JSON.stringify(items)}) on state ${state}`);
                continue;
            }
            statesRecord[state][dateKey] += items;
        }

        const cfdDataList: CFDNewDataItem[] = Object.keys(statesRecord).map((state) => {
            // Initialize date map in the correct order
            const dateMap: { [date: string]: number; } = {};
            for (let i = 0; i < dates.length; i++) {
                const date = dates[i];
                dateMap[date] = 0;
            }

            for (const dateKey in statesRecord[state]) {
                if (typeof dateMap[dateKey] !== 'number') {
                    console.warn(`State date count contains a date outside the filter range: ${dateKey}`);
                    continue;
                }
                const itemsOnThisDate = statesRecord[state][dateKey];
                if (typeof itemsOnThisDate !== 'number' || isNaN(itemsOnThisDate)) {
                    console.warn('There is an unexpected number on states:', itemsOnThisDate);
                    continue;
                }
                dateMap[dateKey] += itemsOnThisDate;
            }

            if (state === 'completed') {
                // when there are no completed items on a day the database function returns it as missing
                // this is because completed items come from the states table
                // to solve this we filter the missing date by the value from the previous dates
                // and date map is ordered so it works even if multiple days are missing
                for (const dateKey in dateMap) {
                    if (dateMap[dateKey] > 0) {
                        continue;
                    }
                    const previousDate = DateTime.fromJSDate(new Date(dateKey + 'T00:00:00Z'));
                    const previousDateKey = previousDate.minus({ day: 1 }).toSQLDate();
                    dateMap[dateKey] = dateMap[previousDateKey] || 0;
                }
            }

            return {
                stateName: shouldTransformStepCategoryToState ? transformStepCategoryToState(state) : state,
                cumulativeFlowData: dateMap
            };
        });

        // Group cfd data by stateName in an object
        const cfdData: { [state: string]: CFDNewDataItem; } = {};
        for (let cfdDataRow of cfdDataList) {
            if (cfdData[cfdDataRow.stateName]) {
                throw new Error(`Duplicate CFD entry for state "${cfdDataRow.stateName}"`);
            }
            cfdData[cfdDataRow.stateName] = cfdDataRow;
        }
        return cfdData;
    }

    async getRawCFDData(
        orgId: string,
        workItemIdList: string[],
        workItemTypesSnapshots?: string[],
        includeInprogress?: boolean,
        includeCompleted?: boolean,
    ) {
        const period: Interval = await this.filters.datePeriod()!;

        const results = await this.snapshotQueries.getDatabaseCFD(
            orgId,
            period,
            includeInprogress ? 'inprogress' : '',
            includeCompleted ? 'completed' : '',
            this.filters.clientTimezone || 'utc',
            workItemTypesSnapshots,
            workItemIdList
        );

        return results as CFDDataRow[];
    }

}

function transformStepCategoryToState(state: string): any {
    const map: Record<string, string> = {
        'inprogress': 'In Progress',
        'completed': 'Completed',
        'preceding': 'Preceding',
        'proposed': 'Proposed',
    };
    return map[state] || state;
}
