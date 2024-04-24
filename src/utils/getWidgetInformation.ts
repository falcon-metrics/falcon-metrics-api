/* This requires licensing from Contentful CMS. For more information, visit https://www.contentful.com/
    * import { createClient } from 'contentful';
*/

import { getLogger } from 'log4js';
import { SecretsManagerClient } from '../secrets/secretsmanager_client';

export const LOCALES = [
    'en-AU',
    'es-ES'];

export const CONTENTFUL_SECRET_NAME = 'contentful';

export const FALLBACK_LOCALE = 'en-AU';

export type WidgetInformation = {
    name: string;
    key: string;
    whatIsThisTellingMe: string;
    howDoIReadThis?: string;
    whyIsThisImportant?: string;
    referenceGuide?: string;
    howIsItCalculated?: string;
};

export type Widgets = WidgetInformation[];
export default class ContentfulSecret extends SecretsManagerClient {

    async getSpaceId(): Promise<string | undefined> {
        if (process && process.env && process.env.CONTENTFUL_SPACE_ID_SECRET) {
            return process.env.CONTENTFUL_SPACE_ID_SECRET;
        }
        try {
            return await this.getSecret(CONTENTFUL_SECRET_NAME, 'CONTENTFUL_SPACE_ID');
        } catch (error) {
            console.error('Unable to retrieve contentful space id');
            return '';
        }
    }

    async getAccessToken(): Promise<string | undefined> {
        if (process && process.env && process.env.CONTENTFUL_ACCESS_TOKEN) {
            return process.env.CONTENTFUL_ACCESS_TOKEN;
        }
        try {
            return await this.getSecret(CONTENTFUL_SECRET_NAME, 'CONTENTFUL_ACCESS_TOKEN');
        } catch (error) {
            console.error('Unable to retrieve contentful access token');
            return '';
        }
    }
}

export const contentfulSecret = new ContentfulSecret({ logger: getLogger() });
export class WidgetInformationUtils {
    readonly clientLanguage?: string | null;
    readonly queryParameters: { [name: string]: string; } | null;
    widgetInformation: any | undefined = undefined;

    constructor(opts: {
        queryParameters: { [name: string]: string; } | null;
    }) {
        this.queryParameters = opts.queryParameters;
        if (!opts.queryParameters) return;
        this.clientLanguage = opts.queryParameters['lang'];
    }

    async getAllWidgetsFromContentful() {

    //     const client = createClient({
    //         space: await contentfulSecret.getSpaceId() || '',
    //         accessToken: await contentfulSecret.getAccessToken() || ''
    //     });

    //     const isLocaleExist = LOCALES.find((item) => item === this.clientLanguage) ? true : false;

    //     let result;

    //     if (isLocaleExist)
    //         result = await client.getEntries({ locale: this.clientLanguage });
    //     else
    //         result = await client.getEntries({ locale: FALLBACK_LOCALE });

        return {
            // widgets: result?.items.map(function (entry: any) {
            //     return entry.fields;
            // })
            widgets: []
        };
    }

    async getWidgetInformationByType(type: string) {
        if (this.widgetInformation === undefined) {
            this.widgetInformation = await this.getAllWidgetsFromContentful();
        }

        return this.widgetInformation.widgets.filter(
            (response: any) => response.key === type
        );
    }

    async getWidgetInformation(type: string) {
        const response = await this.getWidgetInformationByType(type);

        const result = response.map((res: any) => {
            return {
                name: res['name'],
                key: res['key'],
                whatIsThisTellingMe: res['whatIsThisTellingMe'],
                howDoIReadThis: res['howDoIReadThis'],
                whyIsThisImportant: res['whyIsThisImportant'],
                referenceGuide: res['referenceGuide'],
                howIsItCalculated: res['howIsItCalculated'],
            };
        });

        return result?.find((obj: any) => {
            return obj.whatIsThisTellingMe
                || obj.howDoIReadThis
                || obj.whyIsThisImportant
                || obj.referenceGuide
                || obj.howIsItCalculated;
        }) ? result : [];
    }
}
