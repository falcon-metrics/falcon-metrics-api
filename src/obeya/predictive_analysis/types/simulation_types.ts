
export type simulationOutput = { days: number; throughput: number; };
export type SimulationResults = {
    simulationResults: number[];
    throughputResults: number[];
    simulationCount: number;
};
export const SimulationCountLimit = 250 * 1000;

export const ValidDataPointsPercentageThresholds = {
    'day': 0.3,
    'week': 0.5,
    'month': 0.8,
};

