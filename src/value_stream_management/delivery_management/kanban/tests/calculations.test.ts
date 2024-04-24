import { ExtendedStateItem } from '../../../../workitem/interfaces';
import { Calculations as KanbanCalculations } from '../calculations';
import { ItemSelectionOptions } from '../handler';

const unassignedItem: ExtendedStateItem = {
    workItemId: '314159',
    isBlocked: false,
    isUnassigned: true,
    isStale: false,
};

const blockedItem: ExtendedStateItem = {
    workItemId: '271828',
    isBlocked: true,
    isUnassigned: false,
    isStale: false,
};

const staleItem: ExtendedStateItem = {
    workItemId: '141421',
    isBlocked: false,
    isUnassigned: false,
    isStale: true,
};

const blockedStaleItem: ExtendedStateItem = {
    workItemId: '173205',
    isBlocked: true,
    isUnassigned: false,
    isStale: true,
};

describe('Item selection options are applied correctly.', () => {
    test('Selection with only false flags returns empty array.', () => {
        const workItems: ExtendedStateItem[] = [
            unassignedItem,
            blockedItem,
            staleItem,
            blockedStaleItem,
        ];

        const allFalseOptions: ItemSelectionOptions = {
            includeBlocked: false,
            includeStale: false,
            includeAboveSle: false,
            includeExpedited: false,
            includeUnassigned: false,
            includeDelayed: false,
            includeDiscardedAfter: false,
            includeDiscardedBefore: false,
        };

        const results: ExtendedStateItem[] = KanbanCalculations.applySelectionOptions(
            workItems,
            allFalseOptions,
            'or',
        );

        expect(results).toEqual([]);
    });

    test('Selection with OR operator works.', () => {
        const workItems: ExtendedStateItem[] = [
            unassignedItem,
            blockedItem,
            staleItem,
            blockedStaleItem,
        ];

        const selectBlockedOrStale: ItemSelectionOptions = {
            includeBlocked: true,
            includeStale: true,
            includeAboveSle: false,
            includeExpedited: false,
            includeUnassigned: false,
            includeDelayed: false,
            includeDiscardedAfter: false,
            includeDiscardedBefore: false,
        };

        const results: ExtendedStateItem[] = KanbanCalculations.applySelectionOptions(
            workItems,
            selectBlockedOrStale,
            'or',
        );

        expect(results).toEqual(expect.arrayContaining([blockedItem]));
        expect(results).toEqual(expect.arrayContaining([staleItem]));
        expect(results).toEqual(expect.arrayContaining([blockedStaleItem]));

        expect(results).not.toEqual(expect.arrayContaining([unassignedItem]));
    });

    test('Selection with AND operator works.', () => {
        const workItems: ExtendedStateItem[] = [
            unassignedItem,
            blockedItem,
            staleItem,
            blockedStaleItem,
        ];

        const selectBlockedAndStale: ItemSelectionOptions = {
            includeBlocked: true,
            includeStale: true,
            includeAboveSle: false,
            includeExpedited: false,
            includeUnassigned: false,
            includeDelayed: false,
            includeDiscardedAfter: false,
            includeDiscardedBefore: false,
        };

        const results: ExtendedStateItem[] = KanbanCalculations.applySelectionOptions(
            workItems,
            selectBlockedAndStale,
            'and',
        );

        expect(results).toEqual(expect.arrayContaining([blockedStaleItem]));

        expect(results).not.toEqual(expect.arrayContaining([blockedItem]));
        expect(results).not.toEqual(expect.arrayContaining([staleItem]));
        expect(results).not.toEqual(expect.arrayContaining([unassignedItem]));
    });

    test('Selection with invalid operator defaults to OR.', () => {
        const workItems: ExtendedStateItem[] = [
            unassignedItem,
            blockedItem,
            staleItem,
            blockedStaleItem,
        ];

        const selectBlockedOrStale: ItemSelectionOptions = {
            includeBlocked: true,
            includeStale: true,
            includeAboveSle: false,
            includeExpedited: false,
            includeUnassigned: false,
            includeDelayed: false,
            includeDiscardedAfter: false,
            includeDiscardedBefore: false,
        };

        const results: ExtendedStateItem[] = KanbanCalculations.applySelectionOptions(
            workItems,
            selectBlockedOrStale,
            'invalidOperator',
        );

        expect(results).toEqual(expect.arrayContaining([blockedItem]));
        expect(results).toEqual(expect.arrayContaining([staleItem]));
        expect(results).toEqual(expect.arrayContaining([blockedStaleItem]));

        expect(results).not.toEqual(expect.arrayContaining([unassignedItem]));
    });

    test('Function works for empty arrays.', () => {
        const selectBlockedOrStale: ItemSelectionOptions = {
            includeBlocked: true,
            includeStale: true,
            includeAboveSle: false,
            includeExpedited: false,
            includeUnassigned: false,
            includeDelayed: false,
            includeDiscardedAfter: false,
            includeDiscardedBefore: false,
        };

        const results: ExtendedStateItem[] = KanbanCalculations.applySelectionOptions(
            [],
            selectBlockedOrStale,
            'invalidOperator',
        );

        expect(results.length).toEqual(0);
    });

    test('Stale flag not applied with AND operator when flag is restricted.', () => {
        const staleItem: ExtendedStateItem = {
            workItemId: '314159',
            isStale: true,
            isBlocked: false,
            isUnassigned: false,
        };
        const blockedItem: ExtendedStateItem = {
            workItemId: '271828',
            isStale: false,
            isBlocked: true,
            isUnassigned: false,
        };
        const staleBlockedItem: ExtendedStateItem = {
            workItemId: '141421',
            isStale: true,
            isBlocked: true,
            isUnassigned: false,
        };
        const noFlagsItem: ExtendedStateItem = {
            workItemId: '141421',
            isStale: false,
            isBlocked: false,
            isUnassigned: false,
        };

        const selectBlockedAndStale: ItemSelectionOptions = {
            includeBlocked: true,
            includeStale: true,
            includeAboveSle: false,
            includeExpedited: false,
            includeUnassigned: false,
            includeDelayed: false,
            includeDiscardedAfter: false,
            includeDiscardedBefore: false,
        };

        const results: ExtendedStateItem[] = KanbanCalculations.applySelectionOptions(
            [staleItem, blockedItem, staleBlockedItem, noFlagsItem],
            selectBlockedAndStale,
            'and',
            ['includeStale'],
        );

        expect(results).not.toEqual(expect.arrayContaining([blockedItem]));
        expect(results).not.toEqual(expect.arrayContaining([staleBlockedItem]));

        expect(results).not.toEqual(expect.arrayContaining([staleItem]));
        expect(results).not.toEqual(expect.arrayContaining([noFlagsItem]));
    });

    test('Stale flag not applied with OR operator when flag is restricted.', () => {
        const staleItem: ExtendedStateItem = {
            workItemId: '314159',
            isStale: true,
            isBlocked: false,
            isUnassigned: false,
        };
        const blockedItem: ExtendedStateItem = {
            workItemId: '271828',
            isStale: false,
            isBlocked: true,
            isUnassigned: false,
        };
        const staleBlockedItem: ExtendedStateItem = {
            workItemId: '141421',
            isStale: true,
            isBlocked: true,
            isUnassigned: false,
        };
        const noFlagsItem: ExtendedStateItem = {
            workItemId: '141421',
            isStale: false,
            isBlocked: false,
            isUnassigned: false,
        };

        const selectBlockedOrStale: ItemSelectionOptions = {
            includeBlocked: true,
            includeStale: true,
            includeAboveSle: false,
            includeExpedited: false,
            includeUnassigned: false,
            includeDelayed: false,
            includeDiscardedAfter: false,
            includeDiscardedBefore: false,
        };

        const results: ExtendedStateItem[] = KanbanCalculations.applySelectionOptions(
            [staleItem, blockedItem, staleBlockedItem, noFlagsItem],
            selectBlockedOrStale,
            'or',
            ['includeStale'],
        );

        expect(results).toEqual(expect.arrayContaining([blockedItem]));
        expect(results).toEqual(expect.arrayContaining([staleBlockedItem]));

        expect(results).not.toEqual(expect.arrayContaining([staleItem]));
        expect(results).not.toEqual(expect.arrayContaining([noFlagsItem]));
    });

    test('Stale flag is applied with AND operator when flag is not restricted.', () => {
        const staleItem: ExtendedStateItem = {
            workItemId: '314159',
            isStale: true,
            isBlocked: false,
            isUnassigned: false,
        };
        const blockedItem: ExtendedStateItem = {
            workItemId: '271828',
            isStale: false,
            isBlocked: true,
            isUnassigned: false,
        };
        const staleBlockedItem: ExtendedStateItem = {
            workItemId: '141421',
            isStale: true,
            isBlocked: true,
            isUnassigned: false,
        };
        const noFlagsItem: ExtendedStateItem = {
            workItemId: '141421',
            isStale: false,
            isBlocked: false,
            isUnassigned: false,
        };

        const selectBlockedAndStale: ItemSelectionOptions = {
            includeBlocked: true,
            includeStale: true,
            includeAboveSle: false,
            includeExpedited: false,
            includeUnassigned: false,
            includeDelayed: false,
            includeDiscardedAfter: false,
            includeDiscardedBefore: false,
        };

        const results: ExtendedStateItem[] = KanbanCalculations.applySelectionOptions(
            [staleItem, blockedItem, staleBlockedItem, noFlagsItem],
            selectBlockedAndStale,
            'and',
        );

        expect(results).toEqual(expect.arrayContaining([staleBlockedItem]));

        expect(results).not.toEqual(expect.arrayContaining([staleItem]));
        expect(results).not.toEqual(expect.arrayContaining([blockedItem]));
        expect(results).not.toEqual(expect.arrayContaining([noFlagsItem]));
    });

    test('Stale flag is applied with OR operator when flag is not restricted.', () => {
        const staleItem: ExtendedStateItem = {
            workItemId: '314159',
            isStale: true,
            isBlocked: false,
            isUnassigned: false,
        };
        const blockedItem: ExtendedStateItem = {
            workItemId: '271828',
            isStale: false,
            isBlocked: true,
            isUnassigned: false,
        };
        const staleBlockedItem: ExtendedStateItem = {
            workItemId: '141421',
            isStale: true,
            isBlocked: true,
            isUnassigned: false,
        };
        const noFlagsItem: ExtendedStateItem = {
            workItemId: '141421',
            isStale: false,
            isBlocked: false,
            isUnassigned: false,
        };

        const selectBlockedOrStale: ItemSelectionOptions = {
            includeBlocked: true,
            includeStale: true,
            includeAboveSle: false,
            includeExpedited: false,
            includeUnassigned: false,
            includeDelayed: false,
            includeDiscardedAfter: false,
            includeDiscardedBefore: false,
        };

        const results: ExtendedStateItem[] = KanbanCalculations.applySelectionOptions(
            [staleItem, blockedItem, staleBlockedItem, noFlagsItem],
            selectBlockedOrStale,
            'or',
        );

        expect(results).toEqual(expect.arrayContaining([staleItem]));
        expect(results).toEqual(expect.arrayContaining([blockedItem]));
        expect(results).toEqual(expect.arrayContaining([staleBlockedItem]));

        expect(results).not.toEqual(expect.arrayContaining([noFlagsItem]));
    });
});

