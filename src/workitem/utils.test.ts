import { DateTime } from 'luxon';

import { momentBizDiff, naiveBizDiff } from './utils';

describe('businessDaysDiffJSDate', () => {
    const testCases = [
        // start date after end date
        ['2023-08-02', '2023-07-31', 0],
        // start date after end date
        ['2023-08-02', '2023-05-31', 0],
        // Wed - Wed
        ['2023-08-02', '2023-08-08', 5],
        // Wed - Next Friday
        ['2023-08-02', '2023-08-10', 7],
        // Wed - Sat
        ['2023-08-02', '2023-08-05', 3],
        // Wed - Sunday
        ['2023-08-02', '2023-08-06', 3],
        // 4 days
        ['2023-08-02', '2023-08-07', 4],
        // 3 weeks
        ['2023-08-02', '2023-08-22', 15],
        // Mon - Fri
        ['2023-08-07', '2023-08-11', 5],
        // Fri - Mon
        ['2023-08-11', '2023-08-14', 2],
        // Fri - Sun
        ['2023-08-11', '2023-08-13', 1],
        // Sat - next Sun
        ['2023-08-05', '2023-08-13', 5],
        // Sat - Sun after 3 weeks
        ['2023-08-05', '2023-08-27', 15],
        // Sat - Sun
        ['2023-08-05', '2023-08-06', 0],
        // Sat - Sat
        ['2023-08-05', '2023-08-05', 0],
        // Sun - Sun
        ['2023-08-06', '2023-08-06', 0],
        // Sat - Sun
        ['2023-08-05', '2023-08-06', 0],
        // Sat - Mon
        ['2023-08-05', '2023-08-07', 1],
        // Fri - Fri
        ['2023-08-04', '2023-08-04', 1],
        // Thu - Fri
        ['2023-08-03', '2023-08-04', 2],
        // Sun - Next Sat
        ['2023-08-06', '2023-09-02', 20],
        // Sun - 4 years
        ['2023-08-06', '2027-09-02', 1064],
        ['2023-08-11', '2023-08-23', 9],
    ];

    const format = 'yyyy-MM-dd';

    testCases.forEach(([start, end, expected]) => {
        // console.log(DateTime.fromFormat(start as string, format).toISO());
        test(`Moment - ${start} - ${end}`, () => {
            let result = momentBizDiff(
                DateTime.fromFormat(start as string, format).startOf('day'),
                DateTime.fromFormat(end as string, format).endOf('day')
            );
            expect(result).toEqual(expected);
        });
    });

    testCases.forEach(([start, end, expected]) => {
        // console.log(DateTime.fromFormat(start as string, format).toISO());
        test(`Naive - ${start} - ${end}`, () => {
            let result = naiveBizDiff(
                DateTime.fromFormat(start as string, format).startOf('day'),
                DateTime.fromFormat(end as string, format).endOf('day')
            );
            expect(result).toEqual(expected);
        });
    });


    // Build an SQL statement to the SQL function
    // with the same test cases
    let query = `select\n`;

    testCases.forEach(([start, end, expected], i) => {
        const startStr = DateTime.fromFormat(start as string, format).startOf('day').toISO();
        const endStr = DateTime.fromFormat(end as string, format).endOf('day').toISO();
        query = query + `(count_business_days('${startStr}'::timestamptz, '${endStr}'::timestamptz) = ${expected}) as "${start}-${end}"`;
        if (i < (testCases.length - 1)) {
            query = query + ',\n';
        }
    });
    // console.log("query:", query);
});

export default {};