-- FUNCTION: public.get_extended_state_items_without_snapshots

DROP FUNCTION IF EXISTS public.get_extended_state_items_without_snapshots(
	CHARACTER VARYING,
	CHARACTER VARYING[],
	CHARACTER VARYING[],
	CHARACTER VARYING[],
	BOOLEAN,
	TIMESTAMP WITH TIME ZONE,
	TIMESTAMP WITH TIME ZONE,
	CHARACTER VARYING, 
	BOOLEAN
);

-- DELIMITER //

CREATE OR REPLACE FUNCTION public.get_extended_state_items_without_snapshots(
	"p_orgId" CHARACTER VARYING,
	"p_contextIds" CHARACTER VARYING[],
	"p_sprintIds" CHARACTER VARYING[],
	"p_workItemIds" CHARACTER VARYING[],
	"p_includeArrivalPointToFlowEfficiency" BOOLEAN,
	"p_startFlowEfficiencyDate" TIMESTAMP WITH TIME ZONE,
	"p_endFlowEfficiencyDate" TIMESTAMP WITH TIME ZONE,
	"p_timezone" CHARACTER VARYING, 
	"p_excludeWeekends" BOOLEAN
)
	RETURNS TABLE(
		"id" INTEGER,
		"partitionKey" CHARACTER VARYING,
		"sortKey" CHARACTER VARYING,
		"flomatikaWorkItemTypeId" CHARACTER VARYING,
		"flomatikaWorkItemTypeLevel" CHARACTER VARYING,
		"flomatikaWorkItemTypeName" CHARACTER VARYING,
		"workItemId" CHARACTER VARYING,
		"title" CHARACTER VARYING,
		"workItemType" CHARACTER VARYING,
		"state" CHARACTER VARYING,
		"stateCategory" CHARACTER VARYING,
		"stateType" CHARACTER VARYING,
		"stateOrder" CHARACTER VARYING,
		"assignedTo" CHARACTER VARYING,
		"flomatikaWorkItemTypeServiceLevelExpectationInDays" INTEGER,
		"changedDate" TIMESTAMP WITH TIME ZONE,
		"arrivalDate" TIMESTAMP WITH TIME ZONE,
		"commitmentDate" TIMESTAMP WITH TIME ZONE,
		"departureDate" TIMESTAMP WITH TIME ZONE,
		"flomatikaCreatedDate" TIMESTAMP WITH TIME ZONE,
		"createdAt" TIMESTAMP WITH TIME ZONE,
		"updatedAt" TIMESTAMP WITH TIME ZONE,
		"classOfServiceId" CHARACTER VARYING,
		"natureOfWorkId" CHARACTER VARYING,
		"valueAreaId" CHARACTER VARYING,
		"parentId" CHARACTER VARYING,
		"customFields" jsonb,
		"projectId" CHARACTER VARYING,
		"datasourceid" CHARACTER VARYING,
		"deletedAt" TIMESTAMP WITH TIME ZONE,
		"orgId" CHARACTER VARYING,
		"linkedItems" jsonb,
		"isDelayed" BOOLEAN,
		"stepCategory" TEXT,
		"resolution" TEXT,
		"flagged" BOOLEAN,
		"inventoryAgeInWholeDays" INTEGER,
		"wipAgeInWholeDays" INTEGER,
		"leadTimeInWholeDays" INTEGER,
		"isAboveSle" BOOLEAN,
		"isAboveSleByWipAge" BOOLEAN,
		"isStale" BOOLEAN,
		"isUnassigned" BOOLEAN
	)
	LANGUAGE 'plpgsql'
	COST 100
	VOLATILE PARALLEL UNSAFE
	ROWS 1000
