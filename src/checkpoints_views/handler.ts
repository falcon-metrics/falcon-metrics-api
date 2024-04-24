import {
    asClass,
    Lifetime,
} from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { DateTime } from 'luxon';

import { BaseHandler } from '../common/base_handler';
import { HandleEvent } from '../common/event_handler';
import {
    OrganizationSettings as OrganizationSettingsCalculations,
} from '../organization-settings/handleSettings';
import { sendEvent } from '../utils/eventbridge';
import { WidgetInformationUtils } from '../utils/getWidgetInformation';
import { Calculations as CheckpointsCalculations } from './calculations';
import CheckpointsDbAurora from './checkpoints_db_aurora';
import {
    CheckpointItem,
    CheckpointSnapshotItem,
} from './interfaces';
import { SecurityContext } from '../common/security';

const EVENTBRIDGE_SOURCE = 'extract-insights';
class CheckpointsHandler extends BaseHandler {
    readonly organisationsSettingsCalculations: OrganizationSettingsCalculations;
    readonly checkpointsCalculations: CheckpointsCalculations;
    readonly checkpointsDbAurora: CheckpointsDbAurora;
    readonly widgetInformationUtils: WidgetInformationUtils;
    readonly orgId: string;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            organisationsSettingsCalculations: asClass(OrganizationSettingsCalculations, {
                lifetime: Lifetime.SCOPED
            }),
            checkpointsDbAurora: asClass(CheckpointsDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
            checkpointsCalculations: asClass(CheckpointsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            widgetInformationUtils: asClass(WidgetInformationUtils, {
                lifetime: Lifetime.SCOPED,
            }),
        });
        this.organisationsSettingsCalculations = this.dependencyInjectionContainer.cradle.organisationsSettingsCalculations;
        this.checkpointsCalculations = this.dependencyInjectionContainer.cradle.checkpointsCalculations;
        this.checkpointsDbAurora = this.dependencyInjectionContainer.cradle.checkpointsDbAurora;
        this.widgetInformationUtils = this.dependencyInjectionContainer.cradle.widgetInformationUtils;
        this.orgId = this.dependencyInjectionContainer.cradle.security.organisation!;

    }

    async getEverything(): Promise<
        CheckpointItem[] | { statusCode: number; body: string; }
    > {
        try {
            const allCheckpoints = await this.checkpointsCalculations.getCheckpoints();
            const widgetInfo = await this.checkpointsCalculations.getWidgetInformation();
            const security = this.dependencyInjectionContainer.cradle.security as SecurityContext;

            const filtered = allCheckpoints.filter(c => {
                return !c.name?.startsWith('flomatika_internal_');
            });

            return {
                statusCode: 200,
                body: JSON.stringify({
                    checkpoints: filtered,
                    widgetInfo
                }),
            };
        } catch (error) {
            console.error(JSON.stringify({
                message: "Error in getCheckpointsSnasphots",
                orgId: this.orgId,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async getCheckpointsSnasphots(
        event: APIGatewayProxyEventV2,
    ): Promise<
        CheckpointSnapshotItem[] | { statusCode: number; body: string; }
    > {
        if (!event?.queryStringParameters?.contextId) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    checkpoints: [],
                }),
            };
        }

        const checkpointsSnapshotIds: string[] = this.checkpointsCalculations.getCheckpointsIds(
            event?.queryStringParameters,
        );
        const validateCheckpointsIds = this.checkpointsCalculations.validateCheckpointsIds(
            checkpointsSnapshotIds,
        );

        if (!checkpointsSnapshotIds || !validateCheckpointsIds) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'checkpointsSnapshotIds are required' },
                }),
            };
        }

        try {
            const checkpoints = await this.checkpointsCalculations.getCheckpointsSnasphots(
                checkpointsSnapshotIds,
            );
            return {
                statusCode: 200,
                body: JSON.stringify({
                    checkpoints,
                }),
            };
        } catch (error) {
            console.error(JSON.stringify({
                message: "Error in getCheckpointsSnasphots",
                orgId: this.orgId,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    private parseBody(body: string) {
        const checkpointView = JSON.parse(body!);
        const startDate = DateTime.fromISO(checkpointView.start_date, { setZone: true });
        const endDate = DateTime.fromISO(checkpointView.end_date, { setZone: true });
        const format = 'yyyy-MM-dd';
        checkpointView.start_date = DateTime
            .fromFormat(startDate.toFormat(format), format, { zone: 'utc' })
            .startOf('day')
            .toISO();
        checkpointView.end_date = DateTime
            .fromFormat(endDate.toFormat(format), format, { zone: 'utc' })
            .endOf('day')
            .toISO();
        return checkpointView;
    }

    async postCheckpointsView({ body }: APIGatewayProxyEventV2) {
        const checkpointView = this.parseBody(body!);
        delete checkpointView.id;
        try {
            const result = await this.checkpointsCalculations.createOrUpdate(
                checkpointView,
            );
            await this.triggerIngest();
            return {
                statusCode: 200,
                body: JSON.stringify(result),
            };
        } catch (error) {
            console.error(JSON.stringify({
                message: "Error in postCheckpointsView",
                orgId: this.orgId,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async patchCheckpointsView({ body }: APIGatewayProxyEventV2) {
        const checkpointView = this.parseBody(body!);
        try {
            const allCheckpoints = await this.checkpointsCalculations.getCheckpoints();
            if (allCheckpoints.findIndex(i => i.id?.toString() === checkpointView.id.toString()) > -1) {
                const result = await this.checkpointsCalculations.createOrUpdate(
                    checkpointView,
                );
                await this.triggerIngest();
                return {
                    statusCode: 200,
                    body: JSON.stringify(result),
                };
            } else {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: "Checkpoint with id not found." }),
                };
            }
        } catch (error) {
            console.error(JSON.stringify({
                message: "Error in patchCheckpointsView",
                orgId: this.orgId,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async removeCheckpoint(event: APIGatewayProxyEventV2) {
        const checkpointId = event?.pathParameters?.id as string | undefined;

        if (!checkpointId) {
            return {
                statusCode: 422,
                body: JSON.stringify({
                    error: { message: 'checkpointId is required' },
                }),
            };
        }

        try {
            await this.checkpointsCalculations.deleteCheckpoint(checkpointId);
            return {
                statusCode: 200,
            };
        } catch (error) {
            console.error(JSON.stringify({
                message: "Error in removeCheckpoint",
                orgId: this.orgId,
                errorMessage: (error as Error).message,
                errorStack: (error as Error).stack,
            }));
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    /**
     * Send an event to eventbridge with the org ID to trigger
     * ingest of performance checkpoints for this org
     */
    private async triggerIngest() {
        await sendEvent(EVENTBRIDGE_SOURCE, { orgId: this.orgId });
    }
}

export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, CheckpointsHandler);
};

export const postCheckpointsView = async (event: APIGatewayProxyEventV2) => {
    return await new CheckpointsHandler(event).postCheckpointsView(event);
};

export const removeCheckpoint = async (event: APIGatewayProxyEventV2) => {
    return await new CheckpointsHandler(event).removeCheckpoint(event);
};

export const patchCheckpointsView = async (event: APIGatewayProxyEventV2) => {
    return await new CheckpointsHandler(event).patchCheckpointsView(event);
};

export const getCheckpointsSnasphots = async (
    event: APIGatewayProxyEventV2,
) => {
    return await new CheckpointsHandler(event).getCheckpointsSnasphots(event);
};

