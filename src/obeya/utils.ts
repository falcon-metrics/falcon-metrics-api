import { DateTime } from 'luxon';
import { ExtendedStateItem } from '../workitem/interfaces';
// comment this line when doing tests
import { WorkItemListService } from '../workitem/WorkItemList';

export const calculateLeadTime = (
    departureDateTime: any,
    commitmentDateTime: any,
): number => {
    const departureDate = DateTime.fromISO(departureDateTime).startOf('day');
    const commitmentDate = DateTime.fromISO(commitmentDateTime).startOf('day');
    const leadTimeInWholeDays =
        departureDate.diff(commitmentDate, 'days').days + 1;

    return leadTimeInWholeDays || 0;
};

export const getChildItems = (
    workItemList: any,
    workItemId: string | undefined,
) => {
    const { completed = [], proposed = [], inProgress = [] } = workItemList;
    const flattenedChildren = [...completed, ...proposed, ...inProgress];
    return (
        flattenedChildren.filter((item) => item.parentId === workItemId) || []
    );
};

export const getDependenciesItems = (
    workItemList: any,
    workItemId: string | undefined,
    dependencies: any,
) => {
    const { completed = [], proposed = [], inProgress = [] } = workItemList;
    const flattenedChildren = [...completed, ...proposed, ...inProgress];

    const toItems = JSON.parse(JSON.stringify(dependencies))
        .filter((dependency: any) => dependency.from === workItemId)
        .map((dependency: any) => dependency.to);

    return flattenedChildren
        .filter(
            (item: any) =>
                toItems.includes(item.workItemId) ||
                item.workItemId === item.parentId,
        )
        .map((item: any) => ({
            targetStart: item.targetStartDateTime,
            targetEnd: item.targetEndDateTime,
        }));
};

