import axios, { AxiosError } from 'axios';
import btoa from 'btoa';
import _, { isEqual, orderBy, uniqWith } from 'lodash';
import { morphism } from 'morphism';
import ProjectModel, { Project } from '../models/ProjectModel';
import { AzureDatasource as Provider } from './Providers';
import { updateTrialInfo } from './jira-cloud';
import jwtToUser, { isUserAdmin } from './jwtToUser';
import { CustomFieldsConfigGet } from './types';
import { buildResponse, getHeader, projectContainsWorkflow } from './utils';

export const post = async (event: any) => {
    const {
        body,
        requestContext: {
            authorizer: { jwt },
        },
    } = event;

    const { organisationId, roles } = jwtToUser(jwt);
    if (!isUserAdmin(roles)) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: { message: 'Forbidden' } }),
        };
    }
    const payload = JSON.parse(body);
    const { namespace, token } = payload;
    const datasource = await Provider({
        organisationId,
        namespace,
    });
    const service = await datasource.service();
    const analytics = await datasource.analytics();

    try {
        const headers = { Authorization: `Basic ${btoa(token)}` };
        const projectsResult = await axios
            .get(`${service}/_apis/projects/`, { headers })
            .then((res) => res)
            .catch((error) => error.response);
        let message = 'Failed to validate work items api: ';
        let workItemAccessVerified = true;
        if (projectsResult.status !== 200) {
            workItemAccessVerified = false;
            message = message.concat(projectsResult.statusText);
            if (projectsResult.status === 404) {
                message = message.concat('; Datasource url is invalid');
            } else if (projectsResult.status === 401) {
                message = message.concat(
                    '; Make sure personal access token is correct also have Read permission on Work Items',
                );
            }
        } else if (!projectsResult.data?.value?.length) {
            workItemAccessVerified = false;
            message = message.concat(
                '; No project in this datasource, Make sure user has access to at least one project',
            );
        }
        if (!workItemAccessVerified) {
            return buildResponse(400, message);
        }

        const projectName = projectsResult.data.value[0].name;
        let analyticsVerified = true;

        const teamResult = await axios
            .get(`${analytics}/${projectName}/_odata/v2.0/teams`, {
                headers,
            })
            .then((res) => res)
            .catch((error) => error.response);
        if (teamResult.status !== 200) {
            analyticsVerified = false;
            message = 'Failed to validate analytics api';
            const isUnpaidError =
                teamResult.data?.error?.innererror?.type ===
                'Microsoft.VisualStudio.Services.Analytics.AnalyticsAccessCheckException';
            if (isUnpaidError) {
                message = message.concat(
                    ':Azure boards does not support access to the Analytics API with this license.\nPlease use a Personal Access Token from a user with a paid license.',
                );
            } else {
                message = message.concat(
                    `: ${teamResult.statusText}; Make sure personal access token is correct also has Read permission for analytics`,
                );
            }
        }

        //should also verify against analytics api
        //assumption: ado must have at least one project
        if (!analyticsVerified) return buildResponse(400, message);
        await datasource.setSecret(token.split(':')[1]);
        await datasource.save();

        await updateTrialInfo(organisationId, datasource.datasourceId);
        return buildResponse(201, 'Set credentials succeed');
    } catch (error) {
        console.log('error is %o', error);
        return buildResponse(500, (error as any).errors || error);
    }
};

export const projects = async (event: any) => {
    try {
        const {
            pathParameters: { namespace },
            requestContext: {
                authorizer: { jwt },
            },
        } = event;

        const { organisationId, roles } = jwtToUser(jwt);
        if (!isUserAdmin(roles)) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const datasource = await Provider({
            organisationId,
            namespace,
        });

        const service = await datasource.service();
        const token = await datasource.getSecret();
        const schema = {
            id: 'id',
            name: 'name',
        };
        const data = await axios
            .get(`${service}/_apis/projects/`, {
                headers: getHeader(token),
            })
            .then(({ data }) => data.value);

        const dataset = morphism(schema, data);

        return {
            statusCode: 200,
            body: JSON.stringify(dataset),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Could not retrieve projects',
            }),
        };
    }
};

