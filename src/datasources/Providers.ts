import { MD5 } from 'crypto-js';
import slugify from 'slugify';
import btoa from 'btoa';

import DatasourceModel, {
    DatasourceAttributes,
} from '../models/DatasourceModel';
import DatasourceJob from '../models/DatasourceJobModel';
import SecretsManager from './SecretsManager';
import { Op } from 'sequelize';
import { getDeletedAtFilterCondition } from './delete/delete_functions';
export type DatasourceItem = {
    orgId: string;
    datasourceId: string;
    serviceUrl: string;
};
export const Providers = {
    Azure: 'azure-boards',
    JiraCloud: 'jira-cloud',
    JiraServer: 'jira-server',
    Kanbanize: 'kanbanize',
} as const;

const formatToken = (token: string) => {
    return `Basic ${btoa(token)}`;
};

export type ProviderType = typeof Providers[keyof typeof Providers];

type Params = {
    organisationId: string;
    namespace: string;
};
type DatasourceIdParams = {
    organisationId: string;
    namespace: string;
    provider: string;
};
export async function DatasourceId({
    provider,
    organisationId,
    namespace,
}: DatasourceIdParams) {
    //Try find the datasource item first
    const datasourceModel = await DatasourceModel();
    const datasource = await datasourceModel.findOne({
        where: getDeletedAtFilterCondition({
            datasourceType: provider,
            orgId: organisationId,
            serviceUrl: {
                [Op.like]: `%${namespace}%`,
            },
        }),
    });
    if (datasource) {
        const datasourceItem = (datasource as any).toJSON() as DatasourceItem;
        return datasourceItem.datasourceId;
    }
    const key = `${provider}/${organisationId}/${slugify(
        namespace,
    )}`.toLowerCase();
    return MD5(key).toString();
}

export async function JiraServerDatasource({
    organisationId,
    namespace,
}: Params) {
    const provider = Providers.JiraServer;
    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    }); //TODO: Use datasourceId if found in database
    const secretsmanager = SecretsManager({
        provider,
        organisationId,
        namespace,
    });

    async function getSecret() {
        return formatToken(await (await secretsmanager).secret());
    }

    async function setSecret(secret: string) {
        return (await secretsmanager).save(secret);
    }

    async function service() {
        const datasourceModel = await DatasourceModel();
        const datasource = await datasourceModel.findOne({
            where: getDeletedAtFilterCondition({
                orgId: organisationId,
                datasourceId,
            }),
        });
        return (datasource as any)?.getDataValue(
            'serviceUrl',
        ) as string;
    }

    async function save(serviceUrl?: string) {
        const datasourceModel = await DatasourceModel();
        const datasourceJobsModel = await DatasourceJob();
        const url = serviceUrl
            ? `${serviceUrl}/rest/api/latest`
            : `https://${namespace}/rest/api/latest`;

        const datasource = await datasourceModel.upsert({
            orgId: organisationId,
            serviceUrl: url,
            enabled: false,
            datasourceId,
            datasourceType: provider,
            runType: 'extract-jiracloud',
            batchSizeStateItems: 500,
            runDelayStateMinutes: 6,
            accessCredentialsKey: 'JC_TOKEN',
            accessCredentialsType: 'secretsManager',
            deletedAt: null,
        });

        const datasourceJobs = await datasourceJobsModel.upsert({
            orgId: organisationId,
            datasourceId,
            jobName: 'extract-jiracloud-customfields',
            deletedAt: null,
        });

        return { ...datasource, ...datasourceJobs };
    }

    return { provider, service, datasourceId, getSecret, setSecret, save };
}

