import { SecretsManagerClient } from '../secrets/secretsmanager_client';

const API_KEY_SECRET = 'integrations/hubspot';

export interface IHubspotSecret {
    getApiKey(): Promise<string | undefined>;
}

export class HubspotSecret
    extends SecretsManagerClient
    implements IHubspotSecret {
    async getApiKey(): Promise<string | undefined> {
        if (process.env.NODE_ENV === 'production') {
            const apiKey = await this.getSecret(API_KEY_SECRET, 'api_key');
            return apiKey;
        } else {
            console.log(
                'process.env.HUBSPOT_API_KEY: ',
                process.env.HUBSPOT_API_KEY,
            );
            return process.env.HUBSPOT_API_KEY;
        }
    }
}
