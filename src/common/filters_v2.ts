import { timeStamp } from 'console';
import { Logger } from 'log4js';
import { DateTime, Interval } from 'luxon';
import { IContextQueries } from '../context/context_queries';
import { NormalizationQueryParam } from '../normalization/Normalization';
import { IOrgSetting } from '../organization-settings/handleSettings';
import { AggregationKey, isAggregationValid } from './aggregation';
import { SecurityContext } from './security';

const WORK_ITEM_TYPES_PARAM_TEXT = 'workItemTypes';
const WORK_ITEM_LEVELS_PARAM_TEXT = 'workItemLevels';
const WORK_FLOW_STEPS = 'workflowSteps';
const CLASSES_OF_SERVICE_PARAM_TEXT = 'classesOfService';
const DEPARTURE_DATE_PERIOD_FROM_TEXT = 'departureDateLowerBoundary';
const DEPARTURE_DATE_PERIOD_TO_TEXT = 'departureDateUpperBoundary';
const CONTEXT_ID_PARAM_TEXT = 'contextId';
const DELAYED_ITEMS_SELECTION = 'delayedItemsSelection';
const DATE_ANALYSIS_OPTION = 'dateAnalysisOption';
const CUSTOM_FIELDS_PARAM_TEXT = 'customFields';
const NORMALIZATION = 'normalization';
const RESOLUTION = 'resolution';
const ASSIGNED_TO = 'assignedTo';
const FLAGGED = 'flagged';

export enum PredefinedFilterTags {
    NORMALISATION = 'normalisation',
    REMOVED = 'removed',
    DEMAND = 'demand',
    VALUE_AREA = 'value-area',
    QUALITY = 'quality',
    PLANNED_UNPLANNED = 'planned-unplanned',
    CLASS_OF_SERVICE = 'class-of-service',
    BLOCKERS = 'blockers',
    DISCARDED = 'discarded',
}

export interface IQueryFilters {
    workItemTypes?: string[];
    workItemLevels?: string[];
    workflowSteps?: string[];
    classesOfService?: string[];
    datePeriod(): Promise<Interval>;
    departureDateLowerBoundary?: Date;
    departureDateUpperBoundary?: Date;
    getRollingWindowDays?(): Promise<number>;
    getContextId(): string | undefined;
    filterByStateCategory: boolean;
    filterByDate: boolean;
    stateTypeFilter?: string;
    customFields?: Map<string, string[]>;
    normalization?: NormalizationQueryParam;
    summaryPeriodType?: string;
    clientTimezone?: string;
    clientLanguage?: string;
    dateAnalysisOption?: DateAnalysisOptions;
    delayedItemsSelection?: string;
    queryParameters?: { [name: string]: string; } | null;
    /**
     * @deprecated
     * 
     * Use the `aggregation` getter
     */
    getCurrentDataAggregation(): AggregationKey;
    flagged?: boolean;
    resolution?: string[];
    assignedTo?: string[];
    aggregation: AggregationKey;
    /**
     * When computing history for a large date range, use a "big" aggregation
     * to reduce the load on the database
     */
    setSafeAggregation(): void;
    getExcludeWeekendsSetting(orgId: string): Promise<boolean>;
}

export interface AnalysisDateRange {
    start: DateTime | undefined;
    end: DateTime | undefined;
}

export enum DateAnalysisOptions {
    all = 'all',
    was = 'was',//active
    became = 'became',//inactive
}

const DEFAULT_ROLLING_WINDOW_DAYS = 30;

export class QueryFilters implements IQueryFilters {
    readonly workItemTypes?: string[];
    readonly workItemLevels?: string[];
    readonly workflowSteps?: string[];
    readonly classesOfService?: string[];
    readonly stateTypeFilter?: string;
    readonly customFields?: Map<string, string[]>;
    readonly normalization?: NormalizationQueryParam;
    readonly assignedTo?: string[];
    readonly flagged?: boolean;
    readonly resolution?: string[];

    readonly clientTimezone?: string;
    readonly clientLanguage?: string;

