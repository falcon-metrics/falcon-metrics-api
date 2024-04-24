import { APIGatewayProxyEventV2, SNSEvent } from 'aws-lambda';
import { DatadogClient } from '../../external_apis/datadog_client';
import { processTelemetry } from '../processors/telemetry_processor';
import {
    sendToDatadogLogs,
    sendToDatadogMetrics,
} from '../sns_consumers/datadog_consumer';
import { sendToSlack } from '../sns_consumers/slack_consumer';
import { Actions, TelemetryMessage, User, Feature } from '../types';
export const slackConsumerHandler = async (event: SNSEvent) => {
    const message = JSON.parse(event.Records[0].Sns.Message) as unknown;
    try {
        const { user, action, detail } = message as TelemetryMessage;
        await sendToSlack(user, action, detail);
    } catch (error) {
        console.error(error);
    }

};
export const datadogConsumerHandler = async (event: SNSEvent) => {
    const message = JSON.parse(event.Records[0].Sns.Message) as unknown;
    try {
        const datadog = new DatadogClient();
        await sendToDatadogLogs(message as TelemetryMessage, datadog);
        await sendToDatadogMetrics(message as TelemetryMessage, datadog);
    } catch (error) {
        console.error(error);
    }

};

export const processHandler = async (event: APIGatewayProxyEventV2) => {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                errorMessage: 'No telemetry info included',
            }),
        };
    }
    const data = JSON.parse(event.body);
    let user: User;
    let action: Actions;
    let detail: string;
    let feature: Feature;
    try {
        user = data.user as User;
        action = data.action as Actions;
        detail = data.detail;
        feature = data.feature as Feature;
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify(error),
        };
    }
    try {
        await processTelemetry(user, action, detail, feature);
        return {
            statusCode: 200,
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify(error.error),
        };
    }
};
