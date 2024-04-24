import { DateTime } from 'luxon';
import pgp from 'pg-promise';

const format = pgp.as.format;
export const buildQuery = ({
    orgId,
    contextIds,
    workItemIds,
    startFlowEfficiencyDate,
    endFlowEfficiencyDate,
    excludeWeekends,
    timezone,
    predicates,
    includeArrivalPointToFlowEfficiency = false,
}: {
    orgId: string,
    contextIds: string[],
    workItemIds?: string[],
    includeArrivalPointToFlowEfficiency?: boolean,
    startFlowEfficiencyDate: DateTime,
    endFlowEfficiencyDate: DateTime,
    timezone: string,
    excludeWeekends: boolean,
    predicates: string[];
}) => {
    const isolatedPredicates: string[] = predicates.map(
        (predicate) => `(${predicate})`,
    );

    const jointPredicates: string = isolatedPredicates.join('\nAND ');
    const whereClause: string =
        predicates.length > 0 ? `WHERE ${jointPredicates}` : '';

    const query = format(
        `with state_items as (
        SELECT
        distinct on (states."workItemId")
        states."id"::integer,
        states."partitionKey",
        states."sortKey",
        states."flomatikaWorkItemTypeId",
        states."flomatikaWorkItemTypeLevel",
        states."flomatikaWorkItemTypeName",
        states."workItemId",
        states."title",
        states."workItemType",
        states."state",
        states."stateCategory",
        states."stateType",
        states."stateOrder",
        states."assignedTo",
        states."flomatikaWorkItemTypeServiceLevelExpectationInDays",
        states."changedDate",
        states."arrivalDate",
        states."commitmentDate",
        states."departureDate",
        states."flomatikaCreatedDate",
        states."createdAt",
        states."updatedAt",
        states."classOfServiceId",
        states."natureOfWorkId",
        states."valueAreaId",
        states."parentId",
        states."customFields",
        states."projectId",
        states."datasourceid",
        states."deletedAt",
        states."orgId",
        states."linkedItems",
        states."isDelayed",
        states."stepCategory",
        states."resolution",
        states."flagged"
    FROM states
        INNER JOIN "contextWorkItemMaps" ON
            "contextWorkItemMaps"."workItemId" = states."workItemId"
            AND "contextWorkItemMaps"."contextId" = ANY($<contextIds>)
        WHERE
            states."partitionKey" = 'state#' || $<orgId>
            AND ($<workItemIds> IS NULL OR states."workItemId" = ANY($<workItemIds>))
    ),flow_efficiency_events AS (
        SELECT
            ROW_NUMBER() OVER (
                ORDER BY
                    snapshots."workItemId",
                    snapshots."flomatikaSnapshotDate"
            ) AS "row_number",
            snapshots."workItemId",
            snapshots."flomatikaSnapshotDate" AT TIME ZONE $<timezone> AS "formattedDate",
            snapshots."stateType",
            snapshots."stepCategory",
            snapshots."flagged",
            snapshots."stateCategory"
        FROM
            snapshots
        WHERE
            snapshots."partitionKey" = 'snapshot#' || $<orgId>
            AND snapshots."type" in ('state_change','flagged')
            and snapshots."workItemId" = ANY($<workItemIds>)
            AND snapshots."isFiller" = false
        ORDER BY
            "formattedDate",
            snapshots."workItemId"
    ),
    flow_efficiency_intervals as (
        SELECT
            current_events."row_number",
            current_events."workItemId",
            current_events."stateType",
            current_events."stepCategory",
            current_events."flagged",
            current_events."formattedDate" as "fromDateRaw",
            (case 
                when (next_events."formattedDate" is null and next_events."stateCategory" in ('preceding', 'completed', 'removed'))
                then (current_events."formattedDate" + interval '1' day)
                when (next_events."formattedDate" is null)
                then ($<endFlowEfficiencyDate>::timestamptz AT TIME ZONE $<timezone>)
                else (next_events."formattedDate")
                end) as "toDateRaw"
        FROM
            flow_efficiency_events AS current_events
            LEFT JOIN flow_efficiency_events AS next_events ON current_events."row_number" + 1 = next_events."row_number"
            AND current_events."workItemId" = next_events."workItemId"
    ),
    flow_efficiency_trimmed_intervals AS (
        SELECT
            flow_efficiency_intervals."row_number",
            flow_efficiency_intervals."workItemId",
            flow_efficiency_intervals."stateType",
            flow_efficiency_intervals."stepCategory",
            flow_efficiency_intervals."flagged",
            (CASE
                WHEN (flow_efficiency_intervals."fromDateRaw" < ($<startFlowEfficiencyDate>::timestamp)) 
                THEN ($<startFlowEfficiencyDate>::timestamptz AT TIME ZONE $<timezone>)
                WHEN (flow_efficiency_intervals."fromDateRaw" > ($<endFlowEfficiencyDate>::timestamp))
                THEN ($<endFlowEfficiencyDate>::timestamptz AT TIME ZONE $<timezone>)
                ELSE flow_efficiency_intervals."fromDateRaw"
            END) AS "fromDate",
            (CASE
                WHEN (flow_efficiency_intervals."toDateRaw" < ($<startFlowEfficiencyDate>::timestamp)) 
                THEN ($<startFlowEfficiencyDate>::timestamptz AT TIME ZONE $<timezone>)
                WHEN (flow_efficiency_intervals."toDateRaw" > ($<endFlowEfficiencyDate>::timestamp))
                THEN ($<endFlowEfficiencyDate>::timestamptz AT TIME ZONE $<timezone>)
                ELSE flow_efficiency_intervals."toDateRaw"
            END) AS "toDate"
        FROM
            flow_efficiency_intervals
    ), 
    flow_efficiency_intervals_with_duration AS (
        SELECT
            f."row_number",
            f."workItemId",
            f."stateType",
            f."flagged",
            f."stepCategory",
            f."fromDate",
            f."toDate",
            EXTRACT(EPOCH FROM (f."toDate" - f."fromDate")) AS "difference"
        FROM 
            flow_efficiency_trimmed_intervals AS f
        WHERE
            f."fromDate" >= ($<startFlowEfficiencyDate>::timestamp)
    ), 
    flow_efficiency AS (
        SELECT
            f."workItemId",
            f."stateType",
            f."flagged",
            SUM(f."difference") AS "totalSeconds",
                FLOOR(
                    SUM(f."difference")/ 3600
                ) as "hours", 
                FLOOR(
                    (
                    SUM(f."difference") - FLOOR(
                        SUM(f."difference")/ 3600
                    )* 3600
                    )/ 60
                ) as "minutes", 
                FLOOR(
                    SUM(f."difference") - (
                    (
                        FLOOR(
                        SUM(f."difference")/ 3600
                        ) * 3600
                    ) + (
                        FLOOR(
                        (
                            SUM(f."difference") - FLOOR(
                            SUM(f."difference")/ 3600
                            )* 3600
                        )/ 60
                        ) * 60
                    )
                    )
                ) as "seconds" 
        FROM 
            flow_efficiency_intervals_with_duration AS f
        WHERE
            f."stateType" IS NOT NULL
            AND (
                f."stepCategory" IN ('inprogress') OR (
                    $<includeArrivalPointToFlowEfficiency> 
                    AND f."stepCategory" IN ('inprogress', 'proposed')
                )
            )
        GROUP BY f."workItemId", f."stateType" , f."flagged"
    ),
    active_table as (
        select 
            flow_efficiency."workItemId" , sum("totalSeconds") as "totalSumSeconds" 
        from 
            flow_efficiency 
        where 
            flow_efficiency."stateType" = 'active' 
            and (flow_efficiency."flagged" = false or flow_efficiency."flagged" is null) 
        group by 
            flow_efficiency."workItemId"
    ),
    waiting_table as (
        select 
            flow_efficiency."workItemId" , sum("totalSeconds") as "totalSumSeconds" 
        from 
            flow_efficiency 
        where 
            flow_efficiency."stateType" = 'queue' 
            or (flow_efficiency."stateType" = 'active' and flow_efficiency."flagged" = true) 
        group by 
            flow_efficiency."workItemId"
    ),
    item_ages AS (
        SELECT
            states.id,
            case 
            when ($<excludeWeekends> = true) 
            then public.count_business_days(
                (
                    states."arrivalDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                ),
                ($<endFlowEfficiencyDate> :: timestamptz) :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
            )
            else GREATEST(
                0,
                DATE_PART(
                    'day',
                    date_trunc(
                        'day',
                        (
                            ($<endFlowEfficiencyDate> :: timestamptz) :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                        )
                    ) - date_trunc(
                        'day',
                        (
                            (
                                states."arrivalDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                            ) :: DATE
                        )
                    )
                ) :: INT + 1
            )
            end AS "inventoryAgeInWholeDays",
            case 
            when ($<excludeWeekends> = true) 
            then public.count_business_days(
                (
                    states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                ),
                ($<endFlowEfficiencyDate> :: timestamptz) :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
            )
            else GREATEST(
                    0,
                    DATE_PART(
                        'day',
                        date_trunc(
                            'day',
                            (
                                ($<endFlowEfficiencyDate> :: timestamptz) :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                            )
                        ) - date_trunc(
                            'day',
                            (
                                (
                                    states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                                ) :: DATE
                            )
                        )
                    ) :: int + 1
                ) 
            end as "wipAgeInWholeDays",    
            case 
            when ($<excludeWeekends> = true) 
            then public.count_business_days(
                (
                    states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                ),
                (
                    states."departureDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                )
            )
            else DATE_PART(
                'day',
                date_trunc(
                    'day',
                    (
                        (
                            states."departureDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                        ) :: DATE
                    )
                ) - date_trunc(
                    'day',
                    (
                        (
                            states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                        ) :: DATE
                    )
                )
            ) :: int + 1
            end AS "leadTimeInWholeDays",
            case 
            when ($<excludeWeekends> = true) 
            then public.count_business_days(
                (
                    states."arrivalDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                ),
                (
                    states."departureDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                )
            )
            else DATE_PART(
                'day',
                date_trunc(
                    'day',
                    (
                        (
                            states."departureDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                        ) :: DATE
                    )
                ) - date_trunc(
                    'day',
                    (
                        (
                            states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>
                        ) :: DATE
                    )
                )
            ) :: int + 1
            end AS "endToEndleadTimeInWholeDays"
        FROM states
        WHERE
            states."partitionKey" = 'state#' || $<orgId>
            AND ($<workItemIds> IS NULL OR states."workItemId" = ANY($<workItemIds>))
    )
    SELECT
        states.*,
        item_ages."inventoryAgeInWholeDays"::INT,
        item_ages."wipAgeInWholeDays"::INT,
        item_ages."leadTimeInWholeDays"::INT,
        item_ages."endToEndleadTimeInWholeDays"::INT,
        (item_ages."leadTimeInWholeDays" > states."flomatikaWorkItemTypeServiceLevelExpectationInDays")::BOOLEAN AS "isAboveSle",
        (item_ages."wipAgeInWholeDays" > states."flomatikaWorkItemTypeServiceLevelExpectationInDays")::BOOLEAN AS "isAboveSleByWipAge",
        (
            DATE_PART(
                'day',
                date_trunc('day', ($<endFlowEfficiencyDate>::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE $<timezone>)) - date_trunc('day', states."changedDate")
            )::int >= get_stale_item_num_days(
                $<orgId>,
                states."flomatikaWorkItemTypeLevel"
            )
        )::BOOLEAN AS "isStale",
        (states."assignedTo" IS NULL)::BOOLEAN AS "isUnassigned",
        (COALESCE(active_table."totalSumSeconds", 0)::float / 86400) AS "activeTime",
        (COALESCE(waiting_table."totalSumSeconds", 0)::float / 86400) AS "waitingTime",
        COALESCE(active_table."totalSumSeconds", 0)::float AS "activeTimeInSeconds",
        COALESCE(waiting_table."totalSumSeconds", 0)::float AS "waitingTimeInSeconds",
        CASE WHEN COALESCE(active_table."totalSumSeconds", 0) = 0 AND COALESCE(waiting_table."totalSumSeconds", 0) = 0
        THEN 0::float
        ELSE COALESCE(active_table."totalSumSeconds", 0)::float / (COALESCE(active_table."totalSumSeconds", 0) + COALESCE(waiting_table."totalSumSeconds", 0))::float
        END AS "flow_efficiency"
    FROM state_items as states
        LEFT JOIN active_table ON
            states."workItemId" = active_table."workItemId"
        LEFT JOIN waiting_table ON
            states."workItemId" = waiting_table."workItemId"
        LEFT JOIN item_ages ON states.id = item_ages.id
        $<whereClause:raw>
        `,
        {
            orgId,
            contextIds,
            workItemIds,
            includeArrivalPointToFlowEfficiency,
            startFlowEfficiencyDate: startFlowEfficiencyDate.toISO(),
            endFlowEfficiencyDate: endFlowEfficiencyDate.toISO(),
            timezone,
            excludeWeekends,
            whereClause
        });
    return query;
};