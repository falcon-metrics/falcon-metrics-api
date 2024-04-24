import { range } from 'lodash';
import { DateTime, Duration, Interval } from 'luxon';

import {
    ExtendedStateItem,
    SnapshotItem,
    StateItem,
} from '../workitem/interfaces';

export const AGGREGATIONS = [
    'day',
    'week',
    'month',
    'quarter',
    'year',
] as const;

export type AggregationKey = typeof AGGREGATIONS[number];

function isString(text: unknown): text is string {
    return typeof text === 'string' || text instanceof String;
}

export const parseAggregation = (aggregationParam: unknown): AggregationKey => {
    if (!aggregationParam || !isString(aggregationParam)) {
        return 'day';
    }

    // Check if value is valid option
    const keyMatchesParam = (key: string) => key === aggregationParam;
    const aggregationCandidate = AGGREGATIONS.find(keyMatchesParam);

    const aggregation: AggregationKey = aggregationCandidate ?? 'day';
    return aggregation;
};

// Specific for Aggregation Parameter passed by UI Filter
export const parseFilterAggregationOption = (
    aggregationParam: unknown,
): AggregationKey => {
    if (!aggregationParam || !isString(aggregationParam)) {
        return 'day';
    }

    // Make Lowercase and Slice trailing 's'
    const formattedParam = aggregationParam.toLowerCase().slice(0, -1);

    // Check if Value is Valid Option
    const keyMatchesParam = (key: string) => key === formattedParam;
    const aggregationCandidate = AGGREGATIONS.find(keyMatchesParam);

    const aggregation: AggregationKey = aggregationCandidate ?? 'day';
    return aggregation;
};

export const isDateTimeValid = (
    date: DateTime | undefined,
): date is DateTime => {
    return date !== null && date !== undefined && date.isValid;
};

// Returns Function that Adjusts Work Item Dates by Aggregation
export const getWorkItemDateAdjuster = (
    aggregation: AggregationKey,
    adjusterCustomKey?: keyof StateItem,
): ((workItem: StateItem) => StateItem | SnapshotItem) => {
    const isValidDate = isDateTimeValid;

    const workItemDateAdjuster = (
        workItem: StateItem,
    ): StateItem | SnapshotItem => {
        const {
            arrivalDateTime,
            commitmentDateTime,
            departureDateTime,
        } = workItem;

        const adjustDateByAggregation = (date: DateTime | undefined) =>
            isValidDate(date) ? date.startOf(aggregation) : date;

        const customAdjustedField = adjusterCustomKey
            ? workItem[adjusterCustomKey]
            : undefined;

        const customDate: DateTime | undefined = DateTime.isDateTime(
            customAdjustedField,
        )
            ? customAdjustedField
            : undefined;

        const customKeyData = adjusterCustomKey
            ? {
                [adjusterCustomKey]: adjustDateByAggregation(customDate),
            }
            : {};

        const adjustedWorkItem = {
            ...workItem,
            ...customKeyData,
            arrivalDateTime: adjustDateByAggregation(arrivalDateTime),
            commitmentDateTime: adjustDateByAggregation(commitmentDateTime),
            departureDateTime: adjustDateByAggregation(departureDateTime),
        };

        return adjustedWorkItem;
    };

    return workItemDateAdjuster;
};

// Returns Function that Adjusts Work Item Dates by Aggregation
// Function must return object of same type as input
export const getExtendedWorkItemDateAdjuster = (
    aggregation: AggregationKey,
): ((workItem: ExtendedStateItem) => ExtendedStateItem) => {
    const isValidDate = isDateTimeValid;

    const extendedWorkItemDateAdjuster = (
        workItem: StateItem,
    ): StateItem | SnapshotItem => {
        const {
            arrivalDateTime,
            commitmentDateTime,
            departureDateTime,
        } = workItem;

        const adjustDateByAggregation = (date: DateTime | undefined) =>
            isValidDate(date) ? date.startOf(aggregation) : date;

        const adjustedWorkItem = {
            ...workItem,
            arrivalDateTime: adjustDateByAggregation(arrivalDateTime),
            commitmentDateTime: adjustDateByAggregation(commitmentDateTime),
            departureDateTime: adjustDateByAggregation(departureDateTime),
        };

        return adjustedWorkItem;
    };

    return extendedWorkItemDateAdjuster;
};

export const getTimeDuration = (
    numPeriods: number,
    aggregation: AggregationKey,
): Duration => {
    switch (aggregation) {
        case 'year':
            return Duration.fromObject({ years: numPeriods });
        case 'month':
            return Duration.fromObject({ months: numPeriods });
        case 'quarter':
            return Duration.fromObject({ quarters: numPeriods });
        case 'week':
            return Duration.fromObject({ weeks: numPeriods });
        case 'day':
            return Duration.fromObject({ days: numPeriods });
    }
};

export const generateDateArray = (
    dateRange: Interval,
    aggregation: AggregationKey,
): Array<DateTime> => {
    const startOfAggregation: DateTime = dateRange.start.startOf(aggregation);
    const endOfAggregation: DateTime = dateRange.end.endOf(aggregation);

    const flatInterval = Interval.fromDateTimes(startOfAggregation, endOfAggregation);
    const numTimePeriods: number = flatInterval.length(aggregation);

    // Build Date Array from Time Period Indices
    const timePeriodIndices: number[] = range(0, numTimePeriods);

    const transformIndexToDate = (idx: number): DateTime => {
        const timeToSkip: Duration = getTimeDuration(idx, aggregation);
        const correspondingDate = startOfAggregation.plus(timeToSkip);

        return correspondingDate;
    };

    const dateList = timePeriodIndices.map(transformIndexToDate);

    // Extra check to make sure there is never a date that starts after the end date
    if (dateList.length > 1 && dateList[dateList.length - 1].valueOf() > dateRange.end.valueOf()) {
        dateList.pop();
    }

    return dateList;
};

/**
 * Separate a list of work items in sub periods of data intervals by an arbitrary date field
 * @param workItemList 
 * @param dateRange 
 * @param aggregation 
 * @param dateField 
 * @returns 
 */
export function separateWorkItemsInIntervalBuckets(
    workItemList: StateItem[] | ExtendedStateItem[],
    dateRange: Interval,
    aggregation: AggregationKey,
    dateField: 'arrivalDateTime' | 'commitmentDateTime' | 'departureDateTime' | string,
) {
    return generateDateArray(dateRange, aggregation).map(
        dateStart => {
            const dateStartValue = dateStart.valueOf();
            const dateEnd = dateStart.endOf(aggregation);
            const dateEndValue = dateEnd.valueOf();
            return ({
                dateStart,
                dateEnd,
                workItemList: workItemList.filter((workItem: StateItem) => {
                    const fieldValue = (workItem as any)[dateField];
                    if (typeof fieldValue === 'string') {
                        throw new Error('This method does not handle string properties, only luxon\'s DateTime objects');
                    }
                    return (
                        (fieldValue instanceof DateTime) &&
                        (fieldValue as DateTime).valueOf() > dateStartValue &&
                        (fieldValue as DateTime).valueOf() <= dateEndValue
                    )
                })
            })
        });
}

export function isAggregationValid(aggregation: any): aggregation is AggregationKey {
    if (!aggregation || typeof aggregation !== 'string') {
        return false;
    }
    return AGGREGATIONS.includes(aggregation as any);
}