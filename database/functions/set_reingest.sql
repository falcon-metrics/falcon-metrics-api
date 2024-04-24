CREATE OR REPLACE FUNCTION set_reingest(
    p_datasource_id VARCHAR,
    p_org_id VARCHAR
) RETURNS VOID AS
$$
BEGIN
    -- Update datasources table
    UPDATE datasources
    SET "nextRunStartFrom" = NULL
    WHERE "orgId" = p_org_id AND "datasourceId" = p_datasource_id;

    -- Update contexts table
    UPDATE contexts
    SET "reingest" = true
    WHERE "orgId" = p_org_id
        AND "datasourceId" = p_datasource_id
        AND "contextAddress" IS NOT NULL
        AND "contextAddress" != ''
        AND "obeyaId" IS NULL
        AND archived = false;
END;
$$
LANGUAGE plpgsql;
