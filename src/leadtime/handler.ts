import { asClass } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';
import { Calculations, ScatterplotDatum } from './calculations';
import { State } from '../workitem/state_aurora';
import { TrendAnalysis } from '../utils/trend_analysis';
import { IBoxPlot } from '../common/box_plot';
import { BaseHandler } from '../common/base_handler';
import { HandleEvent } from '../common/event_handler';
import { getTargetVariability } from '../utils/statistics';
import { HistogramDatum } from '../wip/calculations';

type EverythingV2 = {
    completedItemCount: number;
    distribution: IDistribution;
    predictability: Array<{
        itemTypeName: string;
        serviceLevelExpectationDays: number;
        serviceLevelPercent: any;
        trendAnalysis: TrendAnalysis;
    }>;
    histogram: Array<HistogramDatum>;
    scatterplot: Array<ScatterplotDatum>;
    boxPlot: IBoxPlot;
    distributionShape: string;
};

export type IDistribution = {
    minimum: number;
    maximum: number;
    modes: number[];
    average: number;
    percentile50th: number;
    percentile85th: number;
    percentile95th: number;
    percentile98th: number;
    targetForPredictability: number;
};

export const emptyDistributionFactory = (): IDistribution => ({
    minimum: 0,
    maximum: 0,
    modes: [],
    average: 0,
    percentile50th: 0,
    percentile85th: 0,
    percentile95th: 0,
    percentile98th: 0,
    targetForPredictability: 0,
});

class LeadtimeHandler extends BaseHandler {
    private calculations: Calculations;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations),
            state: asClass(State),
        });

        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
    }

    async getEverything() {
        const leadtimeResponse: EverythingV2 = {
            completedItemCount: 0,
            distribution: emptyDistributionFactory(),
            predictability: [],
            histogram: [],
            scatterplot: [],
            boxPlot: {
                median: Number.MIN_VALUE,
                quartile1st: Number.MIN_VALUE,
                quartile3rd: Number.MIN_VALUE,
                interQuartileRange: Number.MIN_VALUE,
                lowerWhisker: Number.MIN_VALUE,
                upperWhisker: Number.MIN_VALUE,
                lowerOutliers: [],
                upperOutliers: [],
            },
            distributionShape: '',
        };

        try {
            const median = await this.calculations.getPercentile(50);
            leadtimeResponse.distribution = {
                minimum: await this.calculations.getMinimum(),
                maximum: await this.calculations.getMaximum(),
                modes: await this.calculations.getModes(),
                average: await this.calculations.getAverage(),
                percentile50th: median,
                percentile85th: await this.calculations.getPercentile(85),
                percentile95th: await this.calculations.getPercentile(95),
                percentile98th: await this.calculations.getPercentile(98),
                targetForPredictability: getTargetVariability(median),
            };
            leadtimeResponse.histogram = await this.calculations.getHistogramDataV2();
            leadtimeResponse.completedItemCount = await this.calculations.getCompletedItemCount();
            leadtimeResponse.scatterplot = await this.calculations.getScatterplot();
            leadtimeResponse.predictability = await this.calculations.getPredictability();
            leadtimeResponse.boxPlot = await this.calculations.getLeadTimeBoxPlot();
            leadtimeResponse.distributionShape = await this.calculations.getShapeOfLeadTimeDistribution();
        } catch (e) {
            if (e instanceof Error) {
                console.error('Failed: ' + e.message + '\n' + e.stack);
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: e.message }),
                };
            }
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Unknown error on lead time handler' }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(leadtimeResponse),
        };
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    return HandleEvent(event, LeadtimeHandler);
};
