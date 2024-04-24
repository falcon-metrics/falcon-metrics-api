import { find } from 'lodash';

import ProjectModel, { Project } from '../models/ProjectModel';
import { writerConnection } from '../models/sequelize';
import { deleteProjects } from './delete/delete_functions';
import jwtToUser, { isUserAdmin } from './jwtToUser';
import { DatasourceId, Providers } from './Providers';
import { kickOffReIngest } from './utils';

export const get = async (event: any) => {
    const {
        pathParameters: { provider, namespace },
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
    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });
    try {
        const projectModel = await ProjectModel();
        const resp = await projectModel.findAll({
            where: { datasourceId, orgId: organisationId, deletedAt: null },
        });

        let result: any[] = resp;

        if (provider === Providers.Kanbanize) {
            result = resp.map((res: any) => ({
                id: res.projectId,
                ...res.dataValues
            }));
        }

        return {
            statusCode: 201,
            body: JSON.stringify(result),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify(error),
        };
    }
};

export const post = async (event: any) => {
    const {
        body,
        pathParameters: { provider, namespace },
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
    const payload = JSON.parse(body) as [];
    const datasourceId = await DatasourceId({
        provider,
        organisationId,
        namespace,
    });
    const keys = {
        orgId: organisationId,
        datasourceType: provider,
        datasourceId,
    };
    const projects = payload.map(({ projectId, name, workspace }) => ({
        ...keys,
        projectId,
        name,
        workspace: provider !== Providers.Kanbanize ? null : workspace
    }));
    const aurora = await writerConnection();
    const transaction = await aurora.transaction();

    try {
        const projectModel = await ProjectModel(aurora);
        const activeProjectsFromDb = await projectModel.findAll({
            where: { ...keys, deletedAt: null },
            attributes: [
                'orgId',
                'datasourceId',
                'projectId',
                'datasourceType',
            ],
        });
        const projectsToDelete = activeProjectsFromDb.filter(
            ({ projectId }) =>
                !find(projects, {
                    projectId,
                }),
        );
        //remove workItems
        //remove workItemType and workflow configs
        if (projectsToDelete.length) {
            await deleteProjects(
                projectsToDelete,
                organisationId,
                datasourceId,
                aurora,
                transaction,
            );
        }
        const resp: Promise<[Project, boolean | null]>[] = [];
        projects.forEach((project) => {
            resp.push(
                projectModel.upsert(
                    { ...project, deletedAt: null },
                    { transaction },
                ),
            );
        });
        const awaitedResponse = (await Promise.all(resp)).map(
            ([project]) => project,
        );

        // insertWorkItemTypeMaps(projects, event);
        await kickOffReIngest(organisationId, datasourceId);
        await transaction.commit();
        return {
            statusCode: 201,
            body: JSON.stringify(awaitedResponse),
        };
    } catch (error) {
        await transaction.rollback();
        if (error && (error as any).dependencies) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    dependencies: (error as any).dependencies,
                    message: (error as any).message
                }),
            };
        }
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: "Unknown error at datasource projects"
            }),
        };
    }
};
