import {
    SimulationCountLimit,
    simulationOutput,
    SimulationResults,
} from '../types/simulation_types';
import { DeliveryRate, DeliveryRatePrecision } from '../types/types';
import { simulateDays } from '../utils/simulation_utils';

export interface ISimulation {
    runSimulation(
        sampleData: DeliveryRate[],
        totalTasks: number,
        expectedRemainingDays: number,
        precision: DeliveryRatePrecision
    ): SimulationResults;
    getSimulationResultsDistribution(
        sampleData: DeliveryRate[],
        totalTask: number,
        expectedRemainingDays: number,
    ): SimulationResults;
}
export class Simulation implements ISimulation {
    runSimulation(
        sampleData: DeliveryRate[],
        totalTasks: number,
        expectedRemainingDays: number,
        precision: DeliveryRatePrecision = DeliveryRatePrecision.DAY
    ): SimulationResults {
        return this.getSimulationResultsDistribution(
            sampleData,
            totalTasks,
            expectedRemainingDays,
            precision
        );
    }

    simulateDays(
        sampleData: DeliveryRate[],
        totalTasks: number,
        expectedRemainingDays: number,
        precision: DeliveryRatePrecision = DeliveryRatePrecision.DAY
    ): simulationOutput {
        return simulateDays(sampleData, totalTasks, expectedRemainingDays, precision);
    }
    getSimulationResultsDistribution(
        sampleData: DeliveryRate[],
        totalTask: number,
        expectedRemainingDays: number,
        precision: DeliveryRatePrecision = DeliveryRatePrecision.DAY
    ): SimulationResults {
        const daysResults: number[] = [];
        const throughputResults: number[] = [];
        let simulationCount = 0;
        const start = Date.now();
        while (
            Date.now() - start < 1000 &&
            simulationCount < SimulationCountLimit
        ) {
            const { days, throughput } = this.simulateDays(
                sampleData,
                totalTask,
                expectedRemainingDays,
                precision
            );
            daysResults.push(days);
            throughputResults.push(throughput); //Can be more considerable in the math round here
            simulationCount += 1;
        }
        return { simulationResults: daysResults, throughputResults, simulationCount };
    }
}
