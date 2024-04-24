-- FUNCTION: public.get_stale_item_num_days

DROP FUNCTION IF EXISTS public.get_stale_item_num_days(
	TEXT,
	TEXT
);

-- DELIMITER //

CREATE OR REPLACE FUNCTION public.get_stale_item_num_days(
	"p_orgId" text,
	"p_workItemTypeLevel" text
)
	RETURNS integer
	LANGUAGE 'plpgsql'
	COST 100
	VOLATILE PARALLEL UNSAFE
AS $BODY$
DECLARE
	"resultingStaleItemNumberOfDays" integer;
BEGIN
	SELECT
		CASE WHEN
			"p_workItemTypeLevel" = 'Team' AND settings."staledItemTeamLevelNumberOfDays" IS NOT NULL
		THEN
			settings."staledItemTeamLevelNumberOfDays"
		WHEN
			"p_workItemTypeLevel" = 'Portfolio' AND settings."staledItemPortfolioLevelNumberOfDays" IS NOT NULL
		THEN
			settings."staledItemPortfolioLevelNumberOfDays"
		WHEN
			"p_workItemTypeLevel" = 'Individual Contributor' AND settings."staledItemIndividualContributorNumberOfDays" IS NOT NULL
		THEN
			settings."staledItemIndividualContributorNumberOfDays"
		ELSE
			settings."staledItemNumberOfDays"
		END
	INTO "resultingStaleItemNumberOfDays"
	FROM settings
	WHERE settings."orgId" = "p_orgId";
	RETURN "resultingStaleItemNumberOfDays";
END;
$BODY$;

ALTER FUNCTION public.get_stale_item_num_days(
	TEXT,
	TEXT
) OWNER TO postgres;