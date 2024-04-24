import { DateTime } from 'luxon';
import { StateItem } from '../../workitem/interfaces';
import {
    generateInCategoryFilter,
    generateJoinedCategoryFilter,
    ItemFilter,
} from '../dateAnalysis';

describe('Joined-category filter determines which items joined a category during a certain time period.', () => {
    describe('Joined-category filter respects perspective when removing work items outside time window.', () => {
        test('Items are correctly filtered by departure date in past perspective.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                departureDateTime: DateTime.fromISO(
                    '2021-04-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis week
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                departureDateTime: DateTime.fromISO(
                    '2021-09-27T10:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                departureDateTime: DateTime.fromISO(
                    '2021-09-30T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                departureDateTime: DateTime.fromISO(
                    '2021-10-03T23:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                departureDateTime: DateTime.fromISO(
                    '2022-10-04T01:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const joinedCategoryFilter: ItemFilter = generateJoinedCategoryFilter(
                'past',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                joinedCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([earlyWorkItem]),
            );
            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });

        test('Items are correctly filtered by commitment date in present perspective.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-04-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis week
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-27T10:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-30T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2021-10-03T23:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-10-04T01:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const joinedCategoryFilter: ItemFilter = generateJoinedCategoryFilter(
                'present',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                joinedCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([earlyWorkItem]),
            );
            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });

        test('Items are correctly filtered by arrival date in future perspective.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                arrivalDateTime: DateTime.fromISO(
                    '2021-04-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis week
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                arrivalDateTime: DateTime.fromISO(
                    '2021-09-27T10:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                arrivalDateTime: DateTime.fromISO(
                    '2021-09-30T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                arrivalDateTime: DateTime.fromISO(
                    '2021-10-03T23:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                arrivalDateTime: DateTime.fromISO(
                    '2022-10-04T01:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const joinedCategoryFilter: ItemFilter = generateJoinedCategoryFilter(
                'future',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                joinedCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([earlyWorkItem]),
            );
            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });
    });

    describe('Joined-category filter respects aggregation when removing work items outside time window.', () => {
        test('Items are correctly filtered for the day aggregation.', () => {
            const referenceDate = DateTime.fromISO(
                '2022-03-24T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis day
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-23T23:30:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis day
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-24T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-24T15:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-24T23:59:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis day
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-25T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const joinedCategoryFilter: ItemFilter = generateJoinedCategoryFilter(
                'present',
                referenceDate,
                'day',
            );
            const filteredItems: StateItem[] = workItems.filter(
                joinedCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([earlyWorkItem]),
            );
            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });

        test('Items are correctly filtered for the week aggregation.', () => {
            const referenceDate = DateTime.fromISO(
                '2022-03-24T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-20T23:30:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis week
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-21T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-24T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-27T23:59:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-28T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const joinedCategoryFilter: ItemFilter = generateJoinedCategoryFilter(
                'present',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                joinedCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([earlyWorkItem]),
            );
            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });

        test('Items are correctly filtered for the month aggregation.', () => {
            const referenceDate = DateTime.fromISO(
                '2022-03-24T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis month
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2022-02-28T23:30:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis month
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-01T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-15T12:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-31T23:59:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis month
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-04-01T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const joinedCategoryFilter: ItemFilter = generateJoinedCategoryFilter(
                'present',
                referenceDate,
                'month',
            );
            const filteredItems: StateItem[] = workItems.filter(
                joinedCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([earlyWorkItem]),
            );
            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });

        test('Items are correctly filtered for the quarter aggregation.', () => {
            const referenceDate = DateTime.fromISO(
                '2022-03-24T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis quarter
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-12-31T23:30:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis quarter
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2022-01-01T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-02-15T12:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-31T23:59:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis quarter
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-04-01T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const joinedCategoryFilter: ItemFilter = generateJoinedCategoryFilter(
                'present',
                referenceDate,
                'quarter',
            );
            const filteredItems: StateItem[] = workItems.filter(
                joinedCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([earlyWorkItem]),
            );
            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });

        test('Items are correctly filtered for the year aggregation.', () => {
            const referenceDate = DateTime.fromISO(
                '2022-03-24T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis year
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-12-31T23:30:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis year
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2022-01-01T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-06-15T12:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2022-12-31T23:59:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis year
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2023-01-01T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const joinedCategoryFilter: ItemFilter = generateJoinedCategoryFilter(
                'present',
                referenceDate,
                'year',
            );
            const filteredItems: StateItem[] = workItems.filter(
                joinedCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([earlyWorkItem]),
            );
            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });
    });

    describe('Joined-category filter handles different time zones correctly.', () => {
        test('Filters correctly when all dates are in UTC.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-04-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis week
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-27T10:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-30T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2021-10-03T23:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-10-04T01:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const joinedCategoryFilter: ItemFilter = generateJoinedCategoryFilter(
                'present',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                joinedCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([earlyWorkItem]),
            );
            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });

        test('Filters correctly when all dates are in Melbourne time.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+10',
                {
                    zone: 'Australia/Melbourne',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-04-20T00:00:00.000+10',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };

            // Items during analysis week
            // Future maintainers: note the time zone transition due to daylight savings time
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-27T10:00:00.000+10',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-30T00:00:00.000+10',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2021-10-03T23:00:00.000+11',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-10-04T01:00:00.000+11',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const joinedCategoryFilter: ItemFilter = generateJoinedCategoryFilter(
                'present',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                joinedCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([earlyWorkItem]),
            );
            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });

        test('Filters correctly when reference date is in UTC, but work items dates are in Melbourne time.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-04-20T10:00:00.000+10:00',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };

            // Items during analysis week
            // Future maintainers: note the time zone transition due to daylight savings time
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-27T20:00:00.000+10:00',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-30T10:00:00.000+10:00',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2021-10-04T10:00:00.000+11:00',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-10-04T12:00:00.000+11:00',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const joinedCategoryFilter: ItemFilter = generateJoinedCategoryFilter(
                'present',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                joinedCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([earlyWorkItem]),
            );
            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });

        test('Filters correctly when reference date is in Melbourne time, but work items dates are in UTC.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+10:00',
                {
                    zone: 'Australia/Melbourne',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-04-19T14:00:00.000Z',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis week
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-27T00:00:00.000Z',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-29T14:00:00.000Z',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2021-10-03T12:50:00.000Z',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-10-03T15:00:00.000Z',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const joinedCategoryFilter: ItemFilter = generateJoinedCategoryFilter(
                'present',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                joinedCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([earlyWorkItem]),
            );
            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });
    });
});

