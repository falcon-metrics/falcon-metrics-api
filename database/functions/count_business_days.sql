CREATE OR REPLACE FUNCTION public.count_business_days(start_date timestamp with time zone, end_date timestamp with time zone)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
    SELECT 
    	case
			-- If start and end is both on the same day AND it is a weekday,
	    	-- return 1
			when (DATE(start_date) = DATE(end_date)) 
				and (extract('ISODOW' FROM start_date) < 6) 
				and (extract('ISODOW' FROM end_date) < 6) then 1
			else count(*)
		end as count_days_no_weekend
    FROM generate_series(start_date, 
                         end_date, 
                         interval '1 day') the_day
    WHERE extract('ISODOW' FROM the_day) < 6;
$function$
;
