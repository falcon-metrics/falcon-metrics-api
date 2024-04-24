import { uniqBy } from 'lodash';

import { DateAnalysisOptions, IQueryFilters } from '../../../common/filters_v2';
import { SecurityContext } from '../../../common/security';
import {
    getPerspectiveProfile,
    PerspectiveKey,
} from '../../../common/perspectives';

import { ExtendedStateItem, StateItem } from '../../../workitem/interfaces';
import { IState, StateCategory } from '../../../workitem/state_aurora';
import getWorkItemListService, {
    ProjectStateItem,
} from '../../../workitem/WorkItemList';
import { FG_COLOR } from '../../../utils/log_colors';
import { PredefinedWidgetTypes } from '../common/enum';
import { WidgetInformationUtils } from '../../../utils/getWidgetInformation';
import { ISnapshot } from '../../../workitem/snapshot_db';
import CustomFields, { tags } from '../../../models/CustomFieldConfigModel';

import { DateTime } from 'luxon';
import _ from 'lodash';
import ContextModel from '../../../models/ContextModel';

export class Calculations {
    readonly orgId: string;
    readonly state: IState;
    readonly snapshot: ISnapshot;
    private filters: IQueryFilters;
    private workItemCache: Map<string, Array<ExtendedStateItem>> = new Map();
    private completedWorkItemListCache: {
        [orgId: string]: Promise<StateItem[]> | StateItem[];
    } = {};
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(opts: {
        security: SecurityContext;
        state: IState;
        snapshot: ISnapshot;
        filters: IQueryFilters;
        widgetInformationUtils: WidgetInformationUtils;
    }) {
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
        this.snapshot = opts.snapshot;
        this.filters = opts.filters;
        this.widgetInformationUtils = opts.widgetInformationUtils;
    }

    private async getItemsByPerspective(
        perspective: PerspectiveKey,
    ): Promise<ExtendedStateItem[]> {
        const { stateCategory } = getPerspectiveProfile(perspective);

        if (perspective === 'past') {
            console.log(FG_COLOR.GREEN, '------past > became');
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }

        const orgId = this.orgId;
        const { filterByDate, dateAnalysisOption } = this.filters || {};
        const cacheKey = `${orgId}#${perspective}#${filterByDate}#${dateAnalysisOption}`;

        if (this.workItemCache.has(cacheKey)) {
            return this.workItemCache.get(cacheKey) || [];
        } else {
            const workItems = await this.state.getExtendedWorkItems(
                this.orgId,
                [stateCategory],
                this.filters,
                undefined,
                undefined,
                undefined,
                true,
            );

            this.workItemCache.set(cacheKey, workItems);
            return workItems;
        }
    }

    async getCachedCompletedWorkItemList() {
        if (this.completedWorkItemListCache[this.orgId] instanceof Promise) {
            return await this.completedWorkItemListCache[this.orgId];
        } else if (
            this.completedWorkItemListCache[this.orgId] instanceof Array
        ) {
            return this.completedWorkItemListCache[this.orgId];
        }
        const filterCopy = _.cloneDeep(this.filters);
        if (
            filterCopy.queryParameters &&
            filterCopy.queryParameters['departureDateUpperBoundary']
        ) {
            filterCopy.queryParameters[
                'departureDateLowerBoundary'
            ] = DateTime.fromISO(
                filterCopy.queryParameters['departureDateUpperBoundary'],
            )
                .minus({ days: 90 })
                .startOf('day')
                .toISO();
        }
        this.completedWorkItemListCache[this.orgId] = this.state.getWorkItems(
            this.orgId,
            StateCategory.COMPLETED,
            filterCopy,
            undefined, //fql
            undefined, //column names
            undefined, //isDelayed
            undefined, //disabledDelayed
            undefined, //disabledDiscarded
        );

        this.completedWorkItemListCache[this.orgId] = await this
            .completedWorkItemListCache[this.orgId];
        return this.completedWorkItemListCache[this.orgId];
    }