AS $function$
BEGIN
RETURN QUERY (
	with item_ages AS (
		SELECT
			states.id,
			case 
            when ("p_excludeWeekends" = true) 
            then public.count_business_days(
                (
                    states."arrivalDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
                ),
                ("p_endFlowEfficiencyDate" :: timestamptz) :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
            )
			else GREATEST(
				0,
				DATE_PART(
					'day',
					date_trunc(
						'day',
						(
							("p_endFlowEfficiencyDate" :: timestamptz) :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
						)
					) - date_trunc(
						'day',
						(
							(
								states."arrivalDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
							) :: DATE
						)
					)
				) :: INT + 1
			)
            end AS "inventoryAgeInWholeDays",
            case 
            when ("p_excludeWeekends" = true) 
            then public.count_business_days(
                (
                    states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
                ),
                ("p_endFlowEfficiencyDate" :: timestamptz) :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
            )
			else GREATEST(
                    0,
                    DATE_PART(
                        'day',
                        date_trunc(
                            'day',
                            (
                                ("p_endFlowEfficiencyDate" :: timestamptz) :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
                            )
                        ) - date_trunc(
                            'day',
                            (
                                (
                                    states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
                                ) :: DATE
                            )
                        )
                    ) :: int + 1
                ) 
		    end as "wipAgeInWholeDays",    
			case 
            when ("p_excludeWeekends" = true) 
            then public.count_business_days(
                (
                    states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
                ),
                (
                    states."departureDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
                )
            )
			else DATE_PART(
				'day',
				date_trunc(
					'day',
					(
						(
							states."departureDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
						) :: DATE
					)
				) - date_trunc(
					'day',
					(
						(
							states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
						) :: DATE
					)
				)
			) :: int + 1
            end AS "leadTimeInWholeDays",
			case 
            when ("p_excludeWeekends" = true) 
            then public.count_business_days(
                (
                    states."arrivalDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
                ),
                (
                    states."departureDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
                )
            )
			else DATE_PART(
				'day',
				date_trunc(
					'day',
					(
						(
							states."departureDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
						) :: DATE
					)
				) - date_trunc(
					'day',
					(
						(
							states."commitmentDate" :: TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone"
						) :: DATE
					)
				)
			) :: int + 1
            end AS "endToEndleadTimeInWholeDays"
		FROM states
		WHERE
			states."partitionKey" = 'state#' || "p_orgId"
			AND ("p_workItemIds" IS NULL OR states."workItemId" = ANY("p_workItemIds"))
	)
	select
		distinct on ("workItemId")
		states."id",
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
		states."flagged",

		item_ages."inventoryAgeInWholeDays"::INT,
		item_ages."wipAgeInWholeDays"::INT,
		item_ages."leadTimeInWholeDays"::INT,
		(item_ages."leadTimeInWholeDays" > states."flomatikaWorkItemTypeServiceLevelExpectationInDays")::BOOLEAN AS "isAboveSle",
		(item_ages."wipAgeInWholeDays" > states."flomatikaWorkItemTypeServiceLevelExpectationInDays")::BOOLEAN AS "isAboveSleByWipAge",
		(
			DATE_PART(
				'day',
				date_trunc('day', ("p_endFlowEfficiencyDate"::TIMESTAMP AT TIME ZONE 'UTC' AT TIME ZONE "p_timezone")) - date_trunc('day', states."changedDate")
			)::int >= get_stale_item_num_days(
				"p_orgId",
				states."flomatikaWorkItemTypeLevel"
			)
		)::BOOLEAN AS "isStale",
		(states."assignedTo" IS NULL)::BOOLEAN AS "isUnassigned"
	FROM states
		INNER JOIN "contextWorkItemMaps"
		ON "contextWorkItemMaps"."workItemId" = states."workItemId"
		AND "contextWorkItemMaps"."contextId" = ANY("p_contextIds")
		LEFT JOIN item_ages ON states.id = item_ages.id
		WHERE
			states."partitionKey" = 'state#' || "p_orgId"
			AND ("p_workItemIds" IS NULL OR states."workItemId" = ANY("p_workItemIds"))
);
END;
$function$
;

ALTER FUNCTION public.get_extended_state_items_without_snapshots(
	CHARACTER VARYING,
	CHARACTER VARYING[],
	CHARACTER VARYING[],
	CHARACTER VARYING[],
	BOOLEAN,
	TIMESTAMP WITH TIME ZONE,
	TIMESTAMP WITH TIME ZONE,
	CHARACTER VARYING,
	BOOLEAN
) OWNER TO postgres;