import { asClass } from 'awilix';

import { BaseHandler } from '../common/base_handler';
import { HandleEvent } from '../common/event_handler';
import { RequestError } from '../common/request_middleware/errorHandler';
import { APIProcessedEvent } from '../common/request_middleware/interfaces';
import { OrganizationSettingAttributes } from '../models/SettingsModel';
import {
    InitiateEventPhotoUploadResponse,
    OrganizationSettings,
    PhotoMetadata,
} from './handleSettings';

class SettingsHandler extends BaseHandler {
    private settingsHandle: OrganizationSettings;

    constructor(event: APIProcessedEvent) {
        super(event, {
            settingsHandle: asClass(OrganizationSettings),
        });

        this.settingsHandle = this.dependencyInjectionContainer.cradle.settingsHandle;
    }

    post(event: APIProcessedEvent) {
        const { body } = event;
        const objective = JSON.parse(body!) as OrganizationSettingAttributes;

        return this.settingsHandle.postSettings(objective);
    }

    async getEverything({
        organisationId,
    }: APIProcessedEvent<{ subFolder: string }>) {
        const result = Math.ceil(Math.random() * 2);
        if (result === 1) {
            const settings = await this.settingsHandle.getSettings(
                organisationId,
            );
            return { settings, message: 'Test sucessful' };
        }
        throw new RequestError(
            'HI, Thiago, your test worked ;D',
            undefined,
            "It's ok, this is not really an error",
        );
    }

    async initiateupload({
        body,
        pathParameters,
    }: APIProcessedEvent<{ subFolder: string }, string>) {
        if (!pathParameters?.subFolder) {
            throw 'Missing pathParameter subFolder';
        }

        const photoBody = JSON.parse(body!) as PhotoMetadata;
        const photoMetadata: PhotoMetadata = {
            contentType: photoBody.contentType,
            title: photoBody.title,
            description: photoBody.description,
            extension: photoBody.extension,
        };

        try {
            const result: InitiateEventPhotoUploadResponse = await this.settingsHandle.generateS3SignedUrl(
                pathParameters.subFolder,
                photoMetadata,
            );

            return result;
        } catch (error) {
            throw 'Error generating s3 signed URL: ' + JSON.stringify(error);
        }
    }

    async getLabels() {
        return await this.settingsHandle.getLabels();
    }
}
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const getEverything = async (event: APIProcessedEvent) => {
    return HandleEvent(event, SettingsHandler);
};

export const post = async (event: APIProcessedEvent) => {
    return await new SettingsHandler(event).post(event);
};

export const initiateupload = async (event: APIProcessedEvent) => {
    return await new SettingsHandler(event).initiateupload(event);
};

export const getLabels = async (event: APIProcessedEvent) => {
    return await new SettingsHandler(event).getLabels();
};
