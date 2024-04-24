import { AWSClient } from '../../external_apis/aws_client';
import { Actions, Feature, TelemetryMessage, User } from '../types';

export type CustomerAction = {
    emoji: string;
    logStreamName: string;
};

const awsClient = new AWSClient();
const telemetryTopic = 'falcon-metrics-customer-telemetry';
//send to an SNS topic
const publishToSNS = async (message: TelemetryMessage) => {
    await awsClient.publishToSnsTopic(JSON.stringify(message), telemetryTopic);
};
export const processTelemetry = async (
    user: User,
    action: Actions,
    detail: string,
    feature?: Feature,
): Promise<void> => {
    await publishToSNS({ user, action, detail, feature });
};
