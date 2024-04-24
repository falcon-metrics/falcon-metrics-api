import { DateTime } from 'luxon';
import { StateItem } from '../workitem/interfaces';
import { AggregationKey, isDateTimeValid } from './aggregation';
import { getPerspectiveProfile, PerspectiveKey } from './perspectives';

export type ItemFilter = (workItem: StateItem) => boolean;

/**
 * Generates a filter to determines whether a work item was in a particular
 * category during a certain time period. Category is determined by
 * perspective. Length of time period follows aggregation.
 * @perspective User-selected perspective. Corresponds to a specific state category.
 * @referenceDate A reference date to anchor the analysis period.
 * @aggregation Time unit of the analysis period.
 */
export const generateInCategoryFilter = (
    perspective: PerspectiveKey,
    referenceDate: DateTime,
    aggregation: AggregationKey,
): ItemFilter => {
    const isValidDate = isDateTimeValid;

    const { joinDateFieldName, leaveDateFieldName } = getPerspectiveProfile(
        perspective,
    );

    const periodStart = referenceDate.startOf(aggregation);
    const periodEnd = referenceDate.endOf(aggregation);

    const inCategoryFilter = (workItem: StateItem): boolean => {
        const joinedCategoryDate = workItem[joinDateFieldName];

        // Check if Work Item was Assigned to Category Before Reference Date
        const wasAssignedToCategory: boolean =
            isValidDate(joinedCategoryDate) && joinedCategoryDate < periodEnd;

        // Check if Work Item Left Category Before Reference Date
        const leftCategoryDate = leaveDateFieldName
            ? workItem[leaveDateFieldName]
            : undefined;
        const hasLeftCategory: boolean =
            isValidDate(leftCategoryDate) && leftCategoryDate < periodStart;

        return wasAssignedToCategory && !hasLeftCategory;
    };

    return inCategoryFilter;
};

/**
 * Generates a filter to determine whether a work item joined a particular
 * category within a certain time period. Category is determined by
 * perspective. Length of time period follows aggregation.
 * @perspective User-selected perspective. Corresponds to a specific state category.
 * @referenceDate A reference date to anchor the analysis period.
 * @aggregation Time unit of the analysis period.
 */
export const generateJoinedCategoryFilter = (
    perspective: PerspectiveKey,
    referenceDate: DateTime,
    aggregation: AggregationKey,
): ItemFilter => {
    const isValidDate = isDateTimeValid;

    const { joinDateFieldName } = getPerspectiveProfile(perspective);

    const periodStart = referenceDate.startOf(aggregation);
    const periodEnd = referenceDate.endOf(aggregation);

    const joinedCategoryFilter = (workItem: StateItem): boolean => {
        const joinedCategoryDate = workItem[joinDateFieldName];

        // Check if Work Item Joined category within Allotted Time Period
        const joinedCategory: boolean =
            isValidDate(joinedCategoryDate) &&
            joinedCategoryDate >= periodStart &&
            joinedCategoryDate < periodEnd;
        return joinedCategory;
    };

    return joinedCategoryFilter;
};