    readonly delayedItemsSelection?: string;
    readonly dateAnalysisOption?: DateAnalysisOptions;

    private readonly _contextId?: string;

    _aggregation: AggregationKey = 'week';

    private logger: Logger;
    private orgSetting: IOrgSetting;
    private security: SecurityContext;
    //private queryParameters: { [name: string]: string } | null;
    private contextQueries: IContextQueries;

    filterByStateCategory: boolean = true;
    filterByDate: boolean = true;

    departureDateLowerBoundary?: Date;
    departureDateUpperBoundary?: Date;
    queryParameters: { [name: string]: string; } | null;

    static EMPTY_FIELD = 'EMPTY_FIELD';

    constructor(opts: {
        logger: Logger;
        queryParameters: { [name: string]: string; } | null;
        orgSetting: IOrgSetting;
        security: SecurityContext;
        contextQueries: IContextQueries;
        contextId: string | null;
    }) {
        this.logger = opts.logger;
        this.orgSetting = opts.orgSetting;
        this.security = opts.security;
        this.contextQueries = opts.contextQueries;
        this.queryParameters = opts.queryParameters;

        if (!opts.queryParameters) return;

        this.clientTimezone = opts.queryParameters['timezone'] || opts.queryParameters['tz'];
        this.clientLanguage = opts.queryParameters['lang'];

        this._contextId = opts.queryParameters['contextId'];
        this.workItemTypes = this.parseQueryParametersPropertyToList(
            WORK_ITEM_TYPES_PARAM_TEXT,
        );
        this.workItemLevels = this.parseQueryParametersPropertyToList(
            WORK_ITEM_LEVELS_PARAM_TEXT,
        );
        this.workflowSteps = this.parseQueryParametersPropertyToList(
            WORK_FLOW_STEPS,
        );
        this.classesOfService = this.parseQueryParametersPropertyToList(
            CLASSES_OF_SERVICE_PARAM_TEXT,
        );

        this.delayedItemsSelection =
            opts.queryParameters[DELAYED_ITEMS_SELECTION];

        this.dateAnalysisOption = this.parseDateAnalysisOptionParameter(
            opts.queryParameters[DATE_ANALYSIS_OPTION],
        );
        this.customFields = this.parseCustomFieldParameters(
            opts.queryParameters[CUSTOM_FIELDS_PARAM_TEXT],
        );

        this.normalization = this.parseNormalizationParameters(
            opts.queryParameters[NORMALIZATION],
        );

        this.resolution = this.parseQueryParametersPropertyToList(
            RESOLUTION,
        );
        this.assignedTo = this.parseQueryParametersPropertyToList(
            ASSIGNED_TO,
        );
        this.flagged = this.parseFlaggedField(FLAGGED);
        this._aggregation = this.parseDataAggregation();
    }

    parseQueryParametersPropertyToList(key: string) {
        return this.parseStringToList(this.queryParameters?.[key]);
    }

    parseStringToList(stringfiedList?: string) {
        return stringfiedList?.split(',');
    }

    parseCustomFieldParameters(customFields: string): Map<string, string[]> {
        if (!customFields || customFields.length === 0) {
            return new Map();
        }

        //we start with a string like this:
        //labels#Refined,labels#stability,priority#Minor
        //which means:
        //datasourceFieldName#datasourceFieldValue

        //there are multiple values per key (potentially)

        const pairs: Array<string> = customFields.split(',');

        const customFieldParameters: Map<string, string[]> = new Map();

        for (const pair of pairs) {
            const keyValue = pair.split('#');
            const key = keyValue[0];
            const value = keyValue[1];

            if (customFieldParameters.has(key)) {
                customFieldParameters.get(key)?.push(value);
            } else {
                customFieldParameters.set(key, [value]);
            }
        }

        return customFieldParameters;
    }

