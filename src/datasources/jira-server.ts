import axios from 'axios';
import { morphism } from 'morphism';

import jwtToUser, { isUserAdmin } from './jwtToUser';
import { JiraServerDatasource as Provider } from './Providers';
import ProjectModel from '../models/ProjectModel';
import {
    buildResponse,
    FormatWorkflowResp,
    getHeader,
    workflowSchema,
} from './utils';
import _ from 'lodash';

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
    const { namespace, token, serviceUrl } = payload;
    let datasource;
    try {
        datasource = await Provider({
            organisationId,
            namespace,
        });
    } catch (error) {
        console.error(
            `Error when creating provider with payload ${JSON.stringify(
                payload,
            )}, error: ${error.message || error}`,
        );
        return buildResponse(500, {
            message: 'Create provider error',
        });
    }

    // const service = await datasource.service();
    try {
        const verified = await axios
            .get(`${serviceUrl}/rest/api/latest/project`, {
                headers: getHeader(token),
            })
            .then(({ data }) => data)
            .catch((error) => {
                console.log(error);
            });
        if (!(verified && Array.isArray(verified)))
            return buildResponse(400, {
                message:
                    'The datasource url, username or the personal access token is invalid',
            });

        await datasource.setSecret(token);
        const model = await datasource.save(serviceUrl);

        return {
            statusCode: 201,
            body: JSON.stringify(model),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify(error.errors || error),
        };
    }
};

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
        const getProjectUrl = `${service}/project`;
        try {
            const resp = await axios.get(getProjectUrl, {
                headers: getHeader(token),
            });
            const dataset = morphism(schema, resp.data);
            return {
                statusCode: 200,
                body: JSON.stringify(dataset),
            };
        } catch (error) {
            console.error(error);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    mesage: `Could not get project list from endpoint "${getProjectUrl}"`
                }),
            };
        }
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Could not retrieve project list'
            }),
        };
    }
};


const fetchStatusForProject = async (projectId: string, service: string, token: string) => {
    const data = await axios
        .get(`${service}/project/${projectId}/statuses`, {
            headers: getHeader(token),
        })
        .then(({ data }) => data);

    const items = (morphism(workflowSchema, data) as unknown) as any[];
    return { projectId, items };

};
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

        const workflows: any[] = [];
        const workflowsInProject: { [key: string]: any[]; } = {};

        // Fetch in chunks
        const chunks = _.chunk(projects, 10);
        for (const chunk of chunks) {
            const statuses = await Promise.all(chunk.map(p => fetchStatusForProject(p.projectId, service, token)));
            statuses.forEach(({ projectId, items }) => {
                workflowsInProject[projectId] = items.map((item) => ({
                    id: item.id,
                    steps: item.steps,
                }));

                workflows.push(...items);
            });
        }

        const resp = FormatWorkflowResp(workflows, projects, workflowsInProject);
        return {
            statusCode: 200,
            body: JSON.stringify(resp),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Could not retrieve workflows'
            }),
        };
    }
};

export const formatJiraServerContexts = (jiraApiResponse: any) => {
    return jiraApiResponse.map((contextResp: any) => {
        const projects = [];
        const singleProjectMatches = /project = (.*?) /g.exec(contextResp.jql);
        if (singleProjectMatches?.length) {
            const projectId = singleProjectMatches[1];
            projects.push(projectId);
        }
        const multiProjectsMatches = /project in \([^()]+\)/g.exec(
            contextResp.jql,
        );
        if (multiProjectsMatches?.length) {
            const projectIds = multiProjectsMatches[0]
                .replace(')', '')
                .split('(')[1]
                .split(',');
            projects.push(...projectIds);
        }
        return { id: contextResp.id, name: contextResp.name, projects };
    });
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

        let favoriteContexts = null;
        const url = `${service}/filter/favourite`;
        try {
            const response = await axios.get(url, { headers: getHeader(token) });
            favoriteContexts = response.data;
        } catch (err) {
            console.error(err);
            let message;
            if (err.code === "ETIMEDOUT") {
                message = `Timeout while loading "${url}" from address "${err.address}" (check if address allows access from this host)`;
            } else if (err.code) {
                message = `Error code "${err.code}" while retriving data from "${url}"`;
            } else {
                message = `Unknown error while retriving data from "${url}"`;
            }
            return {
                statusCode: 500,
                body: JSON.stringify({ error: message }),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify(formatJiraServerContexts(favoriteContexts)),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Could not retrieve contexts'
            }),
        };
    }
};

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
            id: 'id',
            datasourceFieldName: 'id',
            displayName: 'name',
        };

        const data = await axios
            .get(`${service}/field`, {
                params: {
                    projectIds: projectIds.join(','),
                    expand: 'projects.issuetypes.fields',
                },
                headers: getHeader(token),
            })
            .then(({ data }) => data);

        const morphedData = morphism(schema, data);

        return {
            statusCode: 200,
            body: JSON.stringify(morphedData),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Could not retrieve customfields'
            }),
        };
    }
};
