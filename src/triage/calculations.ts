import { mean, mode } from 'mathjs';
import {
    getPercentRank,
    getPercentile,
    roundToDecimalPlaces,
} from '../utils/statistics';
import { DateTime } from 'luxon';
import { IQueryFilters } from '../common/filters_v2';
import moment from 'moment';
import {
    TrendAnalysis,
    getTrendAnalysisContent,
} from '../utils/trend_analysis';
import { sortBy } from 'lodash';
import { IContextFilter } from '../context/context_filter';
import { IBoxPlot } from '../common/box_plot';
import { IWorkItemType } from '../data_v2/work_item_type_aurora';
import { SecurityContext } from '../common/security';
import { IState } from '../workitem/state_aurora';
import { StateItem } from '../workitem/interfaces';

export class Calculations {
    private orgId: string;
    private state: IState;
    private workItemType: IWorkItemType;
    private filters?: IQueryFilters;
    private contextFilter: IContextFilter;
    private completedItems?: Array<StateItem>;
    private completedItemsSortedByLeadTime?: Array<StateItem>;

    constructor(opts: {
        security: SecurityContext;
        state: IState;
        workItemType: IWorkItemType;
        filters?: IQueryFilters;
        contextFilter: IContextFilter;
    }) {
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
        this.filters = opts.filters;
        this.contextFilter = opts.contextFilter;
        this.workItemType = opts.workItemType;
    }

    async getTriageCount() {
        //TODO: Comeback to this later
    }
}