const fetchWorkflows = async (projects: Project[], token: string, service: string) => {
    const stepSchema = {
        id: 'name',
        name: 'name',
        category: 'category',
    };
    const schema = {
        id: 'name',
        name: 'name',
        steps: {
            path: 'states',
            fn: (value: []) => morphism(stepSchema, value),
        },
    };

    const workflows: any[] = [];
    const workflowsInProject: { [key: string]: any[]; } = {};

    // Chunk the projects to prevent hitting the per-second quota
    // Reduce the size of the chunk if there are rate-limiting errors.
    // A possible enhancement here - Put the chunk size in a config file
    const chunks = _.chunk(projects, 10);
    for (const chunk of chunks) {
        const promises = [];
        const chunkStart = Date.now();
        for (const project of chunk) {
            const fn = async () => {
                try {
                    const header = {
                        headers: getHeader(token),
                    };
                    project.name =
                        (await getProjectName(
                            service,
                            header,
                            project.projectId,
                        )) || project.name;

                    const result = await axios.get(
                        `${service}/${project.projectId}/_apis/wit/workitemtypes`,
                        header,
                    );

                    const { data } = result;
                    const items = (morphism(
                        schema,
                        data.value,
                    ) as unknown) as any[];
                    workflowsInProject[project.projectId] = items.map(
                        (item) => ({
                            id: item.id,
                            steps: item.steps,
                        }),
                    );
                    workflows.push(...items);
                } catch (error) {
                    if (error instanceof Response && error.status === 404) {
                        console.error(
                            JSON.stringify({
                                message: 'Error when calling the Azure API',
                                // as unknown is not ideal, using it as a workaround here to avoid changing the if clause
                                httpStatus: ((error as unknown) as AxiosError)
                                    .response?.status,
                                url: ((error as unknown) as AxiosError)
                                    .response?.config.url,
                            }),
                        );
                    } else {
                        console.error(
                            JSON.stringify({
                                message: 'Error when calling the Azure API',
                                errorMessage: (error as Error).message,
                                errorStack: (error as Error).stack,
                                httpStatus: (error as AxiosError).response
                                    ?.status,
                                url: (error as AxiosError).response?.config
                                    .url,
                                errorJSON: (error as AxiosError).toJSON(),
                            }),
                        );
                        throw error;
                    }
                }
            };
            promises.push(fn());
        }
        await Promise.all(promises);
        const chunkEnd = Date.now();
        console.log(
            `Took ${chunkEnd - chunkStart}ms to process the chunk of ${chunk.length
            } projects`,
        );
    }

    return { workflows, workflowsInProject };
};

export const workflows = async (event: any) => {
    try {
        const {
            pathParameters: { namespace },
            requestContext: {
                authorizer: { jwt },
            },
        } = event;

        const { organisationId, roles } = jwtToUser(jwt);
        if (!isUserAdmin(roles)) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const datasourcePromise = Provider({
            organisationId,
            namespace,
        });
        const modelPromise = ProjectModel();
        const [datasource, model] = await Promise.all([
            datasourcePromise,
            modelPromise,
        ]);

        const [service, token, projects] = await Promise.all([
            datasource.service(),
            datasource.getSecret(),
            model.findAll({
                where: {
                    orgId: organisationId,
                    datasourceId: datasource.datasourceId,
                    deletedAt: null,
                },
            }),
        ]);

        const { workflows, workflowsInProject } = await fetchWorkflows(projects, token, service);

        const uniqUnion = orderBy(uniqWith(workflows, isEqual), ['id']);
        const resp = uniqUnion.map((workflow) => {
            const mappedProjects = projects.filter((project) => {
                return projectContainsWorkflow(
                    project.projectId,
                    workflow,
                    workflowsInProject,
                );
            });
            return {
                ...workflow,
                projects: mappedProjects.map((project) => project.projectId),
                projectNames: mappedProjects.map((project) => project.name),
            };
        });
        return {
            statusCode: 200,
            // body: JSON.stringify(workflows),
            body: JSON.stringify(resp),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Could not retrieve workflows',
            }),
        };
    }
};
const getProjectName = async (
    service: string,
    header: { headers: { Authorization: string; }; },
    projectId: string,
) => {
    const projectResult = await axios.get(
        `${service}/_apis/projects/${projectId}`,
        header,
    );
    const projectName = projectResult.data.name;
    return projectName;
};

