import { asClass } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import {
    OrganizationSettings,
    InitiateEventPhotoUploadResponse,
    PhotoMetadata,
} from './handleSettings';
import { HandleEvent } from '../common/event_handler';
import jwtToUser from '../datasources/jwtToUser';
import { OrganizationSettingAttributes } from '../models/SettingsModel';

class SettingsHandler extends BaseHandler {
    private settingsHandle: OrganizationSettings;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            settingsHandle: asClass(OrganizationSettings),
        });

        this.settingsHandle = this.dependencyInjectionContainer.cradle.settingsHandle;
    }

    private getError = (error: any) => {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify(error.errors || error),
        };
    };

    async post(event: APIGatewayProxyEventV2) {
        const { body } = event;
        const objective = JSON.parse(body!) as OrganizationSettingAttributes;

        try {
            const settings = await this.settingsHandle.postSettings(objective);
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify(settings),
            };
        } catch (error) {
            this.getError(error);
        }
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        const {
            requestContext: { authorizer },
        } = event;
        if (!authorizer?.jwt?.claims) {
            return this.getError('Authorization fail');
        }
        const { jwt } = authorizer;
        const { organisationId } = jwtToUser(jwt);

        try {
            const settings = await this.settingsHandle.getSettings(
                organisationId,
            );
            return {
                statusCode: 200,
                headers: {
                    /* Required for CORS support to work */
                    'Access-Control-Allow-Origin': '*',
                    /* Required for cookies, authorization headers with HTTPS */
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify(settings),
            };
        } catch (error) {
            this.getError(error);
        }
    }

    async initiateupload(event: APIGatewayProxyEventV2) {
        console.log('in initiateupload');
        if (!event.pathParameters?.subFolder) {
            return this.getError('Missing pathParameter subFolder');
        }

        const {
            body,
            pathParameters: { subFolder },
        } = event;

        const photoBody = JSON.parse(body!) as PhotoMetadata;
        const photoMetadata: PhotoMetadata = {
            contentType: photoBody.contentType,
            title: photoBody.title,
            description: photoBody.description,
            extension: photoBody.extension,
        };

        try {
            const result: InitiateEventPhotoUploadResponse = await this.settingsHandle.generateS3SignedUrl(
                subFolder,
                photoMetadata,
            );

            return {
                statusCode: 200,
                headers: {
                    /* Required for CORS support to work */
                    'Access-Control-Allow-Origin': '*',
                    /* Required for cookies, authorization headers with HTTPS */
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify(result),
            };
        } catch (error) {
            console.debug('Error generating s3 signed URL: ', error);
            return this.getError(error);
        }
    }

    async getLabels() {
        try {
            const labels = await this.settingsHandle.getLabels();

            return {
                statusCode: 201,
                body: JSON.stringify(labels),
            };
        } catch (error) {
            return this.getError(error);
        }
    }
}
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const getEverything = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, SettingsHandler);
};

export const post = async (event: APIGatewayProxyEventV2) => {
    return await new SettingsHandler(event).post(event);
};

export const initiateupload = async (event: APIGatewayProxyEventV2) => {
    return await new SettingsHandler(event).initiateupload(event);
};

export const getLabels = async (event: APIGatewayProxyEventV2) => {
    return await new SettingsHandler(event).getLabels();
};
