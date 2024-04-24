import AWS, { EventBridge } from "aws-sdk";

AWS.config.update({
    accessKeyId: process.env.PROD_API_USER_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.PROD_API_USER_AWS_SECRET_ACCESS_KEY,
});

/**
 * Send an event to event bridge. Payload is optional. 
 * 
 * If a payload is not provided, {} is used as Detail
 */
export const sendEvent = async (Source: string, payload: Record<string, any> = {}) => {
    try {
        const eventbridge = new EventBridge();
        const Detail = JSON.stringify(payload);
        const result = await eventbridge.putEvents({
            Entries: [
                {
                    Source,
                    DetailType: 'test',
                    Detail
                }
            ]
        }).promise();
        if (result.FailedEntryCount && result.FailedEntryCount > 0) {
            console.log('putEvents result : %o', result);
            throw new Error('putEvents failed. Check logs for details');
        }
    } catch (e) {
        throw e;
    }
};
