-- This is used to check if all the items from cwim are present in the 
-- states table

CREATE OR REPLACE FUNCTION get_extraction_report() 
RETURNS TABLE(
    "col_datasourceId" character varying,
    "col_orgId" character varying,
    "col_contextId" character varying, 
    "col_name" character varying, 
    cwim_count bigint, 
    extracted_count bigint, 
    missing_count bigint
    ) 
AS $$
BEGIN
    RETURN QUERY(
        with cwim_counts as (
            select cwim."contextId", count(*) c
            from "contextWorkItemMaps" cwim
            group by cwim."contextId"
        ), 
        state_matching_counts as (
            select cwim."contextId", count(*) c
            from "contextWorkItemMaps" cwim
            join states s 
                on cwim."workItemId" = s."workItemId" 
                and 'state#' || cwim."orgId" = s."partitionKey" 
            group by cwim."contextId"
        ),
        filtered_contexts as (
            select c."contextId", c.name, c."orgId", c."datasourceId"
            from contexts c
            where  c."obeyaId" IS NULL
                AND c.archived = false
                and c."contextAddress" is not null
                and c."contextAddress" != ''
        ),
        -- enabled_datasources as (
        --     select "datasourceId" , "orgId"  from datasources d 
        --     where enabled = true
        -- )
        select 
            ed."datasourceId" as "col_datasourceId",
            fc."orgId" as "col_orgId",
            fc."contextId" as "col_contextId",
            fc."name" as "col_name",
            cc.c as cwim_count, 
            smas.c as extracted_count, 
            cc.c - smas.c as missing_count
        from filtered_contexts fc
        left join cwim_counts cc on fc."contextId" = cc."contextId"
        left join state_matching_counts smas on fc."contextId" = smas."contextId"
        -- join enabled_datasources ed on ed."datasourceId" = fc."datasourceId"
        order by missing_count desc
    );
END;
$$
LANGUAGE plpgsql;