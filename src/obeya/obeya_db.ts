import { Interval } from 'luxon';
import { QueryTypes, Sequelize } from 'sequelize';
import {
    FlomatikaWorkItemTypeLevel,
    ItemCompletedEachContext,
} from './predictive_analysis/types/types';

export interface IObeyaDb {
    getCompletedItemsEachDayByContext(
        orgId: string,
        contextIds: string[],
        dateRange: Interval,
        flomatikaWorkItemLevels?: FlomatikaWorkItemTypeLevel[],
    ): Promise<ItemCompletedEachContext[]>;
}

//TODO: move all obeya specific db request to here, ie. the ones with sql queries
export class ObeyaDb {
    private aurora: Promise<Sequelize>;
    constructor(opts: { aurora: Promise<Sequelize> }) {
        this.aurora = opts.aurora;
    }
    private flomatikaWorkItemLevelFilter(
        flomatikaWorkItemTypeLevels: FlomatikaWorkItemTypeLevel[],
    ) {
        return `s."flomatikaWorkItemTypeLevel"
        in (${flomatikaWorkItemTypeLevels.map(
            (workItemTypeLevel) => "'" + workItemTypeLevel + "'",
        )})`;
    }
    async getCompletedItemsEachDayByContext(
        orgId: string,
        contextIds: string[],
        dateRange: Interval,
        flomatikaWorkItemTypeLevels?: FlomatikaWorkItemTypeLevel[],
    ): Promise<ItemCompletedEachContext[]> {
        const aurora = await this.aurora;
        const query = `
        -- BEGIN getCompletedItemsEachDayByContext
        SELECT d.dt as date, cs."contextId", COALESCE(cs.count,0) as "itemCompleted"
        from
        (
            SELECT dt::date 
            FROM generate_series('${dateRange.start.toISODate()}', '${dateRange.end.toISODate()}', '1 day'::interval) dt
        ) d
        LEFT JOIN 
        (
            SELECT  s."departureDate"::date as "departureDate", cw."contextId" as "contextId", count(DISTINCT(s."workItemId")) as count from
                states s 
                JOIN "contextWorkItemMaps" cw
                ON cw."workItemId" = s."workItemId"
                JOIN contexts c ON c."contextId" = cw."contextId"
            WHERE cw."contextId" in (${contextIds.map(
                (contextId) => "'" + contextId + "'",
            )})
            
            AND s."stateCategory" = 'completed'
            AND s."departureDate"::date between '${dateRange.start.toISODate()}' and '${dateRange.end.toISODate()}' 
            AND s."partitionKey" = 'state#${orgId}'
            AND c."archived" is not true
            ${
                flomatikaWorkItemTypeLevels &&
                flomatikaWorkItemTypeLevels.length
                    ? 'AND ' +
                      this.flomatikaWorkItemLevelFilter(
                          flomatikaWorkItemTypeLevels,
                      )
                    : ''
            }
            GROUP BY 1,2
            ORDER BY 1,2
        ) cs 
        ON d.dt = cs."departureDate" 
        -- END getCompletedItemsEachDayByContext`;
        const result: Array<ItemCompletedEachContext> = await aurora.query(
            query,
            {
                replacements: {
                    orgId,
                },
                type: QueryTypes.SELECT,
            },
        );
        return result;
    }
}
