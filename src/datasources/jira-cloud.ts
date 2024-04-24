import axios from 'axios';
import { flatten, isEqual, orderBy, uniqWith } from 'lodash';
import { DateTime } from 'luxon';
import { morphism } from 'morphism';

import DatasourceModel from '../models/DatasourceModel';
import Organisation from '../models/OrganisationModel';
import ProjectModel from '../models/ProjectModel';
import { getDeletedAtFilterCondition } from './delete/delete_functions';
import jwtToUser, { isUserAdmin } from './jwtToUser';
import { JiraCloudDatasource as Provider } from './Providers';
import { CustomFieldsConfigGet } from './types';
import {
    buildResponse,
    FormatWorkflowResp as formatWorkflowResp,
    getHeader,
    WorkflowResp,
    workflowSchema,
} from './utils';
import _ from 'lodash';

// POST /datasources/{provider}/{namespace}/projects
export const post = async (event: {
    body: any;
    requestContext: { authorizer: { jwt: any; }; };
}) => {
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
    const { namespace, token } = payload; //this token will be plain text
    const datasource = await Provider({
        organisationId,
        namespace,
    });
    const service = await datasource.service();

    try {
        const verified = await axios
            .get(`${service}/project/`, {
                headers: getHeader(token),
            })
            .then(({ data }) => data)
            .catch((error) => {
                console.log(error);
            });
        if (!verified?.length)
            return buildResponse(400, {
                message:
                    'The datasource url, username or the personal access token is invalid',
            });

        await datasource.setSecret(token);
        const model = await datasource.save();

        await updateTrialInfo(organisationId, datasource.datasourceId);
        return {
            statusCode: 201,
            body: JSON.stringify(model),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not save data due to error' }),
        };
    }
};

