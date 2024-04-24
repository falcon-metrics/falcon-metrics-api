-- FUNCTION: public.calculate_cfd_statecategory(character varying, timestamp without time zone, timestamp without time zone, character varying, character varying, character varying[], character varying[])
DROP FUNCTION IF EXISTS public.calculate_cfd_statecategory(
	CHARACTER VARYING,
	TIMESTAMP WITHOUT TIME ZONE,
	TIMESTAMP WITHOUT TIME ZONE,
	CHARACTER VARYING,
	CHARACTER VARYING,
	CHARACTER VARYING [],
	CHARACTER VARYING [],
	CHARACTER VARYING
);

-- DELIMITER //
CREATE
OR REPLACE FUNCTION public.calculate_cfd_statecategory(
	"p_orgId" character varying,
	"p_startDate" timestamp without time zone,
	"p_endDate" timestamp without time zone,
	p_inprogress character varying,
	p_completed character varying,
	"p_flomatikaWorkItemTypeId" character varying [],
	"p_workItemIds" character varying [],
	p_timezone character varying
) RETURNS TABLE(
	state character varying,
	date date,
	numberofitems numeric
) LANGUAGE sql AS $ function $ (
	SELECT
		"stateCategory",
		("departureDate" AT TIME ZONE "p_timezone") :: DATE AS "date",
		SUM(
			COUNT(
				("departureDate" AT TIME ZONE "p_timezone") :: DATE
			)
		) OVER (
			PARTITION BY "stateCategory"
			ORDER BY
				"stateCategory",
				("departureDate" AT TIME ZONE "p_timezone") :: DATE
		) AS "numberofitems"
	FROM
		states
	WHERE
		"partitionKey" = 'state#' || "p_orgId"
		AND ("departureDate" >= "p_startDate")
		AND ("departureDate" <= "p_endDate")
		AND "stepCategory" = "p_completed"
		AND (
			"p_workItemIds" IS NULL
			OR "workItemId" = ANY("p_workItemIds")
		)
		AND (
			"p_flomatikaWorkItemTypeId" IS NULL
			OR "flomatikaWorkItemTypeId" = ANY("p_flomatikaWorkItemTypeId")
		)
	GROUP BY
		"stateCategory",
		("departureDate" AT TIME ZONE "p_timezone") :: DATE
)
UNION
(
	with snapshots_dataset as (
		select
			*,
			"flomatikaSnapshotDate" at time zone "p_timezone" AS "flomatikaSnapshotDateTz"
		from
			snapshots s
		where
			"type" in ('state_change', 'flagged')
			and "partitionKey" = 'snapshot#' || "p_orgId"
			and (
				"p_workItemIds" IS NULL
				OR "workItemId" = ANY("p_workItemIds")
			)
			and "isFiller" = false
	),
	snapshots_raw as (
		select
			*
		FROM
			snapshots_dataset s1
		WHERE
			(
				s1."workItemId",
				s1."flomatikaSnapshotDateTz"
			) IN (
				SELECT
					s2."workItemId",
					-- Last snapshot of the day
					max(s2."flomatikaSnapshotDateTz")
				FROM
					snapshots_dataset s2
				GROUP BY
					s2."workItemId",
					CAST(s2."flomatikaSnapshotDateTz" AS DATE)
			)
		ORDER BY
			s1."flomatikaSnapshotDateTz" DESC
	),
	events AS (
		SELECT
			ROW_NUMBER() OVER (
				ORDER BY
					snapshots_raw."workItemId",
					snapshots_raw."flomatikaSnapshotDate"
			) AS "row_number",
			snapshots_raw."workItemId",
			snapshots_raw."flomatikaSnapshotDate" at time zone "p_timezone" AS "formattedDate",
			snapshots_raw."stateType",
			snapshots_raw."state",
			snapshots_raw."stepCategory",
			snapshots_raw."stateCategory"
		FROM
			snapshots_raw
	),
	formatted_events as (
		SELECT
			current_events."workItemId",
			current_events."formattedDate" :: date AS "previousDate",
			(
				case
					when(
						next_events."formattedDate" is null
						and next_events."stateCategory" in ('preceding', 'completed', 'removed')
					) then (
						current_events."formattedDate" + interval '1' day
					)
					when(next_events."formattedDate" is null) then (current_timestamp at time zone "p_timezone")
					else next_events."formattedDate" - interval '1' day
				end
			) :: date as "nextDate",
			current_events."stateType" AS "previousStateType",
			current_events."state" AS "previousState",
			current_events."stateCategory" as "previousStateCategory"
		from
			events AS current_events
			LEFT JOIN events AS next_events ON current_events.row_number + 1 = next_events.row_number
			AND next_events."workItemId" = current_events."workItemId"
		where
			(current_events."stepCategory" = 'inprogress')
	),
	dates_table as (
		select
			"date" :: date
		FROM
			generate_series(
				"p_startDate" :: date,
				"p_endDate" :: date,
				'1 day' :: interval
			) "date"
	),
	temp_result as (
		select
			*
		from
			dates_table,
			lateral (
				select
					count("workItemId") as item_count,
					"previousStateCategory" as state_category,
					STRING_AGG("workItemId", ', ')
				from
					formatted_events
				where
					dates_table."date" between formatted_events."previousDate"
					and formatted_events."nextDate"
				group by
					"previousStateCategory"
			) l
	)
	select
		state_category as "stateCategory",
		"date",
		item_count as "numberofitems"
	from
		temp_result
)
ORDER BY
	"stateCategory",
	"date";

$ function $;

ALTER FUNCTION public.calculate_cfd_statecategory(
	CHARACTER VARYING,
	TIMESTAMP WITHOUT TIME ZONE,
	TIMESTAMP WITHOUT TIME ZONE,
	CHARACTER VARYING,
	CHARACTER VARYING,
	CHARACTER VARYING [],
	CHARACTER VARYING [],
	CHARACTER VARYING
) OWNER TO postgres;