import { Logger } from 'log4js';
import { Sequelize } from 'sequelize-typescript';

import { IQueryFilters } from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import { WidgetInformationUtils } from '../utils/getWidgetInformation';
import { PredefinedWidgetTypes } from '../value_stream_management/delivery_governance/common/enum';
import CheckpointsDbAurora from './checkpoints_db_aurora';
import {
    CheckpointItem,
    CheckpointSnapshotItem
} from './interfaces';

const NO_COLOR = 'rgba(0, 0, 0, 0)';
const COLORS_MAP: { [key: number]: string; } = {
    0: 'rgba(153, 215, 242, 0.14)',
    1: 'rgba(153, 215, 242, 0.5)',
    2: 'rgba(102, 196, 235, 0.57)',
    3: 'rgba(77, 186, 232, 0.92)',
};

const getUnit = (obj: any) => {
    return obj[Object.keys(obj)[0]].unit;
};
export class Calculations {
    readonly orgId: string;
    readonly logger: Logger;
    readonly filters: IQueryFilters;
    readonly checkpointsDbAurora: CheckpointsDbAurora;
    readonly auroraWriter: any;
    readonly widgetInformationUtils: WidgetInformationUtils;

    constructor(opts: {
        auroraWriter: any;
        security: SecurityContext;
        logger: Logger;
        filters: IQueryFilters;
        checkpointsDbAurora: CheckpointsDbAurora;
        widgetInformationUtils: WidgetInformationUtils;
    }) {
        this.auroraWriter = opts.auroraWriter;
        this.orgId = opts.security.organisation!;
        this.logger = opts.logger;
        this.filters = opts.filters;
        this.checkpointsDbAurora = opts.checkpointsDbAurora;
        this.widgetInformationUtils = opts.widgetInformationUtils;
    }

    async getCheckpoints(): Promise<CheckpointItem[]> {
        const checkpointsItems: any[] = await this.checkpointsDbAurora.getAllCheckpoints(
            this.orgId!,
        );
        return checkpointsItems;
    }

    getCheckpointsIds(queryStringParameters: any): string[] {
        const checkpointsSnapshotIds = queryStringParameters?.checkpointsSnapshots as
            | string
            | undefined;
        const formattedIds = checkpointsSnapshotIds?.split(',') || [];
        return formattedIds;
    }

    // check if there is at least one checkpointSnapshotId to fetch
    validateCheckpointsIds(formattedIds: string[]) {
        return formattedIds.length >= 1;
    }

    async getCheckpointsSnasphots(checkpointsSnapshotsIds: string[]) {
        const promises: Promise<CheckpointSnapshotItem | null>[] = [];
        checkpointsSnapshotsIds.forEach((checkpointSnapshotId) => {
            promises.push(
                this.checkpointsDbAurora.getOneCheckpointSnapshot(
                    this.orgId!,
                    checkpointSnapshotId,
                    this.filters.getContextId() ?? '',
                ),
            );
        });

        const results = (await Promise.all([
            ...promises,
        ])) as CheckpointSnapshotItem[];
        const checkpoints = results.filter(c => Object.keys(c).length > 0);
        return checkpoints;
    }

    async getWidgetInformation() {
        return this.widgetInformationUtils.getWidgetInformation(PredefinedWidgetTypes.PERFORMANCE_COMPARISON);
    }

    async createOrUpdate(
        checkpointObject: CheckpointItem,
    ): Promise<CheckpointItem | unknown> {
        const aurora: Sequelize = await this.auroraWriter;
        const transaction = await aurora.transaction();
        try {
            const [
                result,
            ]: any[] = await this.checkpointsDbAurora.saveCheckpointView(
                this.orgId!,
                checkpointObject,
                aurora,
                transaction,
            );
            await transaction.commit();
            return result?.dataValues as CheckpointItem;
        } catch (error) {
            console.error('error createOrUpdate ', error);
            await transaction.rollback();
            const message =
                error instanceof Error && error.message
                    ? error.message
                    : 'An error occured on createOrUpdateInsightsViews';
            console.error('Error create Or Update InsightsView: ', message);
            throw error;
        }
    }

    async deleteCheckpoint(checkpointId: string) {
        const aurora = await this.auroraWriter;
        const transaction = await aurora.transaction();
        try {
            // Delete the checkpoint view
            await this.checkpointsDbAurora.delete(
                checkpointId,
                this.orgId!,
                aurora,
                transaction,
            );

            // Delete all the snapshots of the checkpoints view
            await this.checkpointsDbAurora.deleteCheckpointsSnapshots(checkpointId, this.orgId, aurora, transaction);

            await transaction.commit();
        } catch (error) {
            console.log('error calculations deleteCheckpoint ==>', error);
            await transaction.rollback();
            throw error;
        }
    }
}
