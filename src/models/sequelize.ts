import { Sequelize, Options } from 'sequelize';
import { getLogger } from 'log4js';
import { AuroraSecret } from '../secrets/aurora_secret';
import pg from 'pg';

// Cached sequelize client to avoid duplicated connections on localhost (unused in production) (improves connection performance)
let pastSequelize: any = null;

export const database = (host: string, password: string): Sequelize => {
    const port = process.env.POSTGRES_PORT_OVERWRITE ? parseInt(process.env.POSTGRES_PORT_OVERWRITE, 10) : 5432;
    const debugging = process.env.LOCAL_DEBUG?.toLowerCase() === 'true';
    const opt: Options = {
        dialect: 'postgres',
        username: process.env.POSTGRES_USERNAME_OVERWRITE || 'postgres',
        password: process.env.POSTGRES_PASSWORD_OVERWRITE || password,
        host: host,
        port,
        database: 'postgres',
        logging: console.log,
        benchmark: true,
        dialectModule: pg,
    };

    // Failsafe sequelize is a mode that reconnects the database a few times on timeout
    // to make sure it is not a transient db failure such as wifi change.
    if (process.env.FAILSAFE_SEQUELIZE === 'yes') {
        const sequelize = createTimeoutFailsafeDatabaseConnection(opt);

        if (pastSequelize) {
            return pastSequelize as Sequelize;
        }
        pastSequelize = sequelize;

        return sequelize;
    } else {
        return new Sequelize(opt);
    }
};

function createTimeoutFailsafeDatabaseConnection(opt: any) {
    const currentState: any = {
        client: null,
        originalQuery: () => { },
        depth: 0,
    };

    function handleSequelizeQueryFailed(err: any, argList: any, resolve: any, reject: any) {
        if (err && err.message && err.message.toString().includes('ETIMEDOUT')) {
            // console.log('\t[[', currentState.depth, ']] sequelize.ts - Db connection being recreated after timeout');
            if (currentState.depth > 10) {
                throw new Error('Database timeout after 10 tries');
            }
            replaceSequelize();
            currentState.originalQuery.apply(currentState.client, argList).then(
                resolve,
                (err: any) => handleSequelizeQueryFailed(err, argList, resolve, reject)
            ).catch((err: any) => handleSequelizeQueryFailed(err, argList, resolve, reject));
        } else {
            // Unhandled errors are rejected as normal
            reject(err);
        }
    }

    function processSequelizeQuery(...args: any) {
        return new Promise((resolve, reject) => {
            currentState.originalQuery.apply(currentState.client, args).then(
                resolve,
                (err: any) => handleSequelizeQueryFailed(err, args, resolve, reject)
            ).catch((err: any) => handleSequelizeQueryFailed(err, args, resolve, reject));
        });
    }

    function replaceSequelize() {
        const client = currentState.client = new Sequelize(opt);

        currentState.depth = currentState.depth + 1;

        currentState.originalQuery = currentState.client.query.bind(currentState.client);

        currentState.client.query = processSequelizeQuery;

        return client;
    }

    const sequelize = replaceSequelize();

    return sequelize;
}

async function sequelize(): Promise<Sequelize> {
    const logger = getLogger();
    const secret = new AuroraSecret({ logger });
    const password = await secret.getPassword();
    const host = await secret.getReaderHost();
    return database(host!, password!);
}

export async function writerConnection(): Promise<Sequelize> {
    const logger = getLogger();
    const secret = new AuroraSecret({ logger });
    const password = await secret.getPassword();
    const host = await secret.getWriterHost();

    return database(host!, password!);
}

export default sequelize;
