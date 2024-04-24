import crypto from 'crypto';
import { QueryTypes, Sequelize, Model } from 'sequelize';
import { getLogger, Logger } from 'log4js';
import _ from 'lodash';
import { Redis } from 'ioredis';

// Function from MDN 
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#examples
function getCircularReplacer() {
    const ancestors: any[] = [];
    return function (key: any, value: any) {
        if (typeof value !== "object" || value === null) {
            return value;
        }
        // `this` is the object that value is contained in,
        // i.e., its direct parent.
        // @ts-ignore
        while (ancestors.length > 0 && _.at(ancestors, -1) !== this) {
            ancestors.pop();
        }
        if (ancestors.includes(value)) {
            return "[Circular]";
        }
        ancestors.push(value);
        return value;
    };
}


export enum ModelNames {
    CWIMS = 'contextWorkItemMaps',
    STATES = 'states',
    FILTERS = 'filters',
    CONTEXTS = 'contexts',
    SETTINGS = 'settings',
    PROJECTS = 'projects',
};


export class Cacher {
    method: string;
    options: {};
    seconds: number;
    cacheHit: boolean;
    cachePrefix: string;
    sequelize: Sequelize;
    redis: Redis | undefined;
    md: any;
    modelName: any;
    logger: Logger;
    private _orgId?: string;



    constructor(seq: Sequelize, red: Redis | undefined) {
        this.method = 'find';
        this.options = {};
        // 5 mins cache interval by default
        this.seconds = 300;
        this.cacheHit = false;
        this.cachePrefix = `cacher`;
        this.sequelize = seq;
        this.redis = red;
        this.logger = getLogger();
    }

    static jsonReplacer(key: any, value: { DAO: any; sequelize: any; name: any; }) {
        if (value && (value.DAO || value.sequelize)) {
            return value.name || '';
        }
        return value;
    }

    model(model: Model, modelName: ModelNames, orgId: string) {
        if (!orgId) throw new Error('orgId is undefined');
        if (!modelName) throw new Error('modelName is undefined');
        if (!model) throw new Error('model is undefined');

        this._orgId = orgId;
        this.md = model;
        this.modelName = modelName;
        return this;
    }

    prefix(cachePrefix: any) {
        this.cachePrefix = cachePrefix;
        return this;
    }

    orgId(orgId: string) {
        this._orgId = orgId;
        return this;
    }

    getPrefix() {
        if (!this._orgId) throw new Error('orgId not set');
        return `cacher:${this._orgId}`;
    }

    async getValueFromCache(key: string) {
        if (this.redis?.status !== 'ready') {
            console.error('Redis client not ready');
            return null;
        }
        return this.redis.get(key);
    }

    async run(options: any) {
        this.options = options || this.options;
        return this.fetchFromCache();
    }

    async query(sql: any, options: any) {
        return this.rawFromCache(sql, options);
    }

    async rawFromCache(sql: any, options: any) {
        const key = this.key(sql);
        let res = await this.getValueFromCache(key);

        if (!res) {
            const result = await this.rawFromDatabase(key, sql, options);
            return result;
        }

        console.info(JSON.stringify({ message: '[Cacher] Cache hit', key }));

        this.cacheHit = true;
        return JSON.parse(res);
    }

    async rawFromDatabase(key: string, sql: any, options: any) {
        const results = await this.sequelize.query(sql, { type: QueryTypes.SELECT });
        let res: any[] = [];

        if (Array.isArray(results)) {
            // The dates have to be converted to strings
            res = JSON.parse(JSON.stringify(results));
            await this.setCache(key, res, this.seconds);
        } else {
            console.error(`Expected array type. But got ${typeof results}. results: ${JSON.stringify(results)}`);
        }

        return res;
    }

    ttl(seconds: number) {
        this.seconds = seconds;
        return this;
    }

    async fetchFromDatabase(key: string) {
        const method = this.md[this.method];
        this.cacheHit = false;

        if (!method) {
            throw new Error(`Invalid method - ${this.method}`);
        }

        const results = await method.call(this.md, this.options);
        let res;
        if (!results) {
            res = results;
        } else if (Array.isArray(results)) {
            res = results.map(r => {
                if (r.toJSON) {
                    return r.toJSON();
                }
                return r;
            });
        } else if (results.toString() === '[object SequelizeInstance]') {
            res = results.get({ plain: true });
        } else if (results.toJSON) {
            res = results.toJSON();
        } else {
            res = results;
        }

        await this.setCache(key, res, this.seconds);
        return res;
    }

    async setCache(key: string, results: any, ttl: number) {
        const res = JSON.stringify(results);
        if (typeof ttl === 'number') {
            await this.redis?.set(key, res, 'EX', ttl);
            return;
        }
        await this.redis?.set(key, res);
    }

    async clearCache(opts: any) {
        this.options = opts || this.options;
        const key = this.key();
        await this.redis?.del(key);
    }

    async fetchFromCache() {
        const key = this.key();
        const res = await this.getValueFromCache(key);
        if (res === null) {
            return this.fetchFromDatabase(key);
        }
        this.cacheHit = true;
        console.info(JSON.stringify({ message: '[Cacher] Cache hit', key }));
        return JSON.parse(res);
    }

    key(sql?: string) {
        let hash = null;
        if (sql) {
            hash = crypto.createHash('sha1').update(sql).digest('hex');
            return [this.getPrefix(), '__raw__', 'query', hash].join(':');
        }

        hash = crypto.createHash('sha1').update(JSON.stringify(this.options)).digest('hex');
        return [this.getPrefix(), this.modelName, this.method, hash].join(':');
    }


    // New methods added as regular class methods
    async find(options: any) {
        this.method = 'find';
        return this.run(options);
    }

    async findOne(options: any) {
        this.method = 'findOne';
        return this.run(options);
    }

    async findAll(options: any) {
        this.method = 'findAll';
        return this.run(options);
    }

    async findAndCount(options: any) {
        this.method = 'findAndCount';
        return this.run(options);
    }

    async findAndCountAll(options: any) {
        this.method = 'findAndCountAll';
        return this.run(options);
    }

    async all(options: any) {
        this.method = 'all';
        return this.run(options);
    }

    async min(options: any) {
        this.method = 'min';
        return this.run(options);
    }

    async max(options: any) {
        this.method = 'max';
        return this.run(options);
    }

    async sum(options: any) {
        this.method = 'sum';
        return this.run(options);
    }

    async count(options: any) {
        this.method = 'count';
        return this.run(options);
    }
}
