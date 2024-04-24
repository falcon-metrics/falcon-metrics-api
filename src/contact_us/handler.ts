import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import MailChimpSecret from './MailChimpSecret';
import { getLogger } from 'log4js';
const mailChimpSecret = new MailChimpSecret({ logger: getLogger() });
const mailchimpGetter = require('@mailchimp/mailchimp_transactional');

class ContactUsHandler extends BaseHandler {
    constructor(event: APIGatewayProxyEventV2) {
        super(event, {});
    }

    async sendMessage(event: APIGatewayProxyEventV2) {
        const { body } = event;

        const secret = await mailChimpSecret.getApiKey();
        const mailchimp = mailchimpGetter(secret);
        try {
            const data: { message?: string; from?: string; } = body
                ? JSON.parse(body)
                : { message: null, from: null };

            const result = await mailchimp.messages.send({
                message: {
                    from_email: data.from,
                    subject: 'Contact to Subscribe',
                    html: `<p>${data.message}</p>`,
                    to: [
                        {
                            email: 'support@falcon-metrics.com',
                            type: 'to',
                        },
                    ],
                },
            });

            if (result?.response?.data?.status === 'error') {
                return {
                    statusCode: 500,
                    body: result?.response?.data?.message,
                };
            }

            return {
                statusCode: 200,
                body: JSON.stringify(result),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify(error?.response?.data?.message),
            };
        }
    }
}

export const sendMessage = async (event: APIGatewayProxyEventV2) => {
    return await new ContactUsHandler(event).sendMessage(event);
};