export const contexts = async (event: any) => {
    try {
        const {
            pathParameters: { namespace },
            requestContext: {
                authorizer: { jwt },
            },
        } = event;

        const { organisationId, roles } = jwtToUser(jwt);
        if (!isUserAdmin(roles)) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const datasource = await Provider({
            organisationId,
            namespace,
        });

        const service = await datasource.service();
        const token = await datasource.getSecret();
        const model = await ProjectModel();
        const projects = await model.findAll({
            where: {
                orgId: organisationId,
                datasourceId: datasource.datasourceId,
                deletedAt: null,
            },
        });

        const contexts = [];
        const contextsInProject: { [key: string]: string[]; } = {};

        function extract(
            projectName: string,
            node: any,
            contextCollection: any[] = [],
            currentPath: any[] = []
        ) {
            if (!node) return;

            let pathName;

            const { name, path, identifier, structureType } = node;
            if (path && identifier && structureType === 'area') {
                pathName = _.concat(currentPath, name);
                contextCollection.push({ name: pathName.join(' > '), id: identifier });
            }

            if (Array.isArray(node.children)) {
                for (const child of node.children) {
                    extract(projectName, child, contextCollection, pathName);
                }
            }

            return contextCollection;
        }

        for (const project of projects) {
            const data = await axios
                .get(
                    `${service}/${project.projectId}/_apis/wit/classificationnodes?$depth=10`,
                    {
                        headers: getHeader(token),
                    },
                )
                .then(({ data }) => data.value);
            const projectName = project.name;
            const items: any[] = [];
            for (const record of data) {
                const paths: any = extract(projectName, record);
                items.push(...paths);
            }
            contextsInProject[project.projectId] = items.map(
                (item: any) => item.id,
            );
            contexts.push(...items);
        }

        const uniqUnion = orderBy(uniqWith(contexts, isEqual), ['id']);
        const resp = uniqUnion.map((context) => ({
            ...context,
            projects: projects
                .filter((project) =>
                    contextsInProject[project.projectId].includes(context.id),
                ).map((project) => project.projectId),
            /*  
                Added this to avoid changing other datasources that depend on the 'projects' structure being a string array in the UI.
                This is only used for displaying group/project names in the multiselect component. 
            */
            projectNames: projects
                .filter((project) =>
                    contextsInProject[project.projectId].includes(context.id),
                ).map((project) => project.name),
        }));

        return {
            statusCode: 200,
            body: JSON.stringify(resp),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Could not retrieve contexts',
            }),
        };
    }
};

const isFieldValid = (field: RawField): boolean => {
    // Azure Wizard custom fields need to:
    // Ignore system: html and string fields
    // All custom fields should be supported
    //https://docs.microsoft.com/en-us/azure/devops/boards/work-items/guidance/work-item-field?view=azure-devops
    return (
        //Azure boards custom fields do not start with System. OR Microsoft.VSTS
        field.type !== 'html'
        // Disabling this condition because a customer wants to ingest a plain text field
        // && field.type !== 'plainText'

        // Disabling this filter to display the Value Area field for ab-inbev
        // field.datasourceFieldName.split('.')[0] !== 'System' &&
        // field.datasourceFieldName.split('.')[0] !== 'Microsoft'
    );
};
const formatCustomFieldName = (name: string): string => {
    if (name.startsWith("Microsoft.VSTS")) {
        return _.last(name.split('.')) as string;
    }
    if (name.startsWith("System.")) {
        const suffix = _.last(name.split('.')) as string;

        // You have to use TagNames in the $select of the query to Azure
        // Hence handling Tags as a special case here
        if (suffix === 'Tags') return 'TagNames';
        return suffix;
    }
    //For analytics api, the "." separator of field name must be replace with "_", wtf
    let validName = name.replace('.', '_');
    validName = validName.replace(/-/g, '__002D'); //replace hyphen with unicode
    return validName;
};
type RawField = {
    id: string;
    datasourceFieldName: string;
    displayName: string;
    type: string;
};
export const customfields = async (event: any) => {
    try {
        const {
            pathParameters: { namespace },
            requestContext: {
                authorizer: { jwt },
            },
        } = event;

        const { organisationId, roles } = jwtToUser(jwt);
        if (!isUserAdmin(roles)) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const datasource = await Provider({
            organisationId,
            namespace,
        });

        const service = await datasource.service();
        const token = await datasource.getSecret();

        const schema = {
            id: 'referenceName',
            datasourceFieldName: 'referenceName',
            displayName: 'name',
            type: 'type',
        };
        const model = await ProjectModel();
        const projects = await model.findAll({
            where: {
                orgId: organisationId,
                datasourceId: datasource.datasourceId,
                deletedAt: null,
            },
        });
        const customFieldsList: Array<CustomFieldsConfigGet> = [];

        for (const project of projects) {
            const data = await axios
                .get(
                    `${service}/${project.projectId}/_apis/wit/fields?api-version=6.0`,
                    {
                        headers: getHeader(token),
                    },
                )
                .then(({ data }) => data.value);
            console.log(JSON.stringify({
                message: 'azure fields response _apis/wit/fields response',
                ...project,
                orgId: organisationId,
                data
            }));

            const dataset: any = morphism(schema, data);
            dataset.forEach(
                (row: {
                    id: any;
                    datasourceFieldName: any;
                    displayName: any;
                    type: string;
                }) => {
                    if (isFieldValid(row)) {
                        const fieldName = formatCustomFieldName(
                            row.datasourceFieldName,
                        );
                        const customField: any = {
                            id: fieldName,
                            datasourceFieldName: fieldName,
                            displayName: row.displayName,
                            projectId: project.projectId,
                            // Had to a add a new field just to do the blacklisting
                            // The "id" property should have the original data source field name
                            // But, the frontend breaks if you set the id to row.datasourceFieldName
                            idForBlacklisting: row.datasourceFieldName
                        };
                        customFieldsList.push(customField);
                    }
                },
            );
        }
        const filtered = removeBlackListItems(customFieldsList)
            // Remove the property added for blacklisting so that the API's internal details are not revealed
            .map(cf => { _.unset(cf, 'idForBlacklisting'); return cf; });
        return {
            statusCode: 200,
            body: JSON.stringify(filtered),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Could not retrieve customfields',
            }),
        };
    }
};

