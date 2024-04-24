import { DateTime } from 'luxon';
import moment from 'moment-business-days';

export const getLeadTimeInWholeDaysFunc = (
    {
        commitmentDateTime,
        departureDateTime,
        arrivalDateTime,
        excludeWeekends = false,
    }: {
        commitmentDateTime?: DateTime,
        departureDateTime?: DateTime,
        arrivalDateTime?: DateTime;
        excludeWeekends?: boolean;
    }
): number | undefined => {
    let leadTimeInWholeDays = undefined;

    // If departureDateTime is undefined, lead time is undefined
    if (departureDateTime) {
        let dateClosed = departureDateTime;
        let dateActivated: DateTime;

        if (commitmentDateTime) {
            dateActivated = commitmentDateTime;
        } else if (arrivalDateTime) {
            dateActivated = arrivalDateTime;
        } else {
            throw new Error('Work item is missing a commitmentDate and arrivalDate but has a departureDate');
        }

        // Use start of the day
        dateActivated = dateActivated.startOf('day');
        dateClosed = dateClosed.startOf('day');

        if (excludeWeekends) {
            leadTimeInWholeDays = momentBizDiff(dateActivated, dateClosed);
        } else {
            // (dateClosed - dateActivated) + 1
            leadTimeInWholeDays = dateClosed.diff(dateActivated, 'days').days + 1;
        }

    }

    return leadTimeInWholeDays;
};

export const getWIPAgeInWholeDaysFunc = ({
    commitmentDateTime,
    arrivalDateTime,
    excludeWeekends = false,
}: {
    commitmentDateTime?: DateTime,
    departureDateTime?: DateTime,
    arrivalDateTime?: DateTime;
    excludeWeekends?: boolean;
}): number => {
    const currentDate: DateTime = DateTime.utc().startOf('day');
    const dateActivated = commitmentDateTime ?? arrivalDateTime!;
    const dateActivatedDateTime: DateTime = dateActivated
        .toUTC()
        .startOf('day');

    let wipAge = currentDate.diff(dateActivatedDateTime, 'days').days + 1;
    if (excludeWeekends) {
        wipAge = momentBizDiff(dateActivatedDateTime, currentDate);
    }
    return wipAge;
};

export const getInventoryAgeInWholeDaysFunc = ({
    arrivalDateTime,
    excludeWeekends = false,
}: {
    arrivalDateTime?: DateTime;
    excludeWeekends?: boolean;
}): number => {
    const currentDate = DateTime.utc().startOf('day');
    let inventoryAge = (
        currentDate.diff(
            arrivalDateTime!.toUTC().startOf('day'),
            'days',
        ).days + 1
    );
    if (excludeWeekends) {
        inventoryAge = momentBizDiff(arrivalDateTime!, currentDate);
    }
    return inventoryAge;
};

export const momentBizDiff = (startDate: DateTime, endDate: DateTime) => {
    if (startDate > endDate) return 0;
    let diff = 0;
    try {

        const dateTimeFormat = 'yyyy-MM-dd';
        const startStr = startDate.toFormat(dateTimeFormat);
        // Moment sets the date to the start of the day. 
        // Thats why the plus one day to include the last day
        const endStr = endDate.plus({ 'day': 1 }).toFormat(dateTimeFormat);
        const momentFormat = 'YYYY-MM-DD';
        diff = moment(endStr, momentFormat)
            .businessDiff(moment(startStr, momentFormat));
    } catch (e) {
        console.error(JSON.stringify({
            message: 'Error in momentBizDiff',
            errorMessage: (e as Error).message,
            errorStack: (e as Error).stack,
        }));
    }
    return diff;
};

export const naiveBizDiff = (d1: DateTime, d2: DateTime) => {
    let days = 0;
    let current = d1.plus({ 'second': 0 });
    while (current <= d2) {
        if (
            current.weekdayShort !== 'Sat' &&
            current.weekdayShort !== 'Sun'
        ) {
            days += 1;
        }
        current = current.plus({ 'days': 1 });
    }
    return days;
};