    parseNormalizationParameters(
        parameterString?: string,
    ): NormalizationQueryParam | undefined {
        if (!parameterString) {
            return undefined;
        }
        const parameters = parameterString.split(',');
        const pairs = parameters.map((parameter) => {
            const [category, id] = parameter.split('#');
            return {
                category,
                id,
            };
        });
        return pairs.reduce((result, { category, id }) => {
            const ids = result[category] ?? [];
            result[category] = [...ids, id];
            return result;
        }, {} as NormalizationQueryParam);
    }

    parseDateAnalysisOptionParameter(dateAnalysisParam: string): DateAnalysisOptions {
        if (dateAnalysisParam === 'was') {
            return DateAnalysisOptions.was;
        } else if (dateAnalysisParam === 'became') {
            return DateAnalysisOptions.became;
        } else {
            return DateAnalysisOptions.all;
        }
    }

    getContextId(): string | undefined {
        if (this._contextId === '') {
            return undefined;
        }
        // Do the check only if the user is NOT a power user 
        if (!this.security.isPowerUser()) {
            // If access control is enabled for the this org AND
            // the context is not in the list of allowed contexts, 
            // return undefined
            if (
                this.security.isContextAccessControlEnabled() &&
                !this.security.allowedContextIds.includes(this._contextId ?? '')
            )
                return undefined;
        }
        return this._contextId;
    }

    async getExcludeWeekendsSetting(orgId: string): Promise<boolean> {
        const settings = await this.orgSetting.getSettings(orgId);
        return settings?.excludeWeekends === true;
    }

    async getRollingWindowDays(): Promise<number> {
        let rollingWindowDays: number;
        try {
            rollingWindowDays = await RollingPeriodCalculator.getCalculationChain(
                this.logger,
                this.security.organisation!,
                this.orgSetting,
                this.contextQueries,
                this.queryParameters
                    ? this.queryParameters[CONTEXT_ID_PARAM_TEXT]
                    : undefined,
            ).getRollingPeriodDays();
        } catch {
            rollingWindowDays = DEFAULT_ROLLING_WINDOW_DAYS;
        }

        return rollingWindowDays;
    }

    /**
     * Returns the timezone-aware date interval from the query parameters.
     * It usually uses the "departureDateLowerBoundary" and "departureDateUpperBoundary" parameters to create this date.
     * If these parameters are not defined then it uses the rolling windows to get the current date and the previous date.
     * This interval is guaranted to start at the beggining of the day and at the end of the day based on the client timezone.
     * @returns Interval with both start and end date on the client timezone.
     * @example '2021-07-19T00:00:00.000+10:00' for 'Australia/Sydney'
     */
    async datePeriod(): Promise<Interval> {
        const zone = this.clientTimezone;

        const dateTimeLocal = DateTime.fromObject({
            zone,
        });

        let start: DateTime | undefined = undefined;
        let end: DateTime | undefined = undefined;

        if (this.queryParameters) {
            if (this.queryParameters[DEPARTURE_DATE_PERIOD_FROM_TEXT]) {
                start = DateTime.fromISO(
                    this.queryParameters[DEPARTURE_DATE_PERIOD_FROM_TEXT],
                    {
                        zone: this.clientTimezone
                    }
                ).startOf('day');
            }
            if (this.queryParameters[DEPARTURE_DATE_PERIOD_TO_TEXT]) {
                end = DateTime.fromISO(
                    this.queryParameters[DEPARTURE_DATE_PERIOD_TO_TEXT],
                    {
                        zone: this.clientTimezone
                    }
                ).endOf('day');
            }
        }

        start = start && start.isValid ? start : undefined;
        end = end && end.isValid ? end : undefined;

        if (!end) {
            end = dateTimeLocal.endOf('day');
        }

        if (!start) {
            const rollingWindowDays = await this.getRollingWindowDays();
            start = end.minus({ days: rollingWindowDays }).startOf('week');
        }

        if (!start || !end || !start.isValid || !end.isValid) {
            throw new Error('Invalid date period filter');
        }

        if (start.valueOf() <= end.valueOf()) {
            return Interval.fromDateTimes(start, end);
        } else {
            return Interval.fromDateTimes(end, start);
        }
    }

