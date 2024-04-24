import { SecretsManagerClient } from './secretsmanager_client';

const DATABASE_HOST_SECRET_PREFIX = 'database-host-reader-secret';
const DATABASE_READ_ONLY_HOST_SECRET_PREFIX = 'database-host-read-only-secret';
const HOST_KEY = 'host';
const RDS_PROXY = 'rds_proxy';
const HEIMDALL_PROXY = 'heimdall_proxy';
const PASSWORD_KEY = 'password';

export interface IAuroraSecret {
    getReaderHost(): Promise<string | undefined>;
    getWriterHost(): Promise<string | undefined>;
    getPassword(): Promise<string | undefined>;
}

export class AuroraSecret
    extends SecretsManagerClient
    implements IAuroraSecret {
    ///uses the read/write endpoint
    async getWriterHost(): Promise<string | undefined> {
        this.logger.trace(
            'AuroraSecret retrieving host secret: %s',
            DATABASE_HOST_SECRET_PREFIX,
        );

        let host;

        if (process.env.LOCAL_DATABASE_CREDENTIALS === 'true') {
            host = process.env.DATABASE_HOST;
        } else {
            //"getting read/write host from secret manager"
            host = await this.getSecret(
                DATABASE_HOST_SECRET_PREFIX,
                HEIMDALL_PROXY
            );
        }

        return host;
    }
    //// uses the read only proxy endpoint
    async getReaderHost(): Promise<string | undefined> {
        this.logger.trace(
            'AuroraSecret retrieving read-only host secret: %s',
            DATABASE_READ_ONLY_HOST_SECRET_PREFIX,
        );

        let host;

        if (process.env.LOCAL_DATABASE_CREDENTIALS === 'true') {
            host = process.env.DATABASE_HOST; //read only host endpoint is a proxy endpoint, meaning we can only use inside the vpc
            if (process.env.IS_REMOTE_VM === 'true') {
                host = process.env.DATABASE_READ_ONLY_HOST;
            }
        } else {
            host = await this.getSecret(
                DATABASE_READ_ONLY_HOST_SECRET_PREFIX,
                HEIMDALL_PROXY,
            );
        }

        return host;
    }

    async getPassword(): Promise<string | undefined> {
        this.logger.trace(
            'AuroraSecret retrieving password secret: %s',
            DATABASE_HOST_SECRET_PREFIX,
        );

        let password;

        if (process.env.LOCAL_DATABASE_CREDENTIALS === 'true') {
            password = process.env.DATABASE_PASSWORD;
        } else {
            password = await this.getSecret(
                DATABASE_HOST_SECRET_PREFIX,
                PASSWORD_KEY,
            );
        }

        return password;
    }
}
