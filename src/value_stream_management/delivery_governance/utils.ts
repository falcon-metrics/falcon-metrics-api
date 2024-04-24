import { countBy } from 'lodash';
import { DateTime, Interval } from 'luxon';
import { AggregationKey, generateDateArray } from '../../common/aggregation';
export type DemandDistributionWorkItem = {
    workItemId: string;
    /**
     * For upcoming work, dateTime is arrival date
     * 
     * For work in process, dateTime is commitment date
     */
    dateTime: DateTime;
    /**
     * // TODO: Change comment, refer the variable
     * For upcoming work, dateTimeToExclude is commitment date
     * 
     * For work in process, dateTimeToExclude is departure date
     */
    dateTimeToExclude?: DateTime;
    normalizedDisplayName: string;
};

export const groupWorkItemListByAggregation = (
    workItemList: DemandDistributionWorkItem[],
    aggregation: AggregationKey,
    isBecameScenario: boolean,
    interval?: Interval,
    includeWorkItemsInResult: boolean = false,
): {
    dateStart: string;
    dateEnd: string;
    values: {
        [normalizedDisplayName: string]: number;
    };
    workItems?: DemandDistributionWorkItem[],
}[] => {
    if (!interval) {
        throw new Error('Missing or invalid interval');
    }
    const workItemDateBucketList = generateDateArray(
        interval,
        aggregation as any,
    )
        .map((dateTime) => ({
            dateStart: dateTime,
            dateEnd: dateTime.endOf(aggregation),
        }))
        .map(({ dateStart, dateEnd }) => ({
            dateStart,
            dateEnd,
            workItemList: workItemList.filter((workItem) => {
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

    return workItemDateBucketList.map(
        ({ dateStart, dateEnd, workItemList }) => ({
            dateStart: dateStart.toISO(),
            dateEnd: dateEnd.toISO(),
            weekNumber: dateStart.weekNumber,
            values: countBy(workItemList, 'normalizedDisplayName') as {
                [normalizedDisplayName: string]: number;
            },
            workItems: includeWorkItemsInResult ? workItemList : undefined
        }),
    );
};
