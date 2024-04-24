import { Op, Sequelize } from 'sequelize';

import { FQLFilterFactory } from '../../models/FilterModel';
import { ObeyaRoomModel } from '../../models/ObeyaRoomModel';

export type WorkItemTypeDependencies = {
    workItemType: string;
    fqlFilters: string[];
    obeyaRooms: string[];
}[];
//TODO: find the workItemTypes needed to be deleted
const getFqlDependenciesNames = async (
    workItemTypeName: string,
    datasourceId: string,
    orgId: string,
    aurora: Sequelize,
): Promise<string[]> => {
    const filterModel = FQLFilterFactory(aurora);
    const fqlFilters = await filterModel.findAll({
        where: {
            datasourceId,
            orgId,
            parsedQuery: {
                /**
                 * In SQL, to escape a quote, you use 2 single quotes
                 * So when you see the SQL query for this Sequelize query, you will see 2 single
                 * quotes.See this example below
                 * 
                 * This expression may miss the cases where 
                 * 
                 * 
                 * SELECT 
                 * "displayName" 
                 * FROM "filters" AS "filter" 
                 * WHERE 
                 * "filter"."datasourceId" = 'a1438249791932809abea8f7ac372ee0' AND 
                 * "filter"."orgId" = 'autoavaliar-tech' AND 
                 * "filter"."parsedQuery" ILIKE '%LOWER("flomatikaWorkItemTypeName") = ''bug''%' AND 
                 * "filter"."deletedAt" IS NULL;
                 */
                [Op.regexp]: `.*LOWER\\("flomatikaWorkItemTypeName"\\) = '${workItemTypeName.toLowerCase()}'.*`,
            },
            deletedAt: null,
        } as any,
        attributes: ['displayName'],
    });
    return fqlFilters.map((f) => f.displayName);
};
//TODO: check if workItemType is used in custom filters
//TODO: find the states and snapshot with the workItemTypes to be deleted

const getObeyaDependenciesNames = async (
    workItemTypeName: string,
    datasourceId: string,
    orgId: string,
    aurora: Sequelize,
): Promise<string[]> => {
    const model = ObeyaRoomModel(aurora);
    const obeyaRooms = await model.findAll({
        where: {
            orgId,
            datasourceId,
            parsedQuery: {
                /**
                 * In SQL, to escape a quote, you use 2 single quotes
                 * So when you see the SQL query for this Sequelize query, you will see 2 single
                 * quotes.See this example below
                 * 
                 * 
                 * SELECT 
                 * "displayName" 
                 * FROM "filters" AS "filter" 
                 * WHERE 
                 * "filter"."datasourceId" = 'a1438249791932809abea8f7ac372ee0' AND 
                 * "filter"."orgId" = 'autoavaliar-tech' AND 
                 * "filter"."parsedQuery" ILIKE '%LOWER("flomatikaWorkItemTypeName") = ''bug''%' AND 
                 * "filter"."deletedAt" IS NULL;
                 */
                [Op.regexp]: `.*LOWER\\("flomatikaWorkItemTypeName"\\) = '${workItemTypeName.toLowerCase()}'.*`,
            },
        },
        attributes: ['roomName'],
    });

    return obeyaRooms.map((i: any) => i.roomName);
};

export const getWorkItemTypeDependency = async (
    workItemTypeNames: string[],
    datasourceId: string,
    orgId: string,
    aurora: Sequelize,
): Promise<WorkItemTypeDependencies> => {
    const promises = workItemTypeNames.map(async (workItemTypeName) => {
        const fqlFilters = await getFqlDependenciesNames(
            workItemTypeName,
            datasourceId,
            orgId,
            aurora,
        );
        const obeyaRooms = await getObeyaDependenciesNames(
            workItemTypeName,
            datasourceId,
            orgId,
            aurora,
        );

        return {
            workItemType: workItemTypeName,
            fqlFilters,
            obeyaRooms,
        };
    });
    const dependencies = await Promise.all(promises);
    return dependencies.filter(
        ({ fqlFilters, obeyaRooms }) =>
            fqlFilters?.length || obeyaRooms?.length,
    );
};
