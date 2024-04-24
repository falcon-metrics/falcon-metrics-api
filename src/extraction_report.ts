import { APIGatewayProxyEventV2 } from 'aws-lambda';
import axios from 'axios';
import _ from 'lodash';
import { Logger } from 'log4js';
import { DateTime } from 'luxon';
import { QueryTypes, Sequelize } from 'sequelize';
import { BaseHandler } from './common/base_handler';
import { HandleEvent } from './common/event_handler';
import { IContext } from './context/context_interfaces';
import { Project } from './data_v2/project';
import { IWorkItemType } from './data_v2/work_item_type_aurora';
import DatasourceModel, { DatasourceAttributes } from './models/DatasourceModel';
import { Secrets } from './secrets/secretsmanager_client';
import { INTERNAL_SERVER_ERROR_RESPONSE } from './utils/api';


class FitnessCriteriaHandler extends BaseHandler {
    readonly aurora: Promise<Sequelize>;
    readonly orgId: string;
    readonly context: IContext;
    readonly workItemType: IWorkItemType;
    readonly project: Project;
    readonly logger: Logger;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {});
        this.aurora = this.dependencyInjectionContainer.cradle.aurora;
        this.orgId = this.dependencyInjectionContainer.cradle.security.organisation;
        this.context = this.dependencyInjectionContainer.cradle.context;
        this.workItemType = this.dependencyInjectionContainer.cradle.workItemType;
        this.project = this.dependencyInjectionContainer.cradle.project;
        this.logger = this.dependencyInjectionContainer.cradle.logger;
    }
    async getContexts(datasourceId: string) {
        const allContexts = await this.context.getAllExceptArchived(this.orgId);
        const contexts = allContexts
            .filter(c => typeof c.contextAddress === 'string' && c.contextAddress.length > 0)
            .filter(c => c.datasourceId === datasourceId);
        return contexts;
    }

    /**
     * Call the database function. 
     * Renames the columns for better readablility
     */
    async runReportQuery(datasourceId: string) {
        const database = await this.aurora;
        const result = await database.query(
            `
            select * from get_extraction_report()
            where "col_orgId" = :orgId
            and "col_datasourceId" = :datasourceId
            `,
            {
                type: QueryTypes.SELECT,
                replacements: {
                    orgId: this.orgId,
                    datasourceId
                }
            }
        );

        return result.map((row: any) => ({
            datasourceId: row['col_datasourceId'],
            orgId: row['col_orgId'],
            contextId: row['col_contextId'],
            contextName: row['col_name'],
            cwim_count: Number.parseInt(row['cwim_count']),
            states_count: Number.parseInt(row['extracted_count']),
            cwim_states_diff: Number.parseInt(row['missing_count']),
        }));
    }

    async buildJQLExprs(datasourceId: string) {
        const contexts = await this.getContexts(datasourceId);
        const witm = await this.workItemType.getWorkItemTypeMaps(this.orgId, datasourceId);
        const projects = await this.project.getProjects(this.orgId, datasourceId);
        const exprs = projects.map(p => {
            const ids = witm
                .filter(m => m.projectId === p.projectId)
                .map(m => m.datasourceWorkItemId);
            return `(project in (${p.projectId}) and issuetype in (${ids.join(',')}))`;
        });
        const jqlExprs = contexts.map(c => `filter in (${c.contextAddress}) and (${exprs.join(' or ')})`);
        return _.zip(contexts, jqlExprs).map(([context, jql]) => ({ context, jql }));
    }


    /**
     * Convert date time to the format required by Azure
     */
    convertToSurrogateKeyFormat(
        isoFormattedString: string,
    ): string {
        const dateTime = DateTime.fromISO(isoFormattedString);
        const skFormat = dateTime.toFormat('yyyyLLdd');
        return skFormat;
    };

    /**
     * 
     * @param datasourceId 
     * @returns 
     */
    async buildFilterExprs(datasourceId: string, excludeDate: DateTime) {
        const contexts = await this.getContexts(datasourceId);
        const witm = await this.workItemType.getWorkItemTypeMaps(this.orgId, datasourceId);
        const projects = await this.project.getProjects(this.orgId, datasourceId);
        const filters = contexts.map(context => {
            const project = projects.find(p => context.projectId === p.projectId)!;
            if (!project) throw new Error('Project is undefined');
            const witmInProject = witm
                .filter(m => m.projectId === context.projectId)
                .map(m => `'${m.datasourceWorkItemId}'`)
                .join(',');
            const filter = `Area/AreaId in (${context.contextAddress}) and workitemtype in (${witmInProject}) and (ClosedDateSK eq null or ClosedDateSK ge ${this.convertToSurrogateKeyFormat(excludeDate.toISO())})`;
            return { filter, project, context };
        });
        return filters;
    }

    async getDatasource(datasourceId: string) {
        console.log("🚀 ~ file: extraction_report.ts:123 ~ FitnessCriteriaHandler ~ getDatasource ~ datasourceId:", datasourceId);
        const datasourceModel = await DatasourceModel();
        const datasource = await datasourceModel.findOne({
            where: { deletedAt: null, orgId: this.orgId, datasourceId },
        });
        console.log("🚀 ~ file: extraction_report.ts:127 ~ FitnessCriteriaHandler ~ getDatasource ~ datasource:", datasource?.toJSON());
        return datasource?.toJSON();
    }

    /**
     * Call the API of the datasource
     * @param url 
     * @param credentials `username:password` string 
     * @returns 
     */
    async makeRequest(url: string, credentials: string) {
        const encoded = Buffer.from(credentials).toString('base64');
        let config = {
            method: 'get' as any,
            maxBodyLength: Infinity,
            url,
            headers: {
                'Authorization': `Basic ${encoded}`,
            }
        };
        let response;
        try {
            response = await axios.request(config);
            response = response.data;
        } catch (error) {
            console.log(error);
        }
        return response;
    }

    async getCredentials(datasourceId: string) {
        const secretsManager = new Secrets({ logger: this.logger });
        const DATASOURCE_SECRET_PREFIX = 'datasource-secret';
        const DATASOURCE_SECRET_TOKEN_KEY = 'accessToken';
        const secretName = `${DATASOURCE_SECRET_PREFIX}/${this.orgId}/${datasourceId}`;

        const credentials = await secretsManager.getSecret(
            secretName,
            DATASOURCE_SECRET_TOKEN_KEY
        );

        if (!credentials) throw new Error('Credentials is undefined');
        return credentials;
    }

    async getJiraReport(datasource: DatasourceAttributes) {
        const datasourceId = datasource.datasourceId;
        const [credentials, queryResult, arr] = await Promise.all([
            this.getCredentials(datasourceId),
            this.runReportQuery(datasourceId),
            this.buildJQLExprs(datasourceId)
        ]);

        let excludeCompletedBefore = DateTime.fromJSDate(
            datasource.excludeItemsCompletedBeforeDate!
        );
        const baseUrl = `${datasource.serviceUrl}/search?maxResults=0`;
        arr.forEach((elem) => {
            const { jql } = elem;
            const url = `${baseUrl}&jql=((resolved is EMPTY OR resolved >= ${excludeCompletedBefore.toMillis()}) and ${jql})`;
            (elem as any).url = url;
        });

        const chunks = _.chunk(arr as any[], 10);
        const counts = [];
        for (const chunk of chunks) {
            const promises = chunk.map(({ url }) => this.makeRequest(url, credentials));
            const results = await Promise.all(promises);
            const arr = _.zip(chunk, results)
                .map(([obj, result]) => ({ ...obj, result, count: result?.total }));
            counts.push(...arr);
        }

        counts.forEach(c => {
            const findResult: any = queryResult
                .find(row => (row as any)['contextId'] === c.context?.id);
            if (findResult) {
                findResult.count = c.count;
                findResult.missing_cwims_count = c.count - findResult.cwim_count;
                findResult.missing_states_count = c.count - findResult.states_count;
            }
        });

        return queryResult;
    }

    async getAzureBoardsReport(datasource: DatasourceAttributes) {
        const datasourceId = datasource.datasourceId;
        const excludeDate = DateTime.fromJSDate(datasource.excludeItemsCompletedBeforeDate!);
        const [credentials, queryResult, arr1] = await Promise.all([
            this.getCredentials(datasourceId),
            this.runReportQuery(datasourceId),
            this.buildFilterExprs(datasourceId, excludeDate)
        ]);
        const arr2 = [];

        for (const elem of arr1) {
            const { context, filter, project } = elem;
            let url = [datasource.serviceUrl, project.name, '_odata/v2.0/WorkItems'].join('/');
            url = `${url}?$apply=filter(${(filter)})/aggregate($count as CountOfWorkItems)`;

            const result = await this.makeRequest(url, `.:${credentials}`);
            const count = result.value[0]?.CountOfWorkItems;
            arr2.push({ ...elem, url, count });

            const findResult: any = queryResult.find(row => row.contextId === context.id);
            if (!findResult) throw new Error('Could not find row for context in the report');
            findResult.count = count;
            findResult.missing_cwims_count = count - findResult.cwim_count;
            findResult.missing_states_count = count - findResult.states_count;
        }
        return queryResult;
    }

    async getEverything(event: APIGatewayProxyEventV2) {
        console.log("🚀 ~ file: extraction_report.ts:242 ~ FitnessCriteriaHandler ~ getEverything ~ event:", event);
        try {
            const datasourceId = event.pathParameters?.datasourceId;
            console.log("🚀 ~ file: extraction_report.ts:245 ~ FitnessCriteriaHandler ~ getEverything ~ datasourceId orgId:", datasourceId, this.orgId);
            if (!datasourceId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Datasource ID is a required path parameter' })
                };
            }

            const datasource = await this.getDatasource(datasourceId);
            console.log("🚀 ~ file: extraction_report.ts:251 ~ FitnessCriteriaHandler ~ getEverything ~ datasource:", datasource);
            if (!datasource) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Invalid datasource ID' })
                };
            }

            let report;
            if (datasource.datasourceType === 'jira-cloud' ||
                datasource.datasourceType === 'jira-server') {
                report = await this.getJiraReport(datasource);
            } else if (datasource.datasourceType === 'azure-boards') {
                report = await this.getAzureBoardsReport(datasource);
            }
            return {
                statusCode: 200,
                body: JSON.stringify({ report }),
            };
        } catch (error) {
            console.error(error);
            return INTERNAL_SERVER_ERROR_RESPONSE;
        }
    }
}

export const get = async (event: APIGatewayProxyEventV2) => {
    return HandleEvent(event, FitnessCriteriaHandler);
};