// GET /datasources/jira-cloud/{namespace}/projects/import
export const projects = async (event: {
    pathParameters: { namespace: any; };
    requestContext: { authorizer: { jwt: any; }; };
}) => {
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
            .get(`${service}/project/`, {
                headers: getHeader(token),
            })
            .then(({ data }) => data.filter((d: any) => !d.archived));

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

type Status = {
    description: string;
    iconUrl: string;
    name: string;
    id: string;
};

type JiraProject = {
    id: string;
    name: string;
    subtask: false;
    statuses: Status[];
};

// GET /datasources/jira-cloud/{namespace}/workflows/import
export const workflows = async (event: {
    pathParameters: { namespace: any; };
    requestContext: { authorizer: { jwt: any; }; };
}) => {
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
        const projectModel = await ProjectModel();
        const projects = await projectModel.findAll({
            where: {
                orgId: organisationId,
                datasourceId: datasource.datasourceId,
                deletedAt: null,
            },
        });

        const workflowsInProject: { [key: string]: WorkflowResp[]; } = {};


        // TODO: Refactor this. 
        // First fetch data, then process it with lodash
        // Dont do all at once. Do it in stages by chaining 
        // multiple .map to make the code easy to read
        const jiraWorkflowsByProject = flatten(
            await Promise.all(
                projects.map(async (project) => {
                    const url = `${service}/project/${project.projectId}/statuses`;
                    const options = { headers: getHeader(token) };
                    for (let i = 0; i < 3; i++) {
                        try {
                            const result = await axios.get<JiraProject>(
                                url,
                                options,
                            );
                            const data = result.data;
                            const statuses = (morphism(
                                workflowSchema,
                                data,
                            ) as unknown) as WorkflowResp[];
                            if (!workflowsInProject[project.projectId]) {
                                workflowsInProject[project.projectId] = [];
                            }
                            workflowsInProject[project.projectId].push(
                                ...statuses,
                            );
                            return statuses;
                        } catch (err) {
                            if (i === 0) {
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 500),
                                );
                                continue;
                            }
                            const error: any = err;
                            if (error && error.code === 'ETIMEDOUT') {
                                await new Promise((resolve) =>
                                    setTimeout(resolve, (i + 1) * 250),
                                );
                                continue;
                            }
                            throw err;
                        }
                    }
                    throw new Error(
                        'Could not retrieve status from project ' +
                        project.projectId,
                    );
                }),
            ),
        );

        const resp = formatWorkflowResp(
            jiraWorkflowsByProject,
            projects,
            workflowsInProject,
        );
        return {
            statusCode: 200,
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

export const contexts = async (event: {
    pathParameters: { namespace: any; };
    requestContext: { authorizer: { jwt: any; }; };
}) => {
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
        const projectModel = await ProjectModel();

        const projects = await projectModel.findAll({
            where: {
                orgId: organisationId,
                datasourceId: datasource.datasourceId,
                deletedAt: null,
            },
        });

        const contexts = [];
        const contextsInProject: { [key: string]: string[]; } = {};

        for (const project of projects) {
            const response = await axios.get(
                `${service}/filter/search?projectId=${project.projectId}&expand=jql`,
                {
                    headers: getHeader(token),
                },
            );
            const data: {
                id: string;
                name: string;
                description: string;
                self: string;
                owner: any;
                jql: string;
            }[] = response.data.values;

            const items = data.map(({ id, name, jql }) => ({ id, name, jql }));

            contextsInProject[project.projectId] = data.map(({ id }) => id);
            contexts.push(...items);
        }

        const uniqUnion = orderBy(uniqWith(contexts, isEqual), ['id']);

        const resp = uniqUnion.map((context) => {
            /**
             * Filters that pulls data from multiple projects are not permitted
             *
             * Identify multiple projects using the JQL expression:
             *  - jql contains 'project in (' expression
             *  - jql contains more than one iteration of 'project = ' expression
             *
             * If any of the conditions is true, set project id list as ['multiple]
             */
            const jqlPatternIn = context.jql.includes('project in (');
            const jqlPatternEquals =
                context.jql.match(/project\s*=/g)?.length || 0;

            return {
                ...context,
                projects: (() => {
                    const matchedProjects = projects.filter((project) =>
                        contextsInProject[project.projectId].includes(
                            context.id,
                        ),
                    );

                    if (
                        matchedProjects.length > 1 ||
                        jqlPatternIn ||
                        jqlPatternEquals > 1
                    ) {
                        return ['multiple'];
                    } else {
                        return matchedProjects.map(
                            (project) => project.projectId,
                        );
                    }
                })(),
            };
        });

        // remove 'jql' from the final response body   
        const response = resp.map(({ jql, ...rest }) => rest);

        return {
            statusCode: 200,
            body: JSON.stringify(response, null, 2) //JSON.stringify(resp),
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

// GET /datasources/jira-cloud/{namespace}/customfields/import
export const customfields = async (event: {
    pathParameters: { namespace: any; };
    requestContext: { authorizer: { jwt: any; }; };
}) => {
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
        const projectModel = await ProjectModel();
        const projects = await projectModel.findAll({
            where: {
                orgId: organisationId,
                datasourceId: datasource.datasourceId,
                deletedAt: null,
            },
        });
        const projectIds: string[] = projects.map((item) => item.projectId);

        const schema = {
            projects: 'projects',
        };

        const customFieldsObjectGet: Array<CustomFieldsConfigGet> = [];

        const data = await axios
            .get(`${service}/issue/createmeta`, {
                params: {
                    projectIds: projectIds.join(','),
                    expand: 'projects.issuetypes.fields',
                },
                headers: getHeader(token),
            })
            .then(({ data }) => data);

        const datasetParent: any = morphism(schema, data);

        datasetParent.projects.forEach((projectObject: any) => {
            const schemaIssueType = {
                id: 'id',
                issuetypes: 'issuetypes',
            };

            const datasetChild = morphism(schemaIssueType, projectObject);

            const issueTypesList: any = datasetChild.issuetypes;
            issueTypesList.forEach((customField: any) => {
                const schemaField = {
                    idType: 'id',
                    type: 'name',
                    fieldsList: 'fields',
                    //displayName: 'fields.summary.name',
                    //key: 'fields.summary.key',
                };
                const datasetCustomFields = morphism(schemaField, customField);

                const fieldsList: any = datasetCustomFields.fieldsList;
                for (const key in fieldsList) {
                    if (fieldsList.hasOwnProperty(key)) {
                        const value = fieldsList[key];
                        const displayName: string = value['name'];
                        const keyValue: string = value['key'];
                        customFieldsObjectGet.push({
                            id: keyValue,
                            datasourceFieldName: keyValue,
                            displayName: displayName,
                        });
                    }
                }
            });
        });
        const uniqUnion = orderBy(uniqWith(customFieldsObjectGet, isEqual), [
            'datasourceFieldName',
        ]);

        let filtered = removeBlackListItems(uniqUnion);
        filtered = removeBlackListItemsByDisplayName(filtered);

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
    'attachment',
    'customfield_10011',
    'customfield_10014', // Epic Link
    'customfield_10018', // Parent Link
    'description',
    'issuelinks',
    'parent',
    'summary',
    // 'duedate', Removing this for being used as desired delivery date
    'assignee',
    'resolution',
    'project',
    'issuetype',
];

const removeBlackListItems = (objects: Array<CustomFieldsConfigGet>) => {
    const results = objects.filter(
        ({ id: id1 }) => !customFieldsBlackList.some((id2) => id2 === id1),
    );
    return results;
};

const customFieldsDisplayNamesBlackList = [
    // Some fields are represented by different field names in
    // different orgs.
    'Flagged',
    // Dont know if sprint has different field names in different orgs, filtering by display name just in case
    // 'Sprint',
];

/**
 *
 * The flagged field is represented by different field names
 * in different orgs.
 */
const removeBlackListItemsByDisplayName = (
    objects: Array<CustomFieldsConfigGet>,
) => {
    const results = objects.filter(
        ({ displayName }) =>
            !customFieldsDisplayNamesBlackList.some(
                (blacklistedName) => blacklistedName === displayName,
            ),
    );
    return results;
};

//TODO: note to move this to Trial class to be more consistent
export const updateTrialInfo = async (orgId: string, datasourceId: string) => {
    const model = await Organisation();

    const orgItems: Record<any, any> | null = await model.findOne({
        where: { id: orgId },
    });

    //check if it's on trial
    if (orgItems?.isOnTrial) {
        // check if there's already a datasource (don't update again)
        const datasourceModel = await DatasourceModel();

        const allDatasources: any = await datasourceModel.findAll({
            where: getDeletedAtFilterCondition({ orgId }),
        });

        const notIn = [datasourceId];
        const remainingDatasources = allDatasources.filter(
            ({ datasourceId: id }: any) => !notIn.some((id2) => id2 === id),
        );

        //updateFromDemoToTrial
        if (remainingDatasources.length <= 0) {
            // update 14-day trial
            const newDate = DateTime.utc().plus({ days: 14 }).toUTC();
            const orgPayload = { trialEndDate: newDate };
            await model.update(orgPayload, {
                where: { id: orgId } as any,
            } as any);
        }
    }
};
