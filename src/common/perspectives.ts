import { StateCategory } from '../workitem/state_aurora';
import { NumberKey } from '../workitem/WorkItemList';

// Visualization Options for User
export const PERSPECTIVES = ['past', 'present', 'future'] as const;
export type PerspectiveKey = typeof PERSPECTIVES[number];

// State Item DateTime Fields
export const DATE_FIELDS = [
    'departureDateTime',
    'commitmentDateTime',
    'arrivalDateTime',
] as const;
export type DateFieldKey = typeof DATE_FIELDS[number];

export interface PerspectiveProfile {
    ageField: NumberKey;
    joinDateFieldName: DateFieldKey;
    leaveDateFieldName?: DateFieldKey;
    stateCategory: StateCategory;
    historicalAnalysisCategories: StateCategory[];
}

export const isValidPerspective = (
    perspective: unknown,
): perspective is PerspectiveKey => {
    // Check for Non-Null String
    const isString = perspective
        ? typeof perspective === 'string' || perspective instanceof String
        : false;

    // Check for Valid Value
    const isPerspective = isString
        ? PERSPECTIVES.includes(perspective as PerspectiveKey)
        : false;

    return isPerspective;
};

export const getPerspectiveProfile = (
    perspective: PerspectiveKey,
): PerspectiveProfile => {
    switch (perspective) {
        case 'past':
            return {
                ageField: 'leadTimeInWholeDays',
                joinDateFieldName: 'departureDateTime',
                stateCategory: StateCategory.COMPLETED,
                historicalAnalysisCategories: [StateCategory.COMPLETED],
            };
        case 'present':
            return {
                ageField: 'wipAgeInWholeDays',
                joinDateFieldName: 'commitmentDateTime',
                leaveDateFieldName: 'departureDateTime',
                stateCategory: StateCategory.INPROGRESS,
                historicalAnalysisCategories: [
                    StateCategory.INPROGRESS,
                    StateCategory.COMPLETED,
                ],
            };
        case 'future':
            return {
                ageField: 'inventoryAgeInWholeDays',
                joinDateFieldName: 'arrivalDateTime',
                leaveDateFieldName: 'commitmentDateTime',
                stateCategory: StateCategory.PROPOSED,
                historicalAnalysisCategories: [
                    StateCategory.PROPOSED,
                    StateCategory.INPROGRESS,
                    StateCategory.COMPLETED,
                ],
            };
        default:
            console.log('Warning: Invalid perspective provided!');
            return {
                ageField: 'wipAgeInWholeDays',
                joinDateFieldName: 'commitmentDateTime',
                leaveDateFieldName: 'departureDateTime',
                stateCategory: StateCategory.INPROGRESS,
                historicalAnalysisCategories: [
                    StateCategory.INPROGRESS,
                    StateCategory.COMPLETED,
                ],
            };
    }
};