const customFieldsBlackList = [
    'Microsoft.VSTS.Common.AcceptanceCriteria',
    'Microsoft.VSTS.CodeReview.AcceptedDate',
    'Microsoft.VSTS.Common.ActivatedDate',
    'Microsoft.VSTS.Feedback.ApplicationLaunchInstructions',
    'Microsoft.VSTS.Feedback.ApplicationStartInformation',
    'System.AreaId',
    'System.AreaLevel1',
    'System.AreaLevel2',
    'System.AreaLevel3',
    'System.AreaLevel4',
    'System.AreaLevel5',
    'System.AreaLevel6',
    'System.AreaLevel7',
    'System.AssignedTo',
    'System.AttachedFiles',
    'System.AuthorizedDate',
    'Microsoft.VSTS.TCM.AutomatedTestId',
    'Microsoft.VSTS.TCM.AutomatedTestName',
    'Microsoft.VSTS.TCM.AutomatedTestStorage',
    'Microsoft.VSTS.TCM.AutomatedTestType',
    'Microsoft.VSTS.CMMI.CalledDate',
    'System.ChangedDate',
    'Microsoft.VSTS.Common.ClosedDate',
    'Microsoft.VSTS.CMMI.Comments',
    'Microsoft.VSTS.CMMI.ContingencyPlan',
    'Microsoft.VSTS.CMMI.CorrectiveActionActualResolution',
    'System.CreatedDate',
    'System.Description',
    'Custom.Epic_Discovery_timeStamp',
    'Custom.Epic_DiscoveryDone_timeStamp',
    'Microsoft.VSTS.Scheduling.FinishDate',
    'System.History',
    'System.Id',
    'Microsoft.VSTS.CMMI.ImpactAssessmentHtml',
    'Microsoft.VSTS.CMMI.ImpactOnArchitecture',
    'Microsoft.VSTS.CMMI.ImpactOnDevelopment',
    'Microsoft.VSTS.CMMI.ImpactOnTechnicalPublications',
    'Microsoft.VSTS.CMMI.ImpactOnTest',
    'Microsoft.VSTS.CMMI.ImpactOnUserExperience',
    'LegacyFinishDate',
    'LegacyStartDate',
    'System.LinkedFiles',
    'System.Parent',
    'Microsoft.VSTS.TCM.QueryText',
    'System.Reason',
    'System.RelatedLinks',
    'Microsoft.VSTS.TCM.ReproSteps',
    'Microsoft.VSTS.Common.Resolution',
    'Microsoft.VSTS.Common.ResolvedDate',
    'Microsoft.VSTS.Common.ResolvedReason',
    'System.RevisedDate',
    'Microsoft.VSTS.CMMI.RootCause',
    'Custom.Stage1_TimeStamp',
    'Custom.Stage2_TimeStamp',
    'Custom.Stage3_TimeStamp',
    'Microsoft.VSTS.Scheduling.StartDate',
    'System.State',
    'Microsoft.VSTS.Common.StateChangeDate',
    'Microsoft.VSTS.TCM.Steps',
    'Microsoft.VSTS.CMMI.Symptom',
    'Microsoft.VSTS.TCM.SystemInfo',
    'Microsoft.VSTS.CMMI.TargetResolveDate',
    'System.Title',
    'System.WorkItemType',
    'System.AreaPath',
    'System.TeamProject',
    'System.IterationPath',
    'System.BoardLane',
];

const removeBlackListItems = (objects: Array<any>) => {
    const results = objects.filter(
        ({ idForBlacklisting: id1 }) => !customFieldsBlackList.some((id2) => id2 === id1),
    );
    return results;
};