export async function JiraCloudDatasource({
    organisationId,
    namespace,
}: Params) {
    const provider = Providers.JiraCloud;
    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });
    const secretsmanager = SecretsManager({
        provider,
        organisationId,
        namespace,
    });

    async function getSecret() {
        const rawToken = await (await secretsmanager).secret();
        if (rawToken === undefined || rawToken === null) {
            throw new Error("Token could not be retrieved correctly");
        }
        return formatToken(rawToken);
    }

    async function setSecret(secret: string) {
        return (await secretsmanager).save(secret);
    }

    async function service() {
        return Promise.resolve(`https://${namespace}.atlassian.net/rest/api/3`);
    }

    async function save() {
        const datasourceModel = await DatasourceModel();
        const datasourceJobsModel = await DatasourceJob();
        const serviceUrl = await service();

        const datasource = await datasourceModel.upsert({
            orgId: organisationId,
            serviceUrl,
            enabled: false,
            datasourceId,
            datasourceType: provider,
            runType: 'extract-jiracloud',
            batchSizeStateItems: 500,
            runDelayStateMinutes: 6,
            accessCredentialsKey: 'JC_TOKEN',
            accessCredentialsType: 'secretsManager',
            deletedAt: null,
        });

        const datasourceJobs = await datasourceJobsModel.upsert({
            orgId: organisationId,
            datasourceId,
            jobName: 'extract-jiracloud-customfields',
            deletedAt: null,
        });

        return { ...datasource, ...datasourceJobs };
    }

    return { provider, service, datasourceId, getSecret, setSecret, save };
}

export async function AzureDatasource({ organisationId, namespace }: Params) {
    const provider = Providers.Azure;
    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });

    const secretsmanager = SecretsManager({
        provider,
        organisationId,
        namespace,
    });

    async function getSecret() {
        const personalAccessToken = await (await secretsmanager).secret();
        return `Basic ${btoa('falcon-metrics:'.concat(personalAccessToken))}`;
        /*
        the email part can be whatever, 
        But we need to include an email part,
        or else the base64 encode will be incorrect. 
        */
    }

    async function setSecret(secret: string) {
        return (await secretsmanager).save(secret);
    }

    async function service() {
        return Promise.resolve(`https://dev.azure.com/${namespace}`);
    }
    async function analytics() {
        return Promise.resolve(`https://analytics.dev.azure.com/${namespace}`);
    }

    async function save() {
        const datasourceModel = await DatasourceModel();
        const datasourceJobsModel = await DatasourceJob();
        const serviceUrl = await analytics();

        const datasource = await datasourceModel.upsert({
            orgId: organisationId,
            serviceUrl,
            enabled: false,
            datasourceId,
            datasourceType: provider,
            runType: 'extract-azureboards',
            batchSizeStateItems: 500,
            runDelayStateMinutes: 6,
            accessCredentialsKey: 'AB_TOKEN',
            accessCredentialsType: 'secretsManager',
            deletedAt: null,
        });

        const datasourceJobs = await datasourceJobsModel.upsert({
            orgId: organisationId,
            datasourceId,
            jobName: 'extract-jiracloud-customfields',
            deletedAt: null,
        });

        return { ...datasource, ...datasourceJobs };
    }

    return {
        provider,
        service,
        datasourceId,
        getSecret,
        setSecret,
        save,
        analytics,
    };
}

export async function KanbanizeDatasource({
    organisationId,
    namespace,
}: Params) {
    const provider = Providers.Kanbanize;
    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });
    const secretsmanager = SecretsManager({
        provider,
        organisationId,
        namespace,
    });

    async function getSecret(formatted = true) {
        const rawToken = await (await secretsmanager).secret();
        if (rawToken === undefined || rawToken === null) {
            throw new Error("API key could not be retrieved correctly");
        }
        return formatted ? formatToken(rawToken) : rawToken;
    }

    async function setSecret(secret: string) {
        return (await secretsmanager).save(secret);
    }

    async function service() {
        return Promise.resolve(`https://${namespace}.kanbanize.com/api/v2`);
    }

    async function save() {
        const datasourceModel = await DatasourceModel();
        const datasourceJobsModel = await DatasourceJob();
        const serviceUrl = await service();

        const datasource = await datasourceModel.upsert({
            orgId: organisationId,
            serviceUrl,
            enabled: false,
            datasourceId,
            datasourceType: provider,
            runType: 'extract-kanbanize',
            batchSizeStateItems: 500,
            runDelayStateMinutes: 6,
            accessCredentialsKey: 'KANBANIZE_TOKEN',
            accessCredentialsType: 'secretsManager',
            deletedAt: null,
        });

        const datasourceJobs = await datasourceJobsModel.upsert({
            orgId: organisationId,
            datasourceId,
            jobName: 'extract-kanbanize-customfields',
            deletedAt: null,
        });

        return { ...datasource, ...datasourceJobs };
    }

    return { provider, service, datasourceId, getSecret, setSecret, save };
}

