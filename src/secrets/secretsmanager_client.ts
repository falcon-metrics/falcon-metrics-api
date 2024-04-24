import AWS from 'aws-sdk';
import { Logger } from 'log4js';

export abstract class SecretsManagerClient {
    protected client: AWS.SecretsManager;
    protected logger: Logger;

    constructor(opts: { logger: Logger; }) {
        const clientOptions: AWS.SecretsManager.ClientConfiguration = {};

        this.logger = opts.logger;

        if (this.logger.isDebugEnabled()) {
            AWS.config.logger = this.logger;
        }

        this.client = new AWS.SecretsManager(clientOptions);
    }

    async getSecret(secretId: string, key: string): Promise<string> {
        this.logger.debug('SecretsManager fetching secret: ', secretId);

        return this.client
            .getSecretValue({ SecretId: secretId })
            .promise()
            .then((data: any) => { // eslint-disable-line
                let decodedBinarySecret: string;

                if ('SecretString' in data) {
                    // eslint-disable-next-line prettier/prettier
                    decodedBinarySecret = JSON.parse(data.SecretString)[key];
                } else {
                    const buff = new Buffer(data.SecretBinary, 'base64');
                    decodedBinarySecret = buff.toString('ascii');
                }

                return decodedBinarySecret;
            });
    }

    async getRawSecret(secretKey: string) {
        this.logger.debug('SecretsManager fetching secret with key: ', secretKey);

        const data = await this.client
            .getSecretValue({ SecretId: secretKey })
            .promise();
        let value;
        try {
            const { SecretString } = data;
            if (SecretString !== undefined) {
                const obj = JSON.parse(SecretString);
                value = obj[secretKey];
            }
        } catch (e) {
            console.error(e);
            throw new Error('Error parsing secret');
        }
        return value;
    }

    async setSecret(secretId: string, secretString: string): Promise<void> {
        let result;
        try {
            result = await this.client
                .createSecret({
                    Name: secretId,
                    SecretString: secretString,
                })
                .promise();
        } catch (e1) {
            console.log({
                message: 'Error when calling createSecret',
                errorMessage: (e1 as Error).message,
                errorStack: (e1 as Error).stack,
            });
            try {
                result = await this.client
                    .putSecretValue({
                        SecretId: secretId,
                        SecretString: secretString,
                    })
                    .promise();
            } catch (e2) {
                console.log({
                    message: 'Error when calling putSecretValue',
                    errorMessage: (e2 as Error).message,
                    errorStack: (e2 as Error).stack,
                });
                throw e2;
            }
        }
    }

    async deleteSecret(secretId: string): Promise<void> {
        this.logger.debug('SecretsManager fetching secret: ', secretId);
        try {
            await this.client
                .deleteSecret({
                    SecretId: secretId,
                    ForceDeleteWithoutRecovery: true,
                })
                .promise();
            this.logger.info(`${secretId} deleted`);
        } catch (error) {
            this.logger.error(
                `[SECRET] Failed to deleted secret: ${secretId} %o`,
                error,
            );
        }
    }
}

export interface ISecrets {
    getSecret(secretId: string, key: string): Promise<string>;
    deleteSecret(secretId: string): Promise<void>;
}
export class Secrets extends SecretsManagerClient implements ISecrets { }
