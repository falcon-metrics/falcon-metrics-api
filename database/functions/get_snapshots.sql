DROP FUNCTION IF EXISTS public.get_snapshots(
  CHARACTER VARYING,
  CHARACTER VARYING,
  CHARACTER VARYING [],
  CHARACTER VARYING [],
  TIMESTAMP WITH TIME ZONE,
  TIMESTAMP WITH TIME ZONE
);

-- DELIMETER //
CREATE
OR REPLACE FUNCTION public.get_snapshots(
  "p_orgId" CHARACTER VARYING,
  "p_timezone" CHARACTER VARYING,
  "p_workItemIds" CHARACTER VARYING [],
  "p_flomatikaWorkItemTypeId" CHARACTER VARYING [],
  "p_startDate" TIMESTAMP WITH TIME ZONE,
  "p_endDate" TIMESTAMP WITH TIME ZONE
) RETURNS TABLE(
  "id" INTEGER,
  "workItemId" CHARACTER VARYING,
  "flomatikaSnapshotDate" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "changedDate" TIMESTAMP WITH TIME ZONE,
  "flomatikaCreatedBy" CHARACTER VARYING,
  "flomatikaCreatedDate" TIMESTAMP WITH TIME ZONE,
  "flomatikaWorkItemTypeId" CHARACTER VARYING,
  "flomatikaWorkItemTypeLevel" CHARACTER VARYING,
  "flomatikaWorkItemTypeName" CHARACTER VARYING,
  "gs2PartitionKey" CHARACTER VARYING,
  "gs2SortKey" CHARACTER VARYING,
  "isFiller" BOOLEAN,
  "partitionKey" CHARACTER VARYING,
  "revision" INTEGER,
  "sortKey" CHARACTER VARYING,
  "state" CHARACTER VARYING,
  "stateCategory" CHARACTER VARYING,
  "stateOrder" CHARACTER VARYING,
  "stateType" CHARACTER VARYING,
  "title" CHARACTER VARYING,
  "workItemType" CHARACTER VARYING,
  "assignedTo" CHARACTER VARYING,
  "flomatikaWorkItemTypeServiceLevelExpectationInDays" INTEGER,
  "classOfServiceId" CHARACTER VARYING,
  "natureOfWorkId" CHARACTER VARYING,
  "valueAreaId" CHARACTER VARYING,
  "projectId" CHARACTER VARYING,
  "isDelayed" BOOLEAN,
  "stepCategory" TEXT,
  "resolution" TEXT,
  "flomatikaSnapshotDateTz" TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql cost 500 AS $ function $ BEGIN RETURN QUERY(
  -- snapshot_dataset has only the snapshots between the given dates
  -- and it has an extra column for the flomatikaSnapshotDate in the given timezome
  WITH snapshots_dataset AS (
    SELECT
      s.*,
      (
        s."flomatikaSnapshotDate" AT TIME ZONE "p_timezone"
      ) :: timestamptz AS "flomatikaSnapshotDateTz"
    FROM
      snapshots s
    WHERE
      s."partitionKey" = 'snapshot#' || "p_orgId"
      AND s."type " in ('state_change', 'flagged') -- Snapshots between the given dates. Convert the dates to the the timezone
      AND (
        "p_startDate" is NULL
        OR s."flomatikaSnapshotDate" AT time ZONE 'utc' AT time ZONE "p_timezone" >= "p_startDate" AT time ZONE 'utc' AT time ZONE "p_timezone"
      )
      AND (
        "p_endDate" is NULL
        OR s."flomatikaSnapshotDate" AT time ZONE 'utc' AT time ZONE "p_timezone" <= "p_endDate" AT time ZONE 'utc' AT time ZONE "p_timezone"
      )
      AND (
        "p_workItemIds" IS NULL
        OR s."workItemId" = ANY("p_workItemIds")
      )
      AND (
        "p_flomatikaWorkItemTypeId" IS NULL
        OR s."flomatikaWorkItemTypeId" = ANY("p_flomatikaWorkItemTypeId")
      )
  )
  SELECT
    s1."id",
    s1."workItemId",
    s1."flomatikaSnapshotDate",
    s1."createdAt",
    s1."updatedAt",
    s1."changedDate",
    s1."flomatikaCreatedBy",
    s1."flomatikaCreatedDate",
    s1."flomatikaWorkItemTypeId",
    s1."flomatikaWorkItemTypeLevel",
    s1."flomatikaWorkItemTypeName",
    s1."gs2PartitionKey",
    s1."gs2SortKey",
    s1."isFiller",
    s1."partitionKey",
    s1."revision",
    s1."sortKey",
    s1."state",
    s1."stateCategory",
    s1."stateOrder",
    s1."stateType",
    s1."title",
    s1."workItemType",
    s1."assignedTo",
    s1."flomatikaWorkItemTypeServiceLevelExpectationInDays",
    s1."classOfServiceId",
    s1."natureOfWorkId",
    s1."valueAreaId",
    s1."projectId",
    s1."isDelayed",
    s1."stepCategory",
    s1."resolution",
    s1."flomatikaSnapshotDateTz"
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
);

END;

$ function $;

ALTER FUNCTION public.get_snapshots(
  CHARACTER VARYING,
  CHARACTER VARYING,
  CHARACTER VARYING [],
  CHARACTER VARYING [],
  TIMESTAMP WITH TIME ZONE,
  TIMESTAMP WITH TIME ZONE
) OWNER TO postgres;