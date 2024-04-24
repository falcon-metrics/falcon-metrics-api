import { DateTime } from 'luxon';
import {
    getLeadTimeInWholeDaysFunc,
    getWIPAgeInWholeDaysFunc,
    getInventoryAgeInWholeDaysFunc,
} from '../utils';

describe('get lead time tests', () => {
    test('lead time works normally', async () => {
        const departure = '2021-04-12T05:39:27.757+00';
        const activated = DateTime.fromISO(departure)
            .toUTC()
            .minus({ days: 10 })
            .toISO(); //10 days before
        const testItem = {
            departureDateTime: DateTime.fromISO(departure).toUTC(),
            commitmentDateTime: DateTime.fromISO(activated).toUTC(),
        };
        const result = getLeadTimeInWholeDaysFunc({ ...testItem });
        expect(result).toEqual(11);
    });

    test('when commitment date is same date of departure date, lead time shoud be 1', async () => {
        const departure = '2021-04-12T05:39:27.757+00';
        const activated = '2021-04-12T23:59:59.999+00';
        let testItem = {
            departureDateTime: DateTime.fromISO(departure).toUTC(),
            commitmentDateTime: DateTime.fromISO(activated).toUTC(),
        };
        let result = getLeadTimeInWholeDaysFunc({ ...testItem });
        expect(result).toEqual(1);

        const datetime1 = DateTime.fromISO('2021-04-12T05:39:27.757+00').toUTC();
        const datetime2 = datetime1.minus({ 'hour': 1 }).toUTC();

        testItem = {
            departureDateTime: datetime1,
            commitmentDateTime: datetime2,
        };
        result = getLeadTimeInWholeDaysFunc({ ...testItem });
        expect(result).toEqual(1);
    });

    test('when the commitment date and arrival date are missing, the function throws an error', () => {
        let testItem = {
            departureDateTime: DateTime.now().endOf('day'),
        };
        expect(() => getLeadTimeInWholeDaysFunc({ ...testItem })).toThrow();

    });
    test('when the departure date is undefined, the function returns undefined', () => {
        expect(getLeadTimeInWholeDaysFunc({})).toBeUndefined();
    });
});

describe('get wip age tests', () => {
    test('get WIP age works normally', async () => {
        const currentDate = DateTime.utc().startOf('day').toISO();
        const activated = DateTime.fromISO(currentDate)
            .toUTC()
            .minus({ days: 10 }); //10 days before
        const testItem = {
            commitmentDateTime: activated,
        };
        const result = getWIPAgeInWholeDaysFunc(testItem);
        expect(result).toEqual(11);
    });

    test('when activated date is same date of current date, WIP age should be 1', async () => {
        const activated = DateTime.utc().startOf('day');
        const testItem = {
            commitmentDateTime: activated,
        };
        const result = getWIPAgeInWholeDaysFunc(testItem);
        expect(result).toEqual(1);
    });
});
describe('get Inventory age tests', () => {
    test('get Inventory age works normally', async () => {
        const currentDate = DateTime.utc().startOf('day').toISO();
        const arrival = DateTime.fromISO(currentDate)
            .toUTC()
            .minus({ days: 10 });
        const testItem = {
            arrivalDateTime: arrival,
        };
        const result = getInventoryAgeInWholeDaysFunc(testItem);
        expect(result).toEqual(11);
    });

    test('when activated date is same date of current date, WIP age should be 1', async () => {
        const arrival = DateTime.utc().startOf('day');
        const testItem = {
            arrivalDateTime: arrival,
        };
        const result = getInventoryAgeInWholeDaysFunc(testItem);
        expect(result).toEqual(1);
    });
});
