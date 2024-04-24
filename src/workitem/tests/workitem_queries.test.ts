import { DateTime, Interval } from 'luxon';
import { DateAnalysisOptions, IQueryFilters } from '../../common/filters_v2';
import { TIMEZONE_UTC } from '../../utils/date_utils';
import { StateCategory } from '../state_aurora';
import { InternalDateField, WorkItemQueries } from '../workitem_queries';

describe('ExtendedStateItem query builder works as expected.', () => {
    test('Missing or empty parameters are handled correctly.', () => {
        const result = WorkItemQueries.buildRetrievalQuery(
            { orgId: 'foo', predicates: [], blockersSelectionClause: undefined, expediteSelectionClause: undefined, contextIdList: [], timezone: TIMEZONE_UTC, dateStart: undefined },
        );

        // Zero predicates means no WHERE statement towards end of query
        expect(result).not.toEqual(expect.stringContaining('WHERE'));

        // isBlocked and isExpedite are always retrieved, even if as null values
        expect(result).toEqual(expect.stringContaining('NULL AS "isBlocked"'));
        expect(result).toEqual(
            expect.stringContaining('NULL AS "isExpedited"'),
        );
    });

    test('A valid timezone is handled correctly', () => {
        const ausTz = 'Australia/Sydney';
        const result = WorkItemQueries.buildRetrievalQuery(
            { orgId: 'foo', predicates: [], blockersSelectionClause: undefined, expediteSelectionClause: undefined, contextIdList: [], timezone: ausTz, dateStart: undefined },
        );

        expect(result).toEqual(expect.stringContaining(ausTz));
    });
    test('If an invalid timezone is passed, it defaults to UTC timezone', () => {
        const invalidTz = 'invalid/invalid';
        const result = WorkItemQueries.buildRetrievalQuery(
            { orgId: 'foo', predicates: [], blockersSelectionClause: undefined, expediteSelectionClause: undefined, contextIdList: [], timezone: invalidTz, dateStart: undefined },
        );
        expect(result).toEqual(expect.not.stringContaining(invalidTz));
        expect(result).toEqual(expect.stringContaining(TIMEZONE_UTC));
    });


});

describe('Common SQL predicates generated accordingly.', () => {
    test('Returns the three default predicates when there are no filter', () => {
        // getCommonSQLPredicates only uses optional properties of IQueryFilters
        const uiFilters = {} as IQueryFilters;

        const result = WorkItemQueries.getCommonSQLPredicates(
            'falcon-metrics-org-id',
            uiFilters,
        );

        expect(result.length).toBe(3);
    });
});

describe('State SQL predicates generated accordingly.', () => {
    test('Return an OR chain when multiple categories are given.', async () => {
        const allCategories: StateCategory[] = [
            StateCategory.PROPOSED,
            StateCategory.INPROGRESS,
            StateCategory.COMPLETED,
        ];

        const [result] = await WorkItemQueries.getStateCategorySQLPredicates(
            allCategories,
        );

        expect(result).toEqual(expect.stringContaining('OR'));
    });

    test('Return empty array when no categories are given.', async () => {
        const allCategories: StateCategory[] = [];

        const result = await WorkItemQueries.getStateCategorySQLPredicates(
            allCategories,
        );

        expect(result.length).toEqual(0);
    });
});

describe('Date predicates are generated adequately.', () => {
    test('Missing or empty parameters are handled correctly.', () => {
        // Adjust to timezone
        const start = DateTime.fromISO('2022-02-10T11:00:00.738+00').toISO();
        const end = DateTime.fromISO('2022-02-15T11:00:00.738+00').toISO();

        const validInterval = Interval.fromISO(`${start}/${end}`);

        const result: string | undefined = WorkItemQueries.getDateSQLPredicates(
            validInterval,
            'arrivalDate',
            'arrivalDate',
            DateAnalysisOptions.was,
        );

        const processedStart = DateTime.fromISO(start).toISO();
        const processedEnd = DateTime.fromISO(end).toISO();

        const startString = `"arrivalDate" >= '${processedStart}'`;
        const endString = `"arrivalDate" < '${processedEnd}'`;

        expect(result).toEqual(expect.stringContaining(startString));
        expect(result).toEqual(expect.stringContaining(endString));

        expect(result).toEqual(expect.stringContaining('AND'));
    });

    test('Date analysis is applied properly.', () => {
        // Adjust to timezone
        const start = DateTime.fromISO('2022-02-10T11:00:00.738+00').toISO();
        const end = DateTime.fromISO('2022-02-15T11:00:00.738+00').toISO();

        const validInterval = Interval.fromISO(`${start}/${end}`);

        const result: string | undefined = WorkItemQueries.getDateSQLPredicates(
            validInterval,
            'commitmentDate',
            'departureDate',
            DateAnalysisOptions.was,
        );

        const processedStart = DateTime.fromISO(start).toISO();
        const processedEnd = DateTime.fromISO(end).toISO();

        const commitmentBeforeEnd = `"commitmentDate" < '${processedEnd}'`;
        const departureAfterStart = `"departureDate" >= '${processedStart}'`;

        expect(result).toEqual(expect.stringContaining(commitmentBeforeEnd));
        expect(result).toEqual(expect.stringContaining(departureAfterStart));

        expect(result).toEqual(expect.stringContaining('AND'));
    });

    test('Invalid date field should throw error.', () => {
        // Adjust to timezone
        const start = DateTime.fromISO('2022-02-10T11:00:00.738+00').toISO();
        const end = DateTime.fromISO('2022-02-15T11:00:00.738+00').toISO();

        const validInterval = Interval.fromISO(`${start}/${end}`);

        expect(() => {
            WorkItemQueries.getDateSQLPredicates(
                validInterval,
                'unknownField' as InternalDateField,
            );
        }).toThrowError(Error);
    });

    test('Invalid interval should throw error.', () => {
        const invalidInterval = Interval.fromISO(
            '2022-02-10T1K:00:00.738+00/2022-02-K5T11:00:00.738+00',
        );

        expect(() => {
            WorkItemQueries.getDateSQLPredicates(
                invalidInterval,
                'arrivalDate',
            );
        }).toThrowError(Error);
    });
});
