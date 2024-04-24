import { asClass } from 'awilix';
import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';
import { Calculations, ScatterplotDatum } from './calculations';
import { BaseHandler } from '../../../common/base_handler';
import { HandleEvent } from '../../../common/event_handler';
import { HistogramDatum } from '../../../wip/calculations';
import { getTargetVariability } from '../../../utils/statistics';
import { State } from '../../../workitem/state_aurora';

const emptyDistributionFactory = () => ({
    minimum: 0,
    maximum: 0,
    modes: [] as number[],
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
        const leadtimeResponse = {
            distribution: emptyDistributionFactory(),
            histogram: [] as HistogramDatum[],
            scatterplot: [] as ScatterplotDatum[],
            boxPlot: {
                median: Number.MIN_VALUE,
                quartile1st: Number.MIN_VALUE,
                quartile3rd: Number.MIN_VALUE,
                interQuartileRange: Number.MIN_VALUE,
                lowerWhisker: Number.MIN_VALUE,
                upperWhisker: Number.MIN_VALUE,
                lowerOutliers: [] as number[],
                upperOutliers: [] as number[],
            },
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
            leadtimeResponse.scatterplot = (await this.calculations.getScatterplot()).map(
                addFullDatesToScatterplotDatum
            );
            leadtimeResponse.boxPlot = await this.calculations.getLeadTimeBoxPlot();
        } catch (e) {
            if (e instanceof Error) {
                console.error('Failed: ' + e.message + '\n' + e.stack);
                return {
                    statusCode: 400,
                    body: JSON.stringify({ errorMessage: e.message }),
                };
            }
            return {
                statusCode: 400,
                body: JSON.stringify({ errorMessage: 'unknown error on lead time handler' }),
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

function addFullDatesToScatterplotDatum(datum: ScatterplotDatum & {
    arrivalDate?: string;
    commitmentDate?: string;
    departureDate?: string;
}) {
    datum.arrivalDate = datum.arrivalDateNoTime.substring(0, 10);
    datum.commitmentDate = datum.commitmentDateNoTime.substring(0, 10);
    datum.departureDate = datum.departureDateNoTime.substring(0, 10);
    return datum as (ScatterplotDatum & {
        arrivalDate: string;
        commitmentDate: string;
        departureDate: string;
    });
}

