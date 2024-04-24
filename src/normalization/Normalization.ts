import { flatten, pick } from 'lodash';
import { literal, Op, Sequelize, WhereOptions } from 'sequelize';
import pgp from 'pg-promise';
import { PredefinedFilterTags } from '../common/filters_v2';
import { getDeletedAtFilterCondition } from '../datasources/delete/delete_functions';
import FilterModel, {
    FQLFilterAttributes,
    FQLFilterModel,
    FQLFilterStatic,
} from '../models/FilterModel';
import { StateModel } from '../models/StateModel';
import { isDefined } from '../utils/typescript';

export type NormalizationQueryParam = Record<string, string[]>;
export class Normalization {
    private aurora: Promise<Sequelize>;
    private orgId: string;
    private cache: Map<string, any> = new Map();

    constructor(opts: {
        aurora: Promise<Sequelize>;
        security: {
            organisation: string;
        };
    }) {
        this.aurora = opts.aurora;
        this.orgId = opts.security.organisation!;
    }

    private extractNormalizationTags = (tags: string) => {
        const splittedTags = tags.split(', ');
        return splittedTags.filter(
            (t) => t !== PredefinedFilterTags.NORMALISATION,
        )[0];
    };

    async getConfiguredCategories() {
        const filterModel = await FilterModel(await this.aurora);

        const filters = await filterModel.findAll({
            group: ['tags'],
            attributes: ['tags'],
            where: getDeletedAtFilterCondition({
                orgId: this.orgId,
                tags: {
                    [Op.like]: '%' + PredefinedFilterTags.NORMALISATION + '%',
                },
            }),
        });

        const categories = filters.reduce((result, { tags }) => {
            result = result.concat(this.extractNormalizationTags(tags));
            return result;
        }, [] as string[]);
        return [...new Set(categories)];
    }

    async getFilterColors() {
        const filterModel = await FilterModel(await this.aurora);
        return filterModel.findAll({
            attributes: ['colorHex', 'tags', 'displayName'],
            where: getDeletedAtFilterCondition({
                orgId: this.orgId,
            }),
        });
    }

    async getFilters() {
        const filterModel = await FilterModel(await this.aurora);
        const result = await filterModel.findAll({
            attributes: ['tags', 'displayName'],
            where: getDeletedAtFilterCondition({
                orgId: this.orgId,
            }),
        });

        return result.map(({ displayName, tags }) => ({
            displayName,
            category: this.extractNormalizationTags(tags),
        }));
    }

    async generateFilterQueries(queryParameters?: NormalizationQueryParam) {
        if (!queryParameters) {
            return {};
        }
        const aurora = await this.aurora;
        const filterModel = await FilterModel(aurora);
        const categories = Object.keys(queryParameters);
        const conditionPromises = categories?.map((category) =>
            this.getParsedFQLQueries(category, queryParameters, filterModel),
        );

        const queries = await Promise.all(
            conditionPromises,
        ).then((conditions) => conditions.filter(isDefined));

        const flatQueries: any = flatten(queries);

        //TODO find a way to do this through subquery
        const stateModel = StateModel(aurora);
        const result = ((await stateModel.findAll({
            attributes: ['workItemId'],
            where: {
                partitionKey: `state#${this.orgId}`,
                [Op.and]: flatQueries,
            },
        })) as unknown) as { workItemId: string; }[];

        const ids = result.map(({ workItemId }) => workItemId);

        return { workItemId: { [Op.in]: ids } } as WhereOptions<any>;
    }

    private getParsedFQLQueries = async (
        category: string,
        queryParameters: NormalizationQueryParam,
        filterModel: FQLFilterStatic,
    ) => {
        const ids = queryParameters[category];
        const attributesOfGroup = ['orgId', 'datasourceId', 'tags'];
        const filters = await filterModel.findAll({
            where: getDeletedAtFilterCondition({
                id: { [Op.in]: ids },
            }),
            attributes: ['parsedQuery', ...attributesOfGroup],
        });
        if (!filters.length) {
            return;
        }
        const attributesForFiltering = pick(filters[0], attributesOfGroup);
        const queriesToInclude = {
            [Op.or]: filters.map(({ parsedQuery }) => literal(parsedQuery)),
        };

        // Must exclude values that fulfill conditions of other filters in the same category
        const queriesToExclude = await this.getQueriesToExclude(
            filterModel,
            attributesForFiltering,
            ids,
        );

        return [queriesToInclude, ...queriesToExclude];
    };