describe('Work items are grouped correctly.', () => {
    test('Items are grouped according to state category when delayed item option set to WIP.', () => {
        const proposedItem: ExtendedStateItem = {
            workItemId: '271828',
            stateCategory: 'proposed',
            commitmentDate: undefined,
            departureDate: undefined,
        };
        const inProgressItem: ExtendedStateItem = {
            workItemId: '141421',
            stateCategory: 'inprogress',
        };
        const completedItem: ExtendedStateItem = {
            workItemId: '314159',
            stateCategory: 'completed',
        };
        const delayedItem: ExtendedStateItem = {
            workItemId: '173205',
            stateCategory: 'inprogress',
            isDelayed: true,
        };

        const workItems: ExtendedStateItem[] = [
            proposedItem,
            inProgressItem,
            completedItem,
            delayedItem,
        ];

        const {
            proposedItems: proposedResult,
            inProgressItems: inProgressResult,
            completedItems: completedResults,
        } = KanbanCalculations.groupItemsByCategory(workItems, 'wip');

        expect(proposedResult).toEqual(expect.arrayContaining([proposedItem]));
        expect(inProgressResult).toEqual(
            expect.arrayContaining([inProgressItem, delayedItem]),
        );
        expect(completedResults).toEqual(
            expect.arrayContaining([completedItem]),
        );

        expect(proposedResult).not.toEqual(
            expect.arrayContaining([delayedItem]),
        );
    });
    test('Items are grouped according to state category when delayed item option set to Inventory.', () => {
        const proposedItem: ExtendedStateItem = {
            workItemId: '271828',
            stateCategory: 'proposed',
            commitmentDate: undefined,
            departureDate: undefined,
        };
        const inProgressItem: ExtendedStateItem = {
            workItemId: '141421',
            stateCategory: 'inprogress',
        };
        const completedItem: ExtendedStateItem = {
            workItemId: '314159',
            stateCategory: 'completed',
        };
        const delayedItem: ExtendedStateItem = {
            workItemId: '173205',
            stateCategory: 'inprogress',
            isDelayed: true,
        };

        const workItems: ExtendedStateItem[] = [
            proposedItem,
            inProgressItem,
            completedItem,
            delayedItem,
        ];

        const {
            proposedItems: proposedResult,
            inProgressItems: inProgressResult,
            completedItems: completedResults,
        } = KanbanCalculations.groupItemsByCategory(workItems, 'inventory');

        expect(proposedResult).toEqual(
            expect.arrayContaining([proposedItem, delayedItem]),
        );
        expect(inProgressResult).toEqual(
            expect.arrayContaining([inProgressItem]),
        );
        expect(completedResults).toEqual(
            expect.arrayContaining([completedItem]),
        );

        expect(inProgressResult).not.toEqual(
            expect.arrayContaining([delayedItem]),
        );
    });
});
