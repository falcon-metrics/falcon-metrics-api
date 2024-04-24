import Redis from 'ioredis';

export const createRedisClient = async (host: string, password: string) => {
    if (!(typeof host === 'string' && typeof password === 'string')) {
        throw new Error('url or password is undefined');
    }
    const isLocalHost = host.includes('localhost');
    try {
        const client = new Redis({
            host,
            password,
            // Disable TLS if localhost
            tls: isLocalHost
                ? undefined
                : {},
            // Set it to true to be able to call connect to explictly wait for a connection
            lazyConnect: true,
            retryStrategy: (times) => {
                if (times < 20) return 100;
            }
        });
        await client.connect();
        return client;
    } catch (e) {
        console.error('Error creating redis client. e: ', e);
    }
};