    async getWorkItemList(
        perspective: PerspectiveKey,
    ): Promise<ProjectStateItem[]> {
        // Set Time Window
        if (this.filters?.filterByDate) {
            this.filters.filterByDate = true;
        }

        const { ageField } = getPerspectiveProfile(perspective);

        if (perspective === 'past') {
            console.log(FG_COLOR.GREEN, '------past > became');
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }

        const itemsPromise = this.getItemsByPerspective(perspective);
        const workItemServicePromise = getWorkItemListService();
        const completedItemsPromise = this.getCachedCompletedWorkItemList();
        const model = await CustomFields();
        const customFieldsConfigPromise = await model.findAll({
            where: { orgId: this.orgId, deletedAt: null } as any,
        });
        const contextModel = await ContextModel();
        const contextPromise = await contextModel.findOne({
            where: {
                contextId: this.filters.getContextId() ?? '',
            } as any,
        });
        const [
            workItems,
            workItemListService,
            completedItems,
            customFieldConfigs,
            context,
        ] = await Promise.all([
            itemsPromise,
            workItemServicePromise,
            completedItemsPromise,
            customFieldsConfigPromise,
            contextPromise,
        ]);
        let desiredDeliveryDateCustomField: string[] | undefined = undefined;
        let classOfServiceCustomField: string | undefined = undefined;
        if (customFieldConfigs.length > 0 && context) {
            desiredDeliveryDateCustomField = customFieldConfigs
                .filter(
                    (i) =>
                        i.datasourceId === context.datasourceId &&
                        i.tags?.includes(tags.desiredDeliveryDate),
                )
                .map((i) => i.datasourceFieldName);
            classOfServiceCustomField = customFieldConfigs.find(
                (i) =>
                    i.datasourceId === context.datasourceId &&
                    i.tags?.includes(tags.classOfService),
            )?.datasourceFieldName;
        }

        const uniqueItems: ExtendedStateItem[] = uniqBy(
            workItems,
            'workItemId',
        );

        // const interval = await this.filters.datePeriod()!;

        // Disabled snapshots because of high impact
        const [
            projectsData,
            //snapshotRecord
        ] = await Promise.all([
            workItemListService.getProjectsData(this.orgId),
            /*this.snapshot.getTreatedSnapshots(
                this.orgId,
                ['workItemId', 'stateType', 'stateCategory', 'flomatikaSnapshotDate'],
                this.filters.clientTimezone,
                workItems.map(w => w.workItemId as string),
                undefined,
                interval.start,
                interval.end
            )*/
        ]);

        const projectWorkItems: ProjectStateItem[] = workItemListService.getProjectsItemList(
            projectsData,
            uniqueItems,
            ageField,
            completedItems,
            perspective,
            desiredDeliveryDateCustomField,
            classOfServiceCustomField,
        );

        // Replace default isAboveSLE on the present to use wip age instead of lead time
        if (perspective === 'present') {
            projectWorkItems.forEach((workItem) => {
                workItem.isAboveSle = workItem.isAboveSleByWipAge;
            });
        }
        /*
        for (const item of projectWorkItems) {
            const workItemId = item.workItemId as string;
            const {activeTime, waitingTime} = calculateActiveTimeAndWaitingTime(
                snapshotRecord[workItemId],
                item.departureDateTime as DateTime,
                perspective === 'present' ? 'inprogress' : 'completed',
                'exclude',
                interval.start,
                interval.end
            );
            item.activeTime = activeTime;
            item.waitingTime = waitingTime;
            item.flowEfficiency = Math.round(calculateFlowEfficiency(activeTime, waitingTime) * 100);
        }
        */
        return projectWorkItems;
    }

    async getWorkItemDetailsById(
        perspective: PerspectiveKey,
        workItemId: string,
    ): Promise<ProjectStateItem[]> {
        if (this.filters?.filterByDate) {
            this.filters.filterByDate = true;
        }

        const { ageField } = getPerspectiveProfile(perspective);

        if (perspective === 'past') {
            this.filters.dateAnalysisOption = DateAnalysisOptions.became;
        }

        const itemsPromise = this.state.getExtendedWorkItemDetails(
            this.orgId,
            workItemId,
            this.filters,
        );
        const workItemServicePromise = getWorkItemListService();
        const completedItemsPromise = this.getCachedCompletedWorkItemList();
        const model = await CustomFields();
        const customFieldsConfigPromise = model.findAll({
            where: { orgId: this.orgId, deletedAt: null } as any,
        });
        const contextModel = await ContextModel();
        const contextPromise = contextModel.findOne({
            where: {
                contextId: this.filters.getContextId() ?? '',
            } as any,
        });
        const [
            workItems,
            workItemListService,
            completedItems,
            customFieldConfigs,
            context,
        ] = await Promise.all([
            itemsPromise,
            workItemServicePromise,
            completedItemsPromise,
            customFieldsConfigPromise,
            contextPromise,
        ]);
        let desiredDeliveryDateCustomField: string[] | undefined = undefined;
        let classOfServiceCustomField: string | undefined = undefined;
        if (customFieldConfigs.length > 0 && context) {
            desiredDeliveryDateCustomField = customFieldConfigs
                .filter(
                    (i) =>
                        i.datasourceId === context.datasourceId &&
                        i.tags?.includes(tags.desiredDeliveryDate),
                )
                .map((i) => i.datasourceFieldName);
            classOfServiceCustomField = customFieldConfigs.find(
                (i) =>
                    i.datasourceId === context.datasourceId &&
                    i.tags?.includes(tags.classOfService),
            )?.datasourceFieldName;
        }

        const uniqueItems: ExtendedStateItem[] = uniqBy(
            workItems,
            'workItemId',
        );

        const [
            projectsData,
            //snapshotRecord
        ] = await Promise.all([
            workItemListService.getProjectsData(this.orgId),
        ]);

        const projectWorkItems: ProjectStateItem[] = workItemListService.getProjectsItemList(
            projectsData,
            uniqueItems,
            ageField,
            completedItems,
            perspective,
            desiredDeliveryDateCustomField,
            classOfServiceCustomField,
        );

        // Replace default isAboveSLE on the present to use wip age instead of lead time
        if (perspective === 'present') {
            projectWorkItems.forEach((workItem) => {
                workItem.isAboveSle = workItem.isAboveSleByWipAge;
            });
        }
        return projectWorkItems;
    }

    public async getWidgetInformation(perspective: PerspectiveKey) {
        let type;

        if (perspective === 'past')
            type = PredefinedWidgetTypes.COMPLETED_DETAILED_REPORT;
        else if (perspective === 'present')
            type = PredefinedWidgetTypes.COMPLETED_DETAILED_REPORT;
        else type = PredefinedWidgetTypes.UPCOMING_DETAILED_REPORT;

        return this.widgetInformationUtils.getWidgetInformation(type);
    }
}
