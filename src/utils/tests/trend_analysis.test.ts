import { DateTime } from 'luxon';
import {
    ArrowColours,
    formatWeekCount,
    getPercentualDifference,
    getTrendAnalysisResponseFromWeekCount,
    TrendDirection,
} from '../trend_analysis';

describe('trend analysis format week count test', () => {
    const currentDate = DateTime.fromISO('2020-12-01');
    test('When there are no week count of the current week, should fill it with 0', async () => {
        const weekCount: Map<number, number> = new Map();
        const currentCalendarWeekNum = currentDate.weekNumber;
        weekCount.set(currentCalendarWeekNum - 1, 1);
        weekCount.set(currentCalendarWeekNum - 2, 1);
        expect(weekCount.get(currentCalendarWeekNum)).toBeUndefined();
        formatWeekCount(weekCount, { end: currentDate });
        expect(weekCount.get(currentCalendarWeekNum)).toBe(0);
    });
    test('When there are no week count of the beginning week of the period, should fill it with 0', async () => {
        const weekCount: Map<number, number> = new Map();
        const currentCalendarWeekNum = currentDate.weekNumber;
        const FourWeekAgo = currentDate.startOf('week').minus({ weeks: 4 });

        weekCount.set(currentCalendarWeekNum, 1);
        weekCount.set(currentCalendarWeekNum - 1, 1);
        weekCount.set(currentCalendarWeekNum - 2, 1);
        weekCount.set(currentCalendarWeekNum - 3, 1);
        expect(weekCount.get(currentCalendarWeekNum - 4)).toBeUndefined();
        formatWeekCount(weekCount, { start: FourWeekAgo });
        expect(weekCount.get(currentCalendarWeekNum - 4)).toBe(0);
    });
    test('When there are no week count of the weeks in between start and finish, should fill it with 0', async () => {
        const weekCount: Map<number, number> = new Map();
        const currentCalendarWeekNum = currentDate.weekNumber;
        const FourWeekAgo = currentDate.startOf('week').minus({ weeks: 4 });

        weekCount.set(currentCalendarWeekNum, 1);
        weekCount.set(currentCalendarWeekNum - 1, 1);
        weekCount.set(currentCalendarWeekNum - 3, 1);
        expect(weekCount.get(currentCalendarWeekNum - 2)).toBeUndefined();
        formatWeekCount(weekCount, { start: FourWeekAgo, end: currentDate });
        expect(weekCount.get(currentCalendarWeekNum - 2)).toBe(0);
    });
});

