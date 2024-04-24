import { ForecastingSettingsData } from '../forecasting_settings/types';
import {
    simulationOutput,
    ValidDataPointsPercentageThresholds,
} from '../types/simulation_types';
import {
    DeliveryRate,
    DeliveryRatePrecision,
    SimulationAdditionalInfo,
} from '../types/types';
import { DateTime } from 'luxon';

/**
 * Randomly pick an element from the array
 */
export const pickDeliveryRateFromSample = (
    sampleData: DeliveryRate[],
): number => {
    const random = Math.floor(Math.random() * (sampleData.length - 1));
    if (typeof sampleData[random].itemCompleted === 'string')
        //sequelize returns string sometime
        return Number.parseInt(sampleData[random].itemCompleted as string);
    return sampleData[random].itemCompleted as number;
};

export const shouldRunSimulation = (conditions: {
    sampleDeliveryRate: DeliveryRate[];
    foreCastingSettings: ForecastingSettingsData;
}): {
    validated: boolean;
    reason?: string;
} => {
    const { sampleDeliveryRate, foreCastingSettings } = conditions;
    const threshold =
        ValidDataPointsPercentageThresholds[
        foreCastingSettings.predictiveAnalysisPrecision
        ];

    if (!validateSampleDeliveryRate(sampleDeliveryRate, threshold)) {
        return {
            validated: false,
            // Simulation example:
            // 30% is 2 out of 7 days with 0 daily throughput (weekends)
            // 58% is 4 out of 7 days with 0 daily throughput
            reason:
                'Due to a large volume of daily throughput being zero, we’re unable to process the forecasting.',
        };
    }

    return { validated: true };
};

export const validateSampleDeliveryRate = (
    sampleDeliveryRate: DeliveryRate[],
    threshold: number,
): boolean => {
    /**
     * Count of non-zero elements in the array
     *
     * Number of days from the delivery sample that we got more than 0.
     * In this case, it doesn't matter if throughput was 1 or 30 on the same day.
     **/
    const validDataPointCount = sampleDeliveryRate.filter(
        (deliveryRate) => Number.parseInt(deliveryRate.itemCompleted.toString()) > 0,
    ).length;

    return validDataPointCount / sampleDeliveryRate.length >= threshold;
};

export const getSimulationAdditionalInfo = (
    sampleDeliveryRate: DeliveryRate[],
): SimulationAdditionalInfo => {
    const startDate = DateTime.fromISO(sampleDeliveryRate[0].date);
    const endDate = DateTime.fromISO(
        sampleDeliveryRate[sampleDeliveryRate.length - 1].date,
    );

    const duration = endDate.diff(startDate, 'days');

    /**
     * Count of non-zero elements in the array
     *
     * Number of days from the delivery sample that we got more than 0.
     * In this case, it doesn't matter if throughput was 1 or 30 on the same day.
     **/
    const validDataPointCount = sampleDeliveryRate.filter(
        (deliveryRate) => Number.parseInt(deliveryRate.itemCompleted.toString()) > 0,
    ).length;

    return {
        dateRangeValue: `${startDate.toFormat(
            'dd MMM yyyy',
        )} - ${endDate.toFormat('dd MMM yyyy')}`,
        duration: duration.days,
        dataSetSize: `${sampleDeliveryRate.length} samples`,
        throughputDays: validDataPointCount,
    };
};
/**
 * When Forecast - How many periods did it take to finish the remaining tasks
 * How many forecast - How many items were finished in the `availablePeriods`
 *
 */
export const simulateDays = (
    sampleData: DeliveryRate[],
    remainingTasks: number,
    availablePeriods: number,
    precision: DeliveryRatePrecision = DeliveryRatePrecision.DAY,
): simulationOutput => {
    /**
     * Number of "period"s it takes to complete
     * the items in this simulation
     */
    let periods = 0;
    let totalCompleted = 0;

    const deliveryRateSamples = [];

    /**
     * When forecast
     *
     * How long does it take to finish the remaining items
     * Finish everything even if it goes past the end date
     *
     * If precision is set to weekly, in the last iteration, count only the fraction of the week,
     * not the whole week
     */
    while (totalCompleted < remainingTasks) {
        const randomDeliveryRate = pickDeliveryRateFromSample(sampleData);
        deliveryRateSamples.push(randomDeliveryRate);

        let workCompletedInIteration = randomDeliveryRate;
        // TODO: Better name
        let periodInIteration = 1;

        // When precision is Week, dont consider the whole week at the last chunk (in the last iteration of this loop)
        // When we consider the whole week for a fraction of work to be done in that week,
        // we're saying that it takes more time that it actually does to finish the last remaining chunk of work.
        if (
            precision === DeliveryRatePrecision.WEEK &&
            totalCompleted + randomDeliveryRate > remainingTasks
        ) {
            const lastRemainingTasks = remainingTasks - totalCompleted;
            // Assuming the work done during the week is even distributed throughout the week
            // Get the fraction of the week that's needed to finish the remaining chunk of work
            const weekFraction = lastRemainingTasks / randomDeliveryRate;

            // TODO: Review this.
            // Round it to 1 digit precision. If you dont do this, you cannot display a proper histogram
            // because there will be too many different values of fractional weeks
            const roundedWeekFraction = Math.round(weekFraction * 10) / 10;

            periodInIteration = roundedWeekFraction;

            // Add only the work completed in the fraction of the week
            workCompletedInIteration = lastRemainingTasks;
        }

        totalCompleted += workCompletedInIteration;
        periods += periodInIteration;
    }

    /**
     * How-many forecast
     *
     * How many items can be finished in the available periods
     * Run only until available periods
     *
     * Use the same random samples to do the how-many forecast
     */

    let totalThroughput = 0;
    let periodsForHowMany = 0;

    while (periodsForHowMany < availablePeriods) {
        // If we need more samples than what we already have,
        // generate a new sample and add it to the array
        if (periodsForHowMany >= deliveryRateSamples.length) {
            deliveryRateSamples.push(pickDeliveryRateFromSample(sampleData));
        }

        const randomDeliveryRate = deliveryRateSamples[periodsForHowMany];

        // If its the last week
        // Example:
        // availablePeriods  is 7.2
        // periodsForHowMany is 7
        // Use only 0.2 * throughput instead of the full throughput
        if (
            precision === DeliveryRatePrecision.WEEK &&
            periodsForHowMany + 1 > availablePeriods
        ) {
            const fraction = availablePeriods - periodsForHowMany;
            // Fraction of a unit of work doesnt make sense. So if its a fraction of a unit of work,
            // Calculate that as a whole unit of work. Hence Math.ceil
            totalThroughput += Math.ceil(randomDeliveryRate * fraction);
        } else {
            totalThroughput += randomDeliveryRate;
        }

        periodsForHowMany += 1;
    }

    // TODO: Refactor. Not days but "periods"/"slots" (day or week)
    return { days: periods, throughput: totalThroughput };
};
