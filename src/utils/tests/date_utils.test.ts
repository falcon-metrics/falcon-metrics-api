import { DateTime } from "luxon"
import { getLastFourFullWeeks, isValidTimezone, TIMEZONE_UTC, validateTzOrUTC, Week } from "../date_utils"

describe('Test isValidTimezone', () => {
    test('isValidTimezone returns true for a valid timezone', () => {
        const timezone = 'Australia/Sydney'
        const isValid = isValidTimezone(timezone)
        expect(isValid).toBe(true)
    })
    test('isValidTimezone returns false for an invalid timezone', () => {
        const timezone = 'invalid/invalid'
        const isValid = isValidTimezone(timezone)
        expect(isValid).toBe(false)
    })
})

describe('Test validateTzOrUTC', () => {
    test('validateTzOrUTC returns the timezome for a valid timezone', () => {
        const timezone = 'Australia/Sydney'
        const validTimezone = validateTzOrUTC(timezone)
        expect(validTimezone).toBe(timezone)
    })
    test('isValidTimezone returns UTC for an invalid timezone', () => {
        const timezone = 'invalid/invalid'
        const validTimezone = validateTzOrUTC(timezone)
        expect(validTimezone).toBe(TIMEZONE_UTC)
    })
})

describe('Test the Week class', () => {
    const date: DateTime = DateTime.fromISO(
        '2022-04-13T11:00:00.000+00',
        { zone: 'utc' },
    );
    test('The week number matches the week number of the date', () => {
        const week = new Week(date)
        expect(week.getWeekNumber()).toEqual(date.weekNumber)
    })
    test('The year matches the year of the date', () => {
        const week = new Week(date)
        expect(week.getWeekNumber()).toEqual(date.weekNumber)
    })
    test('Function to check if the current week is the next week of the given week behaves correctly', () => {
        let week1, week2;


        const date1: DateTime = DateTime.fromISO(
            '2022-06-26T11:00:00.000+00',
            { zone: 'utc' },
        );


        week1 = new Week(date1)
        week2 = new Week(date1.plus({ 'week': 1 }))
        expect(week2.isNextWeekOf(week1)).toBe(true)


        week1 = new Week(date1)
        week2 = new Week(date1.minus({ 'week': 2 }))
        expect(week2.isNextWeekOf(week1)).toBe(false)



        // Across the year boundary
        const date2: DateTime = DateTime.fromISO(
            '2022-01-01T11:00:00.000+00',
            { zone: 'utc' },
        );

        week1 = new Week(date2.minus({ 'week': 1 }))
        week2 = new Week(date2)
        expect(week2.isNextWeekOf(week1)).toBe(true)

    })
})

describe('Test getLastFourFullWeeks function', () => {
    test('For a date that is in the middle of the week, current week is excluded and the last four full weeks are returned', () => {
        const date: DateTime = DateTime.fromISO(
            '2022-06-23T11:00:00.000+00',
            { zone: 'utc' },
        );
        const { week4, week3, week2, week1 } = getLastFourFullWeeks(date)
        const weekOfDate = date.weekNumber
        expect(week4.getWeekNumber()).toEqual(weekOfDate - 1)
    })
    test('For a date that is last day of the week, the current week is included', () => {
        const date: DateTime = DateTime.fromISO(
            '2022-06-26T11:00:00.000+00',
            { zone: 'utc' },
        );
        const { week4, week3, week2, week1 } = getLastFourFullWeeks(date)
        const weekOfDate = date.weekNumber
        expect(week4.getWeekNumber()).toEqual(weekOfDate)
    })

    test('The weeks returned are be consecutive', () => {
        const date: DateTime = DateTime.fromISO(
            '2022-06-26T11:00:00.000+00',
            { zone: 'utc' },
        );
        const { week4, week3, week2, week1 } = getLastFourFullWeeks(date)

        expect(week4.getWeekNumber() - week3.getWeekNumber()).toEqual(1)
        expect(week3.getWeekNumber() - week2.getWeekNumber()).toEqual(1)
        expect(week2.getWeekNumber() - week1.getWeekNumber()).toEqual(1)
    })
    test('The weeks returned are be consecutive even if the weeks span over 2 years', () => {
        const date: DateTime = DateTime.fromISO(
            '2022-01-10T11:00:00.000+00',
            { zone: 'utc' },
        );
        const { week4, week3, week2, week1 } = getLastFourFullWeeks(date)

        expect(week4.isNextWeekOf(week3)).toEqual(true)
        expect(week3.isNextWeekOf(week2)).toEqual(true)
        expect(week2.isNextWeekOf(week1)).toEqual(true)

    })
})