export const calculateRoadmapStartEndDateTime = async (
    item: ExtendedStateItem,
    workItemList: any,
    classOfServiceCustomField: string | undefined = undefined,
): Promise<{
    targetStart?: DateTime;
    targetEnd?: DateTime;
}> => {
    // console.log('🌺 ~ file: utils.ts:61 ~ item', item);
    // comment this when running tests
    const leadTimeDistributions = await WorkItemListService.getLeadTimeDistributions(
        workItemList.completed,
        classOfServiceCustomField,
    );

    // uncomment this when running tests
    // const selectedLeadTimeDistribution = { 
    //     percentile85: 1
    // }
    // const leadTimeDistributionDays = selectedLeadTimeDistribution.percentile85

    const children = getChildItems(workItemList, item.workItemId);

    const key = `${item.flomatikaWorkItemTypeId}-|-|-|${item.customFields?.find((f) => f.name === classOfServiceCustomField)
            ?.value
        }`;

    const selectedLeadTimeDistribution = leadTimeDistributions[key];

    // If there is no 85th %ile, fallback to SLE 
    const percentile85OrSLE = selectedLeadTimeDistribution
        ? selectedLeadTimeDistribution.percentile85
        : item.flomatikaWorkItemTypeServiceLevelExpectationInDays;

    const hasDependencies = checkDependencies(
        item.dependencies,
        item.workItemId,
    );
    /* case: with commitmentDate and departureDate
     then:
        targetStart = commitmentDate
        targetEnd = departureDate
    */
    if (item.commitmentDateTime?.toISO() && item.departureDateTime?.toISO()) {
        return {
            targetStart: item.commitmentDateTime,
            targetEnd: item.departureDateTime,
        };
    }

    /* case: with commitmentDate, without departureDate, without children & dependencies
     then:
        targetStart = commitmentDate
        targetEnd = targetStart + 1 + 85th %ile lead time distribution 
        if 85th %ile is undefined, use SLE days
    */
    if (
        item.commitmentDateTime?.toISO() &&
        !item.departureDateTime?.toISO() &&
        children.length === 0 &&
        !hasDependencies
    ) {
        const targetStart = item.commitmentDateTime;

        return {
            targetStart,
            targetEnd: item.targetEndDateTime?.toISO()
                ? item.targetEndDateTime
                : targetStart.plus({
                    days: percentile85OrSLE,
                }),
        };
    }

    /* case : with commitmentDate, without departureDate, with children, without dependencies
     then:
        targetStart = commitmentDate
        targetEnd = max. end date of direct children
    */
    if (
        item.commitmentDateTime?.toISO() &&
        !item.departureDateTime?.toISO() &&
        children.length > 0 &&
        !hasDependencies
    ) {
        const childResults = await Promise.all(
            children.map((child) =>
                calculateRoadmapStartEndDateTime(
                    child,
                    workItemList,
                    classOfServiceCustomField,
                ),
            ),
        );

        const maxEndDateOfChildren = getMaxEndDate(childResults);

        const targetEnd = item.targetEndDateTime?.toISO()
            ? item.targetEndDateTime
            : maxEndDateOfChildren;

        // console.log(
        //     'case 6: ',
        //     item.workItemId,
        //     item.commitmentDateTime.toISO(),
        //     targetEnd.toISO(),
        // );

        return {
            targetStart: item.commitmentDateTime,
            targetEnd,
        };
    }

    // fallback
    return {
        targetStart: item.targetStartDateTime?.toISO()
            ? item.targetStartDateTime
            : undefined,
        targetEnd: item.targetEndDateTime?.toISO()
            ? item.targetEndDateTime
            : undefined,
    };

    /* 
       Commented code below calculates the targetStart if there's no commitmentDate
       Currently, we are disregarding any cases without commitmentDate and do nothing
    */

    /* case: without commitmentDate and departureDate, without children & dependencies
     then:
        targetStart = today + 1
        targetEnd = targetStart + 1 + 85th %ile lead time distribution  
        if 85th %ile is undefined, use SLE days
     */
    // if (
    //     !item.commitmentDateTime?.toISO() &&
    //     !item.departureDateTime?.toISO() &&
    //     children.length === 0 &&
    //     !hasDependencies
    // ) {
    //     const targetStart = item.targetStartDateTime?.toISO()
    //         ? item.targetStartDateTime
    //         : DateTime.now().plus({ day: 1 });

    //     const targetEnd = item.targetEndDateTime?.toISO()
    //         ? item.targetEndDateTime
    //         : targetStart.plus({
    //               day: 1 + leadTimeDistributionDays,
    //           });

    //     return {
    //         targetStart,
    //         targetEnd,
    //     };
    // }

    /* case: without commitmentDate and departureDate, without children, with dependencies
     then:
        targetStart = max. end date of dependency + 1
        targetEnd = targetStart + 1 + 85th %ile lead time distribution  
        if 85th %ile is undefined, use SLE days
     */
    // if (
    //     !item.commitmentDateTime?.toISO() &&
    //     !item.departureDateTime?.toISO() &&
    //     children.length === 0 &&
    //     hasDependencies
    // ) {
    //     let toItemsWithDates: any;

    //     if (item.dependencies) {
    //         toItemsWithDates = getDependenciesItems(
    //             workItemList,
    //             item.workItemId,
    //             item.dependencies,
    //         );
    //     }

    //     const maxEndDateOfDependencies = getMaxEndDate(toItemsWithDates);

    //     const targetStart = item.targetStartDateTime?.toISO()
    //         ? item.targetStartDateTime
    //         : maxEndDateOfDependencies.plus({ day: 1 });

    //     const targetEnd = item.targetEndDateTime?.toISO()
    //         ? item.targetEndDateTime
    //         : targetStart.plus({
    //               day: 1 + leadTimeDistributionDays,
    //           });

    //     // console.log(
    //     //     'case 4: ',
    //     //     item.workItemId,
    //     //     targetStart.toISO(),
    //     //     targetEnd.toISO(),
    //     // );

    //     return {
    //         targetStart,
    //         targetEnd,
    //     };
    // }

    /* case: without commitmentDate and departureDate, with children, without dependencies
    then:
        targetStart = min. start date of direct children
        targetEnd = max. end date of direct children
    */
    // if (
    //     !item.commitmentDateTime?.toISO() &&
    //     !item.departureDateTime?.toISO() &&
    //     children.length > 0 &&
    //     !hasDependencies
    // ) {
    //     const childResults = await Promise.all(
    //         children.map((child) =>
    //             calculateRoadmapStartEndDateTime(
    //                 child,
    //                 workItemList,
    //                 classOfServiceCustomField,
    //             ),
    //         ),
    //     );

    //     const minStartDateOfChildren = getMinStartDate(childResults);
    //     const maxEndDateOfChildren = getMaxEndDate(childResults);

    //     const targetStart = item.targetStartDateTime?.toISO()
    //         ? minStartDateOfChildren < item.targetStartDateTime
    //             ? minStartDateOfChildren
    //             : item.targetStartDateTime
    //         : item.targetStartDateTime;

    //     const targetEnd = item.targetEndDateTime?.toISO()
    //         ? maxEndDateOfChildren > item.targetEndDateTime
    //             ? maxEndDateOfChildren
    //             : item.targetEndDateTime
    //         : item.targetEndDateTime;


    //     return {
    //         targetStart,
    //         targetEnd,
    //     };
    // }

    /* case: without commitmentDate and departureDate, with children, with dependencies
    then:
        targetStart = end date of dependency + 1
        targetEnd = max. end date of direct children
    */
    // if (
    //     !item.commitmentDateTime?.toISO() &&
    //     !item.departureDateTime?.toISO() &&
    //     children.length > 0 &&
    //     hasDependencies
    // ) {
    //     const childResults = await Promise.all(
    //         children.map((child) =>
    //             calculateRoadmapStartEndDateTime(
    //                 child,
    //                 workItemList,
    //                 classOfServiceCustomField,
    //             ),
    //         ),
    //     );

    //     let toItemsWithDates: any;

    //     if (item.dependencies) {
    //         toItemsWithDates = getDependenciesItems(
    //             workItemList,
    //             item.workItemId,
    //             item.dependencies,
    //         );
    //     }

    //     const maxEndDateOfDependencies = getMaxEndDate(toItemsWithDates);
    //     const maxEndDateOfChildren = getMaxEndDate(childResults);

    //     const targetStart = item.targetStartDateTime?.toISO()
    //         ? item.targetStartDateTime
    //         : maxEndDateOfDependencies.plus({ day: 1 });

    //     const targetEnd = item.targetEndDateTime?.toISO()
    //         ? item.targetEndDateTime
    //         : maxEndDateOfChildren;

    //     // console.log(
    //     //     'case 8: ',
    //     //     item.workItemId,
    //     //     targetStart.toISO(),
    //     //     targetEnd.toISO(),
    //     // );

    //     return {
    //         targetStart,
    //         targetEnd,
    //     };
    // }
};

// Get the maximum end date of child items
const getMaxEndDate = (
    items: {
        targetStart?: DateTime;
        targetEnd?: DateTime;
    }[],
): DateTime => {
    let maxEndDate = DateTime.fromMillis(0);

    for (const item of items) {
        if (item.targetEnd && item.targetEnd > maxEndDate) {
            maxEndDate = item.targetEnd;
        }
    }

    return maxEndDate;
};

// Get the minimum start date of child items
const getMinStartDate = (
    items: {
        targetStart?: DateTime;
        targetEnd?: DateTime;
    }[],
): DateTime => {
    let minStartDate = DateTime.now().plus({ day: 1 });

    for (const item of items) {
        if (item.targetStart && item.targetStart < minStartDate) {
            minStartDate = item.targetStart;
        }
    }

    return minStartDate;
};

const checkDependencies = (
    dependencies: any,
    workItemId: string | undefined,
) => {
    if (!dependencies) return false;
    return dependencies.some(
        (dependency: any) => dependency.from === workItemId,
    )
        ? true
        : false;
};
