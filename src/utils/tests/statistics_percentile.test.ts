import { getPercentile } from '../statistics';

const array = [
    1,
    1,
    2,
    3,
    4,
    5,
    6,
    6,
    10,
    110,
    126,
    195,
    267,
    291,
    325,
    361,
    367,
    382,
    474,
    707,
    819,
    978,
];

test('should return 1 if percentile = 1', () => {
    expect(getPercentile(1, array)).toBe(1);
});

test('should return 3.15 if percentile = 15', () => {
    expect(getPercentile(15, array)).toBe(3.15);
});

test('should return 3.36 if percentile = 16', () => {
    expect(getPercentile(16, array)).toBe(3.36);
});

test('should return 5.46 if percentile = 26', () => {
    expect(getPercentile(26, array)).toBe(5.46);
});

test('should return 160.5 if percentile = 50', () => {
    expect(getPercentile(50, array)).toBe(160.5);
});

test('should return 460.2 if percentile = 85', () => {
    expect(getPercentile(85, array)).toBe(460.2);
});

test('should return 813.4 if percentile = 95', () => {
    expect(getPercentile(95, array)).toBe(813.4);
});

test('should return 911.22 if percentile = 98', () => {
    expect(getPercentile(98, array)).toBe(911.22);
});

test('should return 978 if percentile = 100', () => {
    expect(getPercentile(100, array)).toBe(978);
});
