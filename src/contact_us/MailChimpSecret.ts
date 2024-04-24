import { SecretsManagerClient } from '../secrets/secretsmanager_client';

const SECRET_NAME = 'integrations/mailchimp';
const KEY = 'api_key';

export default class MailChimpSecret extends SecretsManagerClient {
    async getApiKey(): Promise<string> {
        if (process.env.NODE_ENV === 'production') {
            const apiKey = await this.getSecret(SECRET_NAME, KEY);
            return apiKey;
        } else {
            return process.env.MAILCHIMP_SECRET || '';
        }
    }
}
