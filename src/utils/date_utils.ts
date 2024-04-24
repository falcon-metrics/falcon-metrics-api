import { DateTime } from 'luxon';
import { abs } from 'mathjs';

export const TIMEZONE_UTC = 'utc';

export function convertDateToUnixFormatAndRemoveTime(
    originalDateTime: Date,
): number {
    return DateTime.fromJSDate(originalDateTime).startOf('day').valueOf();
}

export function truncateDateTimeToDateOnly(originalDateTime: Date): Date {
    return DateTime.fromJSDate(originalDateTime).startOf('day').toJSDate();
}

export function addDaysToDate(
    originalDateTime: Date,
    numberOfDays: number,
): Date {
    return DateTime.fromJSDate(originalDateTime)
        .plus({ days: numberOfDays })
        .toJSDate();
}

export function getDaysBetweenDates(startDate: Date, endDate: Date): number {
    return abs(
        DateTime.fromJSDate(startDate)
            .toUTC()
            .startOf('day')
            .diff(DateTime.fromJSDate(endDate).toUTC().startOf('day'), 'days')
            .days,
    );
}

export function getWeekIndex(index: number): number {
    if (index < 1) {
        const numberOfWeeksInPreviousYear = DateTime.utc().minus({ years: 1 })
            .weeksInWeekYear;
        const newIndex = numberOfWeeksInPreviousYear - abs(index);
        return newIndex;
    } else {
        return index;
    }
}

export function getWeekStartFromISO(ISODate: string) {
    return DateTime.fromISO(ISODate)
        .startOf('week')
        .startOf('day')
        .plus({ day: 1 }); //Start monday instead of luxon's default sunday
}

//https://support.google.com/docs/answer/3294949?hl=en-GB
//type 21, last day of week is Sunday, type 2
export function isDateLastDayOfWeekJSDate(date: Date) {
    if (!date) {
        return false;
    }

    return date.getDay() === 0; //0 is Sunday
}

export function isDateLastDayOfWeek(date: DateTime) {
    if (!date) {
        return false;
    }

    return date.weekday === 7; //7 is Sunday
}

// TODO: Is this even required? src/common/filters_v2.ts throws an error if an invalid timezone is passed
/**
 * Function to validate the timezone string.
 * Postgres throws and error if the timezone string is invalid
 * @param timezone string
 * @returns boolean
 */
export const isValidTimezone = (timezone: string): boolean => {
    if (!Intl?.DateTimeFormat()?.resolvedOptions()?.timeZone) {
        throw new Error('Time zones are not available in this environment');
    }

    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        return true;
    } catch (ex) {
        return false;
    }
};

/**
 * If the given timezone string is invalid, it returns UTC.
 * Otherwise returns the same timezone string passed to it
 *
 * @param timezone TimeZone string
 * @returns Time zone string
 */
export const validateTzOrUTC = (timezone: string): string => {
    if (isValidTimezone(timezone)) {
        return timezone;
    }
    return TIMEZONE_UTC;
};

export class Week {
    private readonly referenceDate: DateTime;

    constructor(referenceDate: DateTime) {
        this.referenceDate = referenceDate;
    }

    public getYear(): number {
        return this.referenceDate.year;
    }
    public getWeekNumber(): number {
        return this.referenceDate.weekNumber;
    }

    /**
     * Get a date of a week
     * @returns A date in the week
     */
    public getReferenceDate(): DateTime {
        return this.referenceDate;
    }

    /**
     *
     * @param prevWeek Week to check
     * @returns Boolean stating whether the current week is the next week of the given week
     */
    public isNextWeekOf(prevWeek: Week): boolean {
        // Shift the date to the previous week
        const dateNextWeek = this.getReferenceDate().minus({ week: 1 });

        // Check if the week number and year of the date of the previous week
        // matches the week number and year of the given week
        return (
            dateNextWeek.year === prevWeek.getYear() &&
            dateNextWeek.weekNumber === prevWeek.getWeekNumber()
        );
    }
}

/**
 * 4 consecutive weeks.
 * Week 4 is the most recent week
 * Week 1 is the earliest week
 */
export type LastFourWeeks = {
    /**
     * Week 4 of the 4 weeks.
     *
     * 4th week is the most recent. 1st week is the earliest
     */
    week4: Week;
    /**
     * Week 3 of the 4 weeks.
     *
     * 4th week is the most recent. 1st week is the earliest
     */
    week3: Week;
    /**
     * Week 2 of the 4 weeks.
     *
     * 4th week is the most recent. 1st week is the earliest
     */
    week2: Week;
    /**
     * Week 1 of the 4 weeks.
     *
     * 4th week is the most recent. 1st week is the earliest
     */
    week1: Week;
};

/**
 * Return the last 4 full weeks.
 * If the given date is in the middle of the week, that week is not considered. Because that is a partial week
 *
 *
 * Example 1:
 *  - The given date is 22 June 2022, Wednesday. The week number is 21.
 *  - Because the given date is in the middle of the week, the last 4 weeks excluding the week of the date will be returned
 *  - The weeks that will be returned are 20, 19, 18, 17
 *
 *
 * Example 2:
 *  - The given date is 19 June 2022, Wednesday. The week number is 20.
 *  - Because the given date is in the last day of the week, that week will be considered
 *  - The weeks that will be returned are 20, 19, 18, 17
 *
 * @param date
 * @returns Dates of Sundays in the last 4 weeks.
 */
export const getLastFourFullWeeks = (date: DateTime): LastFourWeeks => {
    let effectiveDate = date;

    if (!isDateLastDayOfWeek(effectiveDate)) {
        effectiveDate = date
            .minus({
                weeks: 1,
            })
            .endOf('week');
    }
    return {
        week4: new Week(effectiveDate),
        week3: new Week(effectiveDate.minus({ week: 1 })),
        week2: new Week(effectiveDate.minus({ week: 2 })),
        week1: new Week(effectiveDate.minus({ week: 3 })),
    };
};