    /**
     * Method to get the dates without using the getRollingPeriodDays method. This is unsafe 
     * because the dates could be invalid or incorrect
     * 
     * This is not to be used everywhere. Use `datePeriod` for most use cases.  
     */
    datePeriodUnsafe(): Interval | undefined {
        let startDate, endDate, interval;
        if (this.queryParameters) {
            if (this.queryParameters[DEPARTURE_DATE_PERIOD_FROM_TEXT]) {
                startDate = DateTime.fromISO(
                    this.queryParameters[DEPARTURE_DATE_PERIOD_FROM_TEXT],
                    {
                        zone: this.clientTimezone
                    }
                ).startOf('day');
            }
            if (this.queryParameters[DEPARTURE_DATE_PERIOD_TO_TEXT]) {
                endDate = DateTime.fromISO(
                    this.queryParameters[DEPARTURE_DATE_PERIOD_TO_TEXT],
                    {
                        zone: this.clientTimezone
                    }
                ).endOf('day');
            }
        }

        if (startDate?.isValid && endDate?.isValid) {
            interval = Interval.fromDateTimes(startDate, endDate);
        }

        return interval;
    }

    /**
     * @deprecated
     * 
     * Use the `aggregation` getter
     */
    getCurrentDataAggregation(): AggregationKey {
        let aggregation = (
            this.queryParameters && this.queryParameters['currentDataAggregation'] ?
                this.queryParameters['currentDataAggregation'] :
                'Weeks'
        ).toLowerCase();

        if (aggregation[aggregation.length - 1] === 's') {
            aggregation = aggregation.substring(0, aggregation.length - 1);
        }

        if (!isAggregationValid(aggregation)) {
            throw new Error('Invalid aggregation');
        }

        return aggregation;
    }

    get aggregation() {
        return this._aggregation;
    }

    set aggregation(aggregation) {
        this._aggregation = aggregation;
    }

    private parseDataAggregation(): AggregationKey {
        let queryParam: string | undefined = ((this.queryParameters ?? {})['currentDataAggregation'])?.toLowerCase();
        let aggregation: AggregationKey = 'week';
        switch (queryParam) {
            case 'days': {
                aggregation = 'day';
                break;
            }
            case 'weeks': {
                aggregation = 'week';
                break;
            }
            case 'months': {
                aggregation = 'month';
                break;
            }
            case 'quarters': {
                aggregation = 'quarter';
                break;
            }
            case 'years': {
                aggregation = 'year';
                break;
            }
            default: {
                aggregation = 'week';
            }
        }

        return aggregation;
    }
    // setCurrentDataAggregation(aggregation: AggregationKey) {
    //     this.agg
    // }


    parseFlaggedField(key: string): boolean | undefined {
        const values = this.parseQueryParametersPropertyToList(FLAGGED)
            ?.filter(v => ['Yes', 'No'].includes(v));
        // Set makes the code more readable
        const valuesSet = new Set(values);
        let flagged = undefined;
        // If both the values are selected flagged is undefined
        // That means there is no where clause for the flagged column
        if (valuesSet.has('Yes') && valuesSet.has('No')) {
            flagged = undefined;
        } else if (valuesSet.has('Yes')) {
            flagged = true;
        } else if (valuesSet.has('No')) {
            flagged = false;
        }
        return flagged;
    }

    /**
     * When computing history for a large date range, use a "big" aggregation
     * to reduce the load on the database
     */
    setSafeAggregation() {
        if (this.datePeriodUnsafe()?.isValid) {
            const interval = this.datePeriodUnsafe() as Interval;
            const start = interval.start;
            const end = interval.end;
            const months = end.diff(start, 'months').months;
            // const days = end.diff(start, 'days').days;
            if (months <= 3) {
                this.aggregation = 'week';
            } else if (months > 3 && months <= 12) {
                this.aggregation = 'month';
            } else if (months <= 24) {
                this.aggregation = 'quarter';
            } else {
                this.aggregation = 'year';
            }
        }
    }
}