describe('get trend analysis response handles week number correctly', () => {
    const weekCount: Map<number, number> = new Map();
    const currentDate = DateTime.fromISO('2020-12-01');
    test('When there are only two weeks, we should not be able to compare two weeks because we are excluding the current calendar week', async () => {
        const currentCalendarWeekNum = currentDate.weekNumber;
        weekCount.set(currentCalendarWeekNum, 1);
        weekCount.set(currentCalendarWeekNum - 1, 1);
        const response = getTrendAnalysisResponseFromWeekCount(weekCount);
        expect(response!.lastWeek!.text).toBe('');
    });
    test('When there are only four weeks, we should not be able to compare fortnights, and lastWeek calculation should be correct', async () => {
        const currentCalendarWeekNum = currentDate.weekNumber;
        weekCount.set(currentCalendarWeekNum - 1, 2);
        weekCount.set(currentCalendarWeekNum - 2, 1);
        weekCount.set(currentCalendarWeekNum - 3, 1);
        expect([...weekCount.keys()].length).toEqual(4);

        const response = getTrendAnalysisResponseFromWeekCount(weekCount);

        expect(response!.lastWeek!.percentage).toBe(100);
        expect(response!.lastWeek!.arrowDirection).toBe(TrendDirection.UP);
        expect(response!.lastTwoWeeks!.text).toBe('');
    });
    test('When there are only eight weeks, we should not be able to compare fortnights, and lastTwoWeeks calculation should be correct', async () => {
        const currentCalendarWeekNum = currentDate.weekNumber;
        weekCount.set(currentCalendarWeekNum - 1, 1);
        weekCount.set(currentCalendarWeekNum - 2, 1);
        weekCount.set(currentCalendarWeekNum - 3, 2);
        weekCount.set(currentCalendarWeekNum - 4, 2);
        weekCount.set(currentCalendarWeekNum - 5, 1);
        weekCount.set(currentCalendarWeekNum - 6, 1);
        weekCount.set(currentCalendarWeekNum - 7, 1);
        expect([...weekCount.keys()].length).toEqual(8);

        const response = getTrendAnalysisResponseFromWeekCount(weekCount);
        expect(response!.lastTwoWeeks!.percentage).toBe(50);
        expect(response!.lastTwoWeeks!.arrowDirection).toBe(TrendDirection.DOWN);
        expect(response!.lastFourWeeks!.text).toBe('');
    });
    test('lastFourWeeks calculation should be correct', async () => {
        const currentCalendarWeekNum = currentDate.weekNumber;
        weekCount.set(currentCalendarWeekNum - 1, 1);
        weekCount.set(currentCalendarWeekNum - 2, 1);
        weekCount.set(currentCalendarWeekNum - 3, 1);
        weekCount.set(currentCalendarWeekNum - 4, 1);
        weekCount.set(currentCalendarWeekNum - 5, 2);
        weekCount.set(currentCalendarWeekNum - 6, 2);
        weekCount.set(currentCalendarWeekNum - 7, 2);
        weekCount.set(currentCalendarWeekNum - 8, 2);
        expect([...weekCount.keys()].length).toEqual(9);

        const response = getTrendAnalysisResponseFromWeekCount(weekCount);
        expect(response!.lastFourWeeks!.percentage).toBe(50);
        expect(response!.lastFourWeeks!.arrowDirection).toBe(TrendDirection.DOWN);
    });
});

describe('get trend analysis response returns correct colour for up, down and stable', () => {
    const weekCount: Map<number, number> = new Map();
    const currentCalendarWeekNum = DateTime.fromISO('2020-12-01').weekNumber;
    const colours: ArrowColours = {
        upColour: 'upCol',
        downColour: 'downCol',
        stableColour: 'stableCol',
    };
    weekCount.set(currentCalendarWeekNum, 0);
    test('up colour is correct', async () => {
        weekCount.set(currentCalendarWeekNum - 1, 2);
        weekCount.set(currentCalendarWeekNum - 2, 1);

        const response = getTrendAnalysisResponseFromWeekCount(
            weekCount,
            colours,
        );
        expect(response!.lastWeek!.arrowColour).toBe('upCol');
        expect(response!.lastWeek!.arrowDirection).toBe(TrendDirection.UP);
    });

    test('down colour is correct', async () => {
        weekCount.set(currentCalendarWeekNum - 1, 1);
        weekCount.set(currentCalendarWeekNum - 2, 2);

        const response = getTrendAnalysisResponseFromWeekCount(
            weekCount,
            colours,
        );
        expect(response!.lastWeek!.arrowColour).toBe('downCol');
        expect(response!.lastWeek!.arrowDirection).toBe(TrendDirection.DOWN);
    });

    test('stable colour is correct', async () => {
        weekCount.set(currentCalendarWeekNum - 1, 1);
        weekCount.set(currentCalendarWeekNum - 2, 1);

        const response = getTrendAnalysisResponseFromWeekCount(
            weekCount,
            colours,
        );
        expect(response!.lastWeek!.arrowColour).toBe('stableCol');
        expect(response!.lastWeek!.arrowDirection).toBe(TrendDirection.STABLE);
    });
});

describe('get percentual difference returns the correct value', () => {
    test('returns 0 when both values are 0', () => {
        expect(getPercentualDifference(0, 0)).toBe(0);
    });
    test('returns 9999 when previous value is 0 and current value is > 0', () => {
        expect(getPercentualDifference(0, 5)).toBe(9999);
    });
    test('returns correct comparison for increase', () => {
        expect(getPercentualDifference(50, 80)).toBe(60);
    });
    test('returns correct comparison for decrease', () => {
        expect(getPercentualDifference(80, -10)).toBeCloseTo(-112.5);
    });
    test('returns 0 for same value', () => {
        expect(getPercentualDifference(10, 10)).toBe(0);
    });
});
