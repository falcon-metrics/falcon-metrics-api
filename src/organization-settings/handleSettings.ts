import AWS from 'aws-sdk';
import S3 from 'aws-sdk/clients/s3';
import { Logger } from 'log4js';
import { Transaction } from 'sequelize';
import { v4 as uuidV4 } from 'uuid';

import { SecurityContext } from '../common/security';
import DatasourceModel from '../models/DatasourceModel';
import SettingsModel, {
    OrganizationSettingAttributes,
} from '../models/SettingsModel';
import { SnapshotModel } from '../models/SnapshotModel';
import { StateModel } from '../models/StateModel';
import { IState } from '../workitem/state_aurora';


export type PhotoMetadata = {
    contentType: string;
    title: string;
    description: string;
    extension: string;
};

export type InitiateEventPhotoUploadResponse = {
    photoId?: string;
    s3PutObjectUrl?: string;
};

export interface IOrgSetting {
    getSettings(orgId: string): Promise<OrganizationSettingAttributes | null>;
}

type Labels = {
    portfolio: string;
    initiative: string;
    team: string;
};

const defaultLabels: Readonly<Labels> = {
    portfolio: 'Portfolio',
    initiative: 'Initiative',
    team: 'Team',
};

export class OrganizationSettings implements IOrgSetting {
    private orgId: string;
    private auroraWriter: any;
    private cache: Map<string, Promise<OrganizationSettingAttributes | null>>;

    constructor(opts: {
        security: SecurityContext;
        logger: Logger;
        state: IState;
        auroraWriter: any;
    }) {
        this.orgId = opts.security.organisation!;
        this.auroraWriter = opts.auroraWriter;
        this.cache = new Map();
    }

    async postSettings(
        settings: OrganizationSettingAttributes,
    ): Promise<OrganizationSettingAttributes> {
        const t = (await (
            await this.auroraWriter
        ).transaction()) as Transaction;
        try {
            await this.saveSettings(settings, t);
            await this.handleAssigneeAndTitle(settings, t);
            await t.commit();
        } catch (error) {
            await t.rollback();
            console.debug('Error saving Settings: ', (error as Error).message);
            throw error;
        }
        return settings;
    }

    private async saveSettings(
        settings: OrganizationSettingAttributes,
        transaction: Transaction,
    ) {
        settings.orgId = this.orgId;
        const model = await SettingsModel();
        await model.upsert(settings, { transaction });
        return settings;
    }

    async getSettings(
        orgId: string,
    ): Promise<OrganizationSettingAttributes | null> {
        if (this.cache.has(orgId)) {
            return this.cache.get(orgId) ?? null;
        }

        // Had to add this wrapper because there are 2 promises
        // If you await for the first promise, it causes a cache miss
        // Instead you have to use await only once
        const f = async () => {
            const model = await SettingsModel();
            const settings = await model.findOne({
                where: {
                    orgId,
                } as any,
            });
            return settings;
        };
        const promise = f();

        this.cache.set(orgId, promise);
        return promise;
    }

    async generateS3SignedUrl(
        subfolder: string,
        metadata: PhotoMetadata,
    ): Promise<InitiateEventPhotoUploadResponse> {
        const S3_BUCKET = 'falcon-metrics-settings-logo-storage';

        AWS.config.update({
            accessKeyId: process.env.PROD_API_USER_AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.PROD_API_USER_AWS_SECRET_ACCESS_KEY,
        });

        const myBucket = new AWS.S3({
            params: { Bucket: S3_BUCKET },
        });

        const photoId = uuidV4();

        const req: S3.Types.PutObjectRequest = {
            Bucket: S3_BUCKET,
            Key: `logos/${subfolder}/${photoId}.${metadata.extension}`,
            ContentType: metadata.contentType,
            CacheControl: 'max-age=31557600', // instructs CloudFront to cache for 1 year
            Metadata: {
                ...metadata,
                photoId,
                subfolder,
            },
        };
        const s3PutObjectUrl = await myBucket.getSignedUrlPromise(
            'putObject',
            req,
        );
        const result: InitiateEventPhotoUploadResponse = {
            photoId,
            s3PutObjectUrl,
        };

        return result;
    }

    async getLabels(): Promise<Labels> {
        const model = await SettingsModel();
        const orgSettings = await model.findOne({
            where: {
                orgId: this.orgId,
            } as any,
        });

        if (!orgSettings) {
            return defaultLabels;
        }

        return {
            portfolio: orgSettings.portfolioDisplayName,
            initiative: orgSettings.initiativeDisplayName,
            team: orgSettings.teamDisplayName,
        };
    }
    /**
     * Check if assignee / title is switched on or off
     */
    async handleAssigneeAndTitle(
        newSettings: OrganizationSettingAttributes,
        transaction: Transaction,
    ): Promise<void> {
        const currentSettings = (await this.getSettings(this.orgId)) as {
            ingestAssignee: boolean;
            ingestTitle: boolean;
        };
        if (!currentSettings) return; //user creating new settings, no action needed;
        const removeAssignee =
            currentSettings.ingestAssignee === true &&
            newSettings.ingestAssignee === false;
        const removeTitle =
            currentSettings.ingestTitle === true &&
            newSettings.ingestAssignee === false;

        if (removeAssignee === true || removeTitle === true) {
            await this.removeAssigneeAndTitle(
                removeAssignee,
                removeTitle,
                transaction,
            );
        }
        const shouldRestart =
            (newSettings.ingestAssignee === true &&
                currentSettings.ingestAssignee === false) ||
            (newSettings.ingestTitle === true &&
                currentSettings.ingestTitle === false);
        if (shouldRestart) {
            await this.reingestAssigneeOrTitle(transaction);
        }
    }
    async removeAssigneeAndTitle(
        removeAssignee: boolean,
        removeTitle: boolean,
        transaction: Transaction,
    ): Promise<void> {
        const database = await this.auroraWriter;
        //update state model
        //update snapshot model
        const stateModel = StateModel(database);
        const snapshotModel = SnapshotModel(database);
        const updateParams: any = {};
        if (removeAssignee === true) updateParams.assignedTo = null;
        if (removeTitle === true) updateParams.title = null;
        await stateModel.update(updateParams, {
            where: {
                partitionKey: `state#${this.orgId}`,
            } as any,
            transaction,
        } as any);
        // We don't have to write to the snapshots table. 
        // This takes more than 30 seconds, it causes the lambda to time out
        // await snapshotModel.update(updateParams, {
        //     where: {
        //         partitionKey: `snapshot#${this.orgId}`,
        //     },
        //     transaction,
        // });
    }
    async reingestAssigneeOrTitle(transaction: Transaction) {
        const datasourceModel = await DatasourceModel();
        await datasourceModel.update(
            {
                nextRunStartFrom: null,
            },
            {
                where: {
                    orgId: this.orgId,
                    deletedAt: null,
                } as any,
                transaction,
            } as any,
        );
    }
}