// Trying to avoid a maze of if/elses when trying to arrive at the rolling period
abstract class RollingPeriodCalculator {
    static getCalculationChain(
        logger: Logger,
        orgId: string,
        orgSetting: IOrgSetting,
        context: IContextQueries,
        contextId?: string,
    ): RollingPeriodCalculator {
        return new ContextRollingPeriodCalculator(
            orgId,
            context,
            logger,
            contextId,
            new OrganisationRollingPeriodCalculator(
                orgId,
                orgSetting,
                logger,
                new FalconMetricsRollingPeriodCalculator(),
            ),
        );
    }

    protected nextCalculator?: RollingPeriodCalculator;

    constructor(nextCalculator?: RollingPeriodCalculator) {
        this.nextCalculator = nextCalculator;
    }

    async getRollingPeriodDays(): Promise<number> {
        let rollingPeriod = await this.calculateRollingPeriod();

        if (rollingPeriod === undefined && this.nextCalculator) {
            rollingPeriod = await this.nextCalculator.getRollingPeriodDays();
        }

        if (rollingPeriod === undefined)
            throw new Error(
                'I should be getting a value from somewhere in the chain!',
            );

        return (rollingPeriod as unknown) as number;
    }

    protected abstract calculateRollingPeriod(): Promise<number | undefined>;
}

class FalconMetricsRollingPeriodCalculator extends RollingPeriodCalculator {
    async calculateRollingPeriod() {
        return DEFAULT_ROLLING_WINDOW_DAYS;
    }
}

class OrganisationRollingPeriodCalculator extends RollingPeriodCalculator {
    private orgId: string;
    private orgSetting: IOrgSetting;
    private logger: Logger;

    constructor(
        orgId: string,
        orgSetting: IOrgSetting,
        logger: Logger,
        nextCalculator?: RollingPeriodCalculator,
    ) {
        super(nextCalculator);

        this.orgId = orgId;
        this.orgSetting = orgSetting;
        this.logger = logger;
    }

    async calculateRollingPeriod() {
        let rollingPeriod = undefined;

        try {
            const orgSetting = await this.orgSetting.getSettings(this.orgId);

            //TODO: Convert column to type int "alter table settings alter column "rollingWindowPeriodInDays" type int"
            const rollingWindowPeriodInDays = Number(
                orgSetting?.rollingWindowPeriodInDays,
            );
            rollingPeriod = isNaN(rollingWindowPeriodInDays)
                ? DEFAULT_ROLLING_WINDOW_DAYS
                : rollingWindowPeriodInDays;
        } catch (e) {
            if (e instanceof Error) {
                this.logger.error(
                    'Could not get org settings for org %s:\n%o',
                    this.orgId,
                    e.message,
                );
            } else {
                console.error(e);
            }
        }

        return rollingPeriod;
    }
}

class ContextRollingPeriodCalculator extends RollingPeriodCalculator {
    private orgId: string;
    private contextId?: string;
    private contextQueries: IContextQueries;
    private logger: Logger;

    constructor(
        orgId: string,
        context: IContextQueries,
        logger: Logger,
        contextId?: string,
        nextCalculator?: RollingPeriodCalculator,
    ) {
        super(nextCalculator);

        this.orgId = orgId;
        this.contextId = contextId;
        this.contextQueries = context;
        this.logger = logger;
    }

    async calculateRollingPeriod() {
        if (!this.contextId) return undefined;

        let rollingPeriod = undefined;

        try {
            const context = await this.contextQueries.getIfVisible(
                this.contextId,
            );

            rollingPeriod =
                context &&
                    context.rollingWindowPeriodInDays !== undefined &&
                    !isNaN(context.rollingWindowPeriodInDays)
                    ? context.rollingWindowPeriodInDays
                    : undefined;
        } catch (e) {
            if (e instanceof Error) {
                this.logger.error(
                    'Could not get context settings for org %s, context %s:\n%o',
                    this.orgId,
                    this.contextId,
                    e.message,
                );
            } else {
                console.error(e);
            }
        }

        return rollingPeriod;
    }
}