// ------------------------------------------------------------------------------------------------

describe('In-category filter determines which items were in a category during a certain time period.', () => {
    describe('In-category filter respects perspective when removing items beyond time window.', () => {
        test('Items are correctly filtered by departure date in past perspective.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                departureDateTime: DateTime.fromISO(
                    '2021-04-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis week
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                departureDateTime: DateTime.fromISO(
                    '2021-09-27T10:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                departureDateTime: DateTime.fromISO(
                    '2021-09-30T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                departureDateTime: DateTime.fromISO(
                    '2021-10-03T23:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                departureDateTime: DateTime.fromISO(
                    '2022-10-04T01:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const inCategoryFilter: ItemFilter = generateInCategoryFilter(
                'past',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                inCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    earlyWorkItem,
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });

        test('Items are correctly filtered by commitment and departure dates in present perspective.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-04-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis week
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-27T10:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-30T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2021-10-03T23:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-10-04T01:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items Leaving the WIP Category
            const earlyDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-25T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2021-09-26T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-28T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2021-09-29T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const lateDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-28T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2021-10-25T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
                earlyDepartureItem,
                midDepartureItem,
                lateDepartureItem,
            ];

            const inCategoryFilter: ItemFilter = generateInCategoryFilter(
                'present',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                inCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    earlyWorkItem,
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                    midDepartureItem,
                    lateDepartureItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem, earlyDepartureItem]),
            );
        });

        test('Items are correctly filtered by arrival and commitment dates in future perspective.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                arrivalDateTime: DateTime.fromISO(
                    '2021-04-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis week
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                arrivalDateTime: DateTime.fromISO(
                    '2021-09-27T10:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                arrivalDateTime: DateTime.fromISO(
                    '2021-09-30T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                arrivalDateTime: DateTime.fromISO(
                    '2021-10-03T23:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                arrivalDateTime: DateTime.fromISO(
                    '2022-10-04T01:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items Leaving the Proposed Category
            const earlyCommitmentItem: StateItem = {
                workItemId: 'FAL-307',
                arrivalDateTime: DateTime.fromISO(
                    '2021-09-25T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-26T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midCommitmentItem: StateItem = {
                workItemId: 'FAL-307',
                arrivalDateTime: DateTime.fromISO(
                    '2021-09-28T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-29T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const lateCommitmentItem: StateItem = {
                workItemId: 'FAL-307',
                arrivalDateTime: DateTime.fromISO(
                    '2021-09-28T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                commitmentDateTime: DateTime.fromISO(
                    '2021-10-25T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
                earlyCommitmentItem,
                midCommitmentItem,
                lateCommitmentItem,
            ];

            const inCategoryFilter: ItemFilter = generateInCategoryFilter(
                'future',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                inCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    earlyWorkItem,
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                    midCommitmentItem,
                    lateCommitmentItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem, earlyCommitmentItem]),
            );
        });
    });
    describe('In-category filter respects aggregation when removing items beyond time window.', () => {
        test('Items are correctly filtered for the day aggregation.', () => {
            const referenceDate = DateTime.fromISO(
                '2022-03-24T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis day
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-23T23:30:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis day
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-24T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-24T15:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-24T23:59:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis day
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-25T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items Leaving the WIP Category
            const earlyDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-23T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2022-03-23T01:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-24T01:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2022-03-24T02:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const lateDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-24T01:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2022-04-25T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
                earlyDepartureItem,
                midDepartureItem,
                lateDepartureItem,
            ];

            const inCategoryFilter: ItemFilter = generateInCategoryFilter(
                'present',
                referenceDate,
                'day',
            );
            const filteredItems: StateItem[] = workItems.filter(
                inCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    earlyWorkItem,
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                    midDepartureItem,
                    lateDepartureItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem, earlyDepartureItem]),
            );
        });

        test('Items are correctly filtered for the week aggregation.', () => {
            const referenceDate = DateTime.fromISO(
                '2022-03-24T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-20T23:30:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis week
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-21T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-24T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-27T23:59:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-28T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items Leaving the WIP Category
            const earlyDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-21T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2022-03-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-25T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2022-03-26T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const lateDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-25T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2022-04-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
                earlyDepartureItem,
                midDepartureItem,
                lateDepartureItem,
            ];

            const inCategoryFilter: ItemFilter = generateInCategoryFilter(
                'present',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                inCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    earlyWorkItem,
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                    midDepartureItem,
                    lateDepartureItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem, earlyDepartureItem]),
            );
        });

        test('Items are correctly filtered for the month aggregation.', () => {
            const referenceDate = DateTime.fromISO(
                '2022-03-24T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis month
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2022-02-28T23:30:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis month
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-01T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-15T12:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-31T23:59:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis month
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-04-01T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items Leaving the WIP Category
            const earlyDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-02-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2022-02-25T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-10T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2022-03-15T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const lateDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-10T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2022-04-10T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
                earlyDepartureItem,
                midDepartureItem,
                lateDepartureItem,
            ];

            const inCategoryFilter: ItemFilter = generateInCategoryFilter(
                'present',
                referenceDate,
                'month',
            );
            const filteredItems: StateItem[] = workItems.filter(
                inCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    earlyWorkItem,
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                    midDepartureItem,
                    lateDepartureItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem, earlyDepartureItem]),
            );
        });

        test('Items are correctly filtered for the quarter aggregation.', () => {
            const referenceDate = DateTime.fromISO(
                '2022-03-24T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis quarter
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-12-31T23:30:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis quarter
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2022-01-01T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-02-15T12:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-31T23:59:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis quarter
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-04-01T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items Leaving the WIP Category
            const earlyDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-12-25T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2021-12-26T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-02-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2022-02-21T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const lateDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-03-15T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2022-10-25T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
                earlyDepartureItem,
                midDepartureItem,
                lateDepartureItem,
            ];

            const inCategoryFilter: ItemFilter = generateInCategoryFilter(
                'present',
                referenceDate,
                'quarter',
            );
            const filteredItems: StateItem[] = workItems.filter(
                inCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    earlyWorkItem,
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                    midDepartureItem,
                    lateDepartureItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem, earlyDepartureItem]),
            );
        });

        test('Items are correctly filtered for the year aggregation.', () => {
            const referenceDate = DateTime.fromISO(
                '2022-03-24T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis year
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-12-31T23:30:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis year
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2022-01-01T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-06-15T12:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2022-12-31T23:59:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis year
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2023-01-01T00:01:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items Leaving the WIP Category
            const earlyDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-25T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2021-09-26T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-02-28T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2022-03-15T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const lateDepartureItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2022-06-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
                departureDateTime: DateTime.fromISO(
                    '2023-01-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
                earlyDepartureItem,
                midDepartureItem,
                lateDepartureItem,
            ];

            const inCategoryFilter: ItemFilter = generateInCategoryFilter(
                'present',
                referenceDate,
                'year',
            );
            const filteredItems: StateItem[] = workItems.filter(
                inCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    earlyWorkItem,
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                    midDepartureItem,
                    lateDepartureItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem, earlyDepartureItem]),
            );
        });
    });

    describe('In-category filter handles different time zones correctly.', () => {
        test('Filters correctly when all dates are in UTC.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-04-20T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis week
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-27T10:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-30T00:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2021-10-03T23:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-10-04T01:00:00.000+00',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const inCategoryFilter: ItemFilter = generateInCategoryFilter(
                'present',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                inCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    earlyWorkItem,
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });

        test('Filters correctly when all dates are in Melbourne time.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+10',
                {
                    zone: 'Australia/Melbourne',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-04-20T00:00:00.000+10',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };

            // Items during analysis week
            // Future maintainers: note the time zone transition due to daylight savings time
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-27T10:00:00.000+10',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-30T00:00:00.000+10',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2021-10-03T23:00:00.000+11',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-10-04T01:00:00.000+11',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const inCategoryFilter: ItemFilter = generateInCategoryFilter(
                'present',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                inCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    earlyWorkItem,
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });

        test('Filters correctly when reference date is in UTC, but work item dates are in Melbourne time.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+00',
                {
                    zone: 'utc',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-04-20T10:00:00.000+10:00',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };

            // Items during analysis week
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-27T20:00:00.000+10:00',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-30T10:00:00.000+10:00',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2021-10-04T10:00:00.000+11:00',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-10-04T12:00:00.000+11:00',
                    {
                        zone: 'Australia/Melbourne',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const inCategoryFilter: ItemFilter = generateInCategoryFilter(
                'present',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                inCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    earlyWorkItem,
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });

        test('Filters correctly when reference date is in Melbourne time, but work item dates are in UTC.', () => {
            const referenceDate = DateTime.fromISO(
                '2021-09-27T00:00:00.000+10',
                {
                    zone: 'Australia/Melbourne',
                },
            );

            // Items before analysis week
            const earlyWorkItem: StateItem = {
                workItemId: 'FAL-101',
                commitmentDateTime: DateTime.fromISO(
                    '2021-04-19T14:00:00.000Z',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Items during analysis week
            const initialWorkItem: StateItem = {
                workItemId: 'FAL-211',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-27T00:00:00.000Z',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const midWorkItem: StateItem = {
                workItemId: 'FAL-307',
                commitmentDateTime: DateTime.fromISO(
                    '2021-09-29T14:00:00.000Z',
                    {
                        zone: 'utc',
                    },
                ),
            };
            const finalWorkItem: StateItem = {
                workItemId: 'FAL-401',
                commitmentDateTime: DateTime.fromISO(
                    '2021-10-03T12:00:00.000Z',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // After analysis week
            const lateWorkItem: StateItem = {
                workItemId: 'FAL-503',
                commitmentDateTime: DateTime.fromISO(
                    '2022-10-03T14:00:00.000Z',
                    {
                        zone: 'utc',
                    },
                ),
            };

            // Filtering
            const workItems: StateItem[] = [
                earlyWorkItem,
                initialWorkItem,
                midWorkItem,
                finalWorkItem,
                lateWorkItem,
            ];

            const inCategoryFilter: ItemFilter = generateInCategoryFilter(
                'present',
                referenceDate,
                'week',
            );
            const filteredItems: StateItem[] = workItems.filter(
                inCategoryFilter,
            );

            expect(filteredItems).toEqual(
                expect.arrayContaining([
                    earlyWorkItem,
                    initialWorkItem,
                    midWorkItem,
                    finalWorkItem,
                ]),
            );

            expect(filteredItems).not.toEqual(
                expect.arrayContaining([lateWorkItem]),
            );
        });
    });
});
