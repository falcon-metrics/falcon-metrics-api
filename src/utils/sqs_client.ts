import AWS, { AWSError } from 'aws-sdk';
import { Logger } from 'log4js';
export const QueueName = {
    'process-revisions': 'ProcessRevisionQueue',
    'initiative-context-workitem-mapping': 'InitiativeContextWorkItemsMappingQueue.fifo',
};
export const enum QueueType {
    PROCESS_REVISIONS = 'process-revisions',
    INITIATIVE_CONTEXT_WORKITEM_MAPPING = 'initiative-context-workitem-mapping',
}
export interface ISqsClient {
    sendMessageToQueueByDatasourceType(
        datasourceType: QueueType,
        s3Key: string,
    ): Promise<AWS.SQS.SendMessageResult>;
    sendMessageToQueue(
        queueName: string,
        message: any,
    ): Promise<AWS.SQS.SendMessageResult>;
    sendMessageToFIFOQueue(
        queueName: string,
        message: any,
        /**
         * From AWS documentation
         * 
         * This required field enables multiple message groups within a single queue. 
         * If you do not need this functionality, provide the same MessageGroupId value 
         * for all messages. Messages within a single group are processed in a FIFO fashion.
         */
        messageGroupId: string,
    ): Promise<AWS.SQS.SendMessageResult>;
}
export class SqsClient implements ISqsClient {
    private sqs: AWS.SQS;
    private logger: Logger;
    private queuePrefix: string;
    constructor(opts: { logger: Logger; }) {
        this.logger = opts.logger;
        this.sqs = new AWS.SQS();
        this.queuePrefix = process.env.IS_OFFLINE
            ? 'http://localhost:9324/queue'
            : 'https://sqs.ap-southeast-2.amazonaws.com/906466243975';
    }
    private getQueueName(queueType: QueueType): string {
        return QueueName[queueType];
    }
    private sendMessageWrapper(
        sqs: AWS.SQS,
        params: AWS.SQS.SendMessageRequest,
    ): Promise<AWS.SQS.SendMessageResult> {
        return new Promise((resolve, reject) => {
            sqs.sendMessage(params, function (err, data) {
                if (err) reject(err);
                if (data) resolve(data);
            });
        });
    }
    /**
     * A generic send to queue with custom queue name
     * @param queueName
     * @param message
     * @returns
     */
    async sendMessageToQueue(queueName: string, message: any) {
        const params = {
            MessageBody: JSON.stringify(message),
            QueueUrl: `${this.queuePrefix}/${queueName}`,
        };
        try {
            return await this.sendMessageWrapper(this.sqs, params);
        } catch (error) {
            const awsError = error as AWSError;
            throw Error(
                `Error when sending message ${JSON.stringify(params)}, ${awsError.message
                }`,
            );
        }
    }
    /**
     * Send a message to a FIFO queue
     */
    async sendMessageToFIFOQueue(
        queueName: string,
        message: any,
        /**
         * From AWS documentation
         * 
         * This required field enables multiple message groups within a single queue. 
         * If you do not need this functionality, provide the same MessageGroupId value 
         * for all messages. Messages within a single group are processed in a FIFO fashion.
         */
        messageGroupId: string,
    ) {
        const params = {
            MessageBody: JSON.stringify(message),
            QueueUrl: `${this.queuePrefix}/${queueName}`,
            MessageGroupId: messageGroupId
        };
        try {
            return await this.sendMessageWrapper(this.sqs, params);
        } catch (error) {
            const awsError = error as AWSError;
            throw Error(
                `Error when sending message ${JSON.stringify(params)}, ${awsError.message
                }`,
            );
        }
    }
    /**
     * A specific send to queue message for datasource
     * @param datasourceType
     * @param s3Key
     * @returns void
     */
    async sendMessageToQueueByDatasourceType(
        datasourceType: QueueType,
        s3Key: string,
    ): Promise<AWS.SQS.SendMessageResult> {
        const queueName = this.getQueueName(datasourceType);
        console.log("🚀 ~ file: sqs_client.ts:120 ~ SqsClient ~ queueName:", queueName);
        const message = {
            s3Key,
        };

        const params = {
            MessageBody: JSON.stringify(message),
            QueueUrl: `${this.queuePrefix}/${queueName}`,
        };
        try {
            return await this.sendMessageWrapper(this.sqs, params);
        } catch (error) {
            const awsError = error as AWSError;
            throw Error(
                `Error when sending message ${JSON.stringify(params)}, ${awsError.message
                }`,
            );
        }
    }
}
