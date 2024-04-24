import { asClass } from 'awilix';
import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResultV2,
    ScheduledEvent,
} from 'aws-lambda';
import {
    Calculations,
    CfdDataItem,
    FlowEfficiencyAnalysis,
} from './calculations';
import {
    InOutFlowCalculations,
    InOutFlowData,
} from './in_out_flow_calculations';
import { State } from '../workitem/state_aurora';
import { BaseHandler } from '../common/base_handler';
import { SnapshotQueries } from '../workitem/snapshot_queries';
import { Snapshot } from '../workitem/snapshot_db';
import { HandleEvent } from '../common/event_handler';

type IEverything = {
    cumulativeFlowData: Array<CfdDataItem>;
    inOutFlowData: InOutFlowData;
    efficiencyAnalysisData: FlowEfficiencyAnalysis;
    timeInStateData: Array<{ state: string; totalDays: number }>;
};

class FlowEfficiencyHandler extends BaseHandler {
    private calculations: Calculations;
    private inOutCalculations: InOutFlowCalculations;
    private flowEfficiencyStartingPoint: boolean;
    private timeInStateInProgressFilterToggle: boolean;
    private timeInStateProposedFilterToggle: boolean;
    private stateTypeFilter: string;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            calculations: asClass(Calculations),
            inOutCalculations: asClass(InOutFlowCalculations),
            state: asClass(State),
            snapshot: asClass(Snapshot),
            snapshotQueries: asClass(SnapshotQueries),
        });

        this.calculations = this.dependencyInjectionContainer.cradle.calculations;
        this.inOutCalculations = this.dependencyInjectionContainer.cradle.inOutCalculations;

        const {
            flowEfficiencyStartingPoint,
            stateTypeFilter,
            timeInStateInProgressFilterToggle,
            timeInStateProposedFilterToggle,
        } = event.queryStringParameters ?? {};
        this.flowEfficiencyStartingPoint = flowEfficiencyStartingPoint
            ? JSON.parse(flowEfficiencyStartingPoint)
            : true;
        this.stateTypeFilter = stateTypeFilter ?? 'queue';
        this.timeInStateInProgressFilterToggle = timeInStateInProgressFilterToggle
            ? JSON.parse(timeInStateInProgressFilterToggle)
            : true;
        this.timeInStateProposedFilterToggle = timeInStateProposedFilterToggle
            ? JSON.parse(timeInStateProposedFilterToggle)
            : false;
    }

    async getEverything(): Promise<APIGatewayProxyResultV2> {
        console.time('FlowEfficiency.getEverything');

        const flowEfficiencyResponse: IEverything = {
            cumulativeFlowData: [],
            inOutFlowData: {},
            efficiencyAnalysisData: {
                valueAddingTimeDays: 0,
                waitingTimeDays: 0,
            },
            timeInStateData: [],
        };

        try {
            console.log('flow_efficiency has been discontinued');
            flowEfficiencyResponse.inOutFlowData = {};
            flowEfficiencyResponse.efficiencyAnalysisData = {
                valueAddingTimeDays: 0,
                waitingTimeDays: 0,
            };
            flowEfficiencyResponse.timeInStateData = [];
        } catch (e) {
            if (!(e instanceof Error)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: "Unknown error on FlowEfficiency handler" }),
                }
            }
            console.error('Failed: ' + e.message + '\n' + e.stack);
            return {
                statusCode: 400,
                body: JSON.stringify({ error: e.message }),
            };
        } finally {
            console.timeEnd('FlowEfficiency.getEverything');
        }

        return {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(flowEfficiencyResponse),
        };
    }
}

export const getEverything = async (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
) => {
    return HandleEvent(event, FlowEfficiencyHandler);
};