    private async getQueriesToExclude(
        model: FQLFilterStatic,
        attributesForFiltering: Partial<FQLFilterModel>,
        ids: string[],
    ) {
        const where = {
            ...attributesForFiltering,
            id: { [Op.notIn]: ids },
        };
        const otherFiltersSameCategory = await model.findAll({
            where: where as WhereOptions<any>,
            attributes: ['parsedQuery'],
        });
        return otherFiltersSameCategory.map(({ parsedQuery }) =>
            literal(`NOT (${parsedQuery})`),
        );
    }

    /**
     * Generates SQL predicates for normalizations.
     * @param queryParameters Normalization query paramters.
     */
    async generateFilterQueriesSQL(
        queryParameters?: NormalizationQueryParam,
    ): Promise<string[]> {
        if (!queryParameters) {
            return [];
        }

        const cacheKey = `generateFilterQueriesSQL#${JSON.stringify(queryParameters)}`;

        let categoriesPredicates: Array<string[]>;

        if (this.cache.has(cacheKey)) {
            categoriesPredicates = await this.cache.get(cacheKey);
        } else {
            const fn = async () => {
                const aurora = await this.aurora;
                const filterModel = await FilterModel(aurora);

                const categories = Object.keys(queryParameters);
                const categoriesPredicatesPromise = categories?.map((category) =>
                    this.getParsedFQLQueriesSQL(category, queryParameters, filterModel),
                );
                return Promise.all(
                    categoriesPredicatesPromise,
                );
            };
            const promise = fn();
            this.cache.set(cacheKey, promise);
            categoriesPredicates = await promise;
        }


        const validPredicates = categoriesPredicates.filter(isDefined);
        const allPredicates: string[] = flatten(validPredicates);

        return allPredicates;
    }

    private getParsedFQLQueriesSQL = async (
        category: string,
        queryParameters: NormalizationQueryParam,
        filterModel: FQLFilterStatic,
    ): Promise<string[]> => {
        const ids = queryParameters[category];
        const attributesOfGroup = ['orgId', 'datasourceId', 'tags'];

        const whereClause: WhereOptions<FQLFilterAttributes> = {
            id: { [Op.in]: ids },
        } as any;
        const filters = await filterModel.findAll({
            where: getDeletedAtFilterCondition(whereClause) as any,
            attributes: ['parsedQuery', ...attributesOfGroup],
        });
        if (!filters.length) {
            return [];
        }

        const inclusionPredicates: string[] = filters.map(
            ({ parsedQuery }) => parsedQuery,
        );
        const inclusionConditions: string[] =
            inclusionPredicates.length > 0
                ? [inclusionPredicates.join('\nOR ')]
                : [];

        // Must exclude values that fulfill conditions of other filters in the same category
        const attributesForFiltering = pick(filters[0], attributesOfGroup);
        const exclusionConditions = await this.getQueriesToExcludeSQL(
            filterModel,
            attributesForFiltering,
            ids,
        );

        return [...inclusionConditions, ...exclusionConditions];
    };

    private async getQueriesToExcludeSQL(
        model: FQLFilterStatic,
        attributesForFiltering: Partial<FQLFilterModel>,
        ids: string[],
    ): Promise<string[]> {
        const whereClause: WhereOptions<FQLFilterAttributes> = {
            ...attributesForFiltering,
            id: { [Op.notIn]: ids },
        } as any;
        const otherFiltersSameCategory = await model.findAll({
            where: getDeletedAtFilterCondition(whereClause) as any,
            attributes: ['parsedQuery'],
        });

        const exclusionPredicates: string[] = otherFiltersSameCategory.map(
            ({ parsedQuery }) =>
                pgp.as.format('NOT ($<parsedQuery:raw>)', { parsedQuery }),
        );

        return exclusionPredicates;
    }
}
