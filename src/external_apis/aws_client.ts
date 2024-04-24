import aws from 'aws-sdk';
import { DateTime } from 'luxon';
//TODO: change them to env var
const logGroupName = 'falcon-metrics/customer-telemetry';
export class AWSClient {
    private cloudWatchLogsClient: aws.CloudWatchLogs;
    private snsClient: aws.SNS;
    private topicPrefix: string;
    constructor() {
        this.cloudWatchLogsClient = new aws.CloudWatchLogs();
        let clientOptions: AWS.SNS.ClientConfiguration;
        if (process.env.IS_OFFLINE) {
            clientOptions = {
                region: 'ap-southeast-2',
                endpoint: 'http://0.0.0.0:4005',
            };
            this.topicPrefix = `arn:aws:sns:${process.env.AWS_DEFAULT_REGION! || 'ap-southeast-2'
                }:123456789012`;
        } else {
            clientOptions = {};
            this.topicPrefix = 'arn:aws:sns:ap-southeast-2:906466243975';
        }
        this.snsClient = new aws.SNS(clientOptions);
    }

    async publishToSnsTopic(message: string, topicName: string): Promise<void> {
        const params = {
            Message: message /* required */,
            TopicArn: `${this.topicPrefix}:${topicName}`,
        };
        try {
            await this.snsClient.publish(params).promise();
        } catch (err) {
            console.error(err, err.stack);
        }
    }
    async putLogsToCloudWatch(
        logStreamName: string,
        message: string,
        token?: string,
    ): Promise<void> {
        const params = {
            logEvents: [
                /* required */
                {
                    message: message /* required */,
                    timestamp: DateTime.now().toMillis() /* required */,
                },
                /* more items */
            ],
            logGroupName: logGroupName /* required */,
            logStreamName: logStreamName /* required */,
            sequenceToken: token,
        };
        try {
            await this.cloudWatchLogsClient.putLogEvents(params).promise();
        } catch (error) {
            //basically we need to retry with the token sended back from the failed request
            const errMessage = error.message;
            if (errMessage.includes('The next expected sequenceToken is:')) {
                const token = errMessage.split(' ').slice(-1).pop(); //the token is the last word
                // token = parseInt(token);
                await this.putLogsToCloudWatch(
                    logStreamName,
                    message,
                    token.toString(),
                );
            } else {
                console.log(errMessage);
            }
        }
    }
}
