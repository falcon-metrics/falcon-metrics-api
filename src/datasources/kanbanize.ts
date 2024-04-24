import axios from 'axios';
import { DateTime } from 'luxon';
import { morphism } from 'morphism';

import DatasourceModel from '../models/DatasourceModel';
import Organisation from '../models/OrganisationModel';
import { getDeletedAtFilterCondition } from './delete/delete_functions';
import jwtToUser, { isUserAdmin } from './jwtToUser';
import { KanbanizeDatasource as Provider } from './Providers';
import {
    buildResponse,
    getHeader,
    getKanbanizeHeader,
} from './utils';
import ProjectModel from '../models/ProjectModel';
import _ from 'lodash';
import { boardsData, cardTypesData, workspacesData } from '../kanbanize/types';

type Column = {
    id: number;
    name: string;
    workflowId: number;
    parentId: number;
    displayName?: string;
    category?: string;
};

type Workflow = {
    id: number;
    name: string;
    projectId: number;
    sectionColumns?: Record<string, number[]>;
    // Couldnt get this to work. There's something wrong. 
    // Thats why this property is optional
    columnsOrder: number[],
    events?: {
        arrivalPoint: number;
        commitmentPoint: number;
        departurePoint: number;
    };
    workspace?: string;
    projects?: any;
    projectNames?: any;
} & Partial<KeyWorkflowEvents>;


type CardTypes = {
    /* TODO: rename the usages of `id` and `name` in the UI first and then here:
        cardTypeId: number;
        cardTypeName: string;
    */
    id: string;
    name: string;
    level: string;
    serviceLevelExpectationInDays: number;
};

type Boards = {
    /* TODO: rename the usages of `id`, `name`, and `workspace` in the UI first and then here:
        boardId: number;
        boardName: string;
        workspaceName: string;
    */
    id: string;
    name: string;
    workspaceId: number;
    workspace: string;
    projects: string[];
    projectNames: string[];
    cardTypes: CardTypes[];

};

export type KeyWorkflowEvents = {
    arrivalId: string;
    commitmentId: string;
    departureId: string;
};

// GET /datasources/kanbanize/{namespace}/workspaces/import
export const getWorkspaces = async (event: {
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
            id: 'workspace_id',
            name: 'name',
        };
        const data = await axios
            .get(`${service}/workspaces/`, {
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
                message: 'Could not retrieve workspaces',
            }),
        };
    }
};

// POST /datasources/{provider}/workspaces
export const postWorkspaces = async (event: {
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
            .get(`${service}/workspaces/`, {
                headers: getKanbanizeHeader(token),
            })
            .then(({ data }) => data)
            .catch((error) => {
                console.log(error);
            });

        if (!verified.data.length)
            return buildResponse(400, {
                message:
                    'The datasource url or API key is invalid',
            });

        await datasource.setSecret(token);
        const model = await datasource.save();

        await updateTrialInfo(organisationId, datasource.datasourceId);
        return {
            statusCode: 201,
            body: JSON.stringify(model),
        };
    } catch (error) {
        console.log(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not save data due to error' }),
        };
    }
};

// GET /datasources/kanbanize/{namespace}/projects/import
// in Kabanize, this one is called 'boards'
export const getProjects = async (event: {
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
        const token = await datasource.getSecret(false);

        const workspacesResponse = await axios
            .get(`${service}/workspaces/`, {
                headers: getKanbanizeHeader(token),
            });

        const boardsResponse = await axios
            .get(`${service}/boards?is_archived=0`, {
                headers: getKanbanizeHeader(token),
            });

        const workspaces = workspacesResponse?.data.data;

        const data = boardsResponse?.data?.data || [];
        // Merge workspaces and data using workspace_id as the key
        const mergedData = data.map((item: any) => ({
            ...item,
            workspace: workspaces.find(({ workspace_id }: any) => workspace_id === item.workspace_id)?.name || '',
        }));

        return {
            statusCode: 200,
            body: JSON.stringify(mergedData),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Could not retrieve boards',
            }),
        };
    }
};

// GET /datasources/kanbanize/{namespace}/workitemtypes/import
// in Kabanize, this one is called 'cardTypes' and is similar to 'work item types'
export const getWorkItemTypes = async (event: {
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
        const token = await datasource.getSecret(false);

        const workspaces = await axios
            .get(`${service}/workspaces`, {
                headers: getKanbanizeHeader(token),
            });

        const boards = await axios
            .get(`${service}/boards?&expand=workflows,structure`, {
                headers: getKanbanizeHeader(token),
            });

        const cardTypes = await axios
            .get(`${service}/cardTypes?expand=boards`, {
                headers: getKanbanizeHeader(token),
            });

        const projectModel = await ProjectModel();
        const projectsResult = await projectModel.findAll({
            where: { datasourceId: datasource.datasourceId, orgId: organisationId, deletedAt: null },
        });

        const selectedProjects = projectsResult.map((res: any) => ({
            id: Number.parseInt(res.projectId),
            name: res.name,
            workspace: res.workspace,
            isUnmapped: false
        }));


        const filteredBoards = boards?.data.data.filter((board: any) => selectedProjects.some((proj: any) => Number.parseInt(proj.id) === board.board_id));

        const transformedData = transformCardTypes(
            filteredBoards,
            workspaces?.data.data,
            cardTypes?.data.data);

        return {
            statusCode: 200,
            body: JSON.stringify(transformedData),
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


// GET /datasources/kanbanize/{namespace}/workflows/import
// in Kabanize, workflows is expanded via 'boards' endpoint
export const getWorkflows = async (event: {
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
        const token = await datasource.getSecret(false);

        const workspaces = await axios
            .get(`${service}/workspaces`, {
                headers: getKanbanizeHeader(token),
            });

        const data = await axios
            .get(`${service}/boards?&expand=workflows,structure`, {
                headers: getKanbanizeHeader(token),
            });

        const projectModel = await ProjectModel();
        const projectsResult = await projectModel.findAll({
            where: { datasourceId: datasource.datasourceId, orgId: organisationId, deletedAt: null },
        });

        const selectedProjects = projectsResult.map((res: any) => ({
            id: Number.parseInt(res.projectId),
            name: res.name,
            workspace: res.workspace,
            isUnmapped: false
        }));

        const transformedData = transformWorkflows(data?.data.data, selectedProjects, workspaces?.data.data);

        return {
            statusCode: 200,
            body: JSON.stringify(transformedData),
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

// GET /datasources/kanbanize/{namespace}/contexts/import
export const getContexts = async (event: {
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
        const token = await datasource.getSecret(false);

        const workspaces = await axios
            .get(`${service}/workspaces`, {
                headers: getKanbanizeHeader(token),
            });

        const data = await axios
            .get(`${service}/boards?&expand=workflows,structure`, {
                headers: getKanbanizeHeader(token),
            });

        const projectModel = await ProjectModel();
        const projectsResult = await projectModel.findAll({
            where: { datasourceId: datasource.datasourceId, orgId: organisationId, deletedAt: null },
        });

        const selectedProjects = projectsResult.map((res: any) => ({
            id: res.projectId,
            name: res.name,
            isUnmapped: false
        }));

        const transformedData = transformWorkflows(data?.data.data, selectedProjects, workspaces?.data.data);

        const tranformedContext = tranformContexts(transformedData);

        return {
            statusCode: 200,
            body: JSON.stringify(tranformedContext),
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

// GET /datasources/kanbanize/{namespace}/customfields/import
export const getCustomFields = async (event: {
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
        const token = await datasource.getSecret(false);

        const data = await axios
            .get(`${service}/customFields`, {
                headers: getKanbanizeHeader(token),
            });

        const rawData = data?.data?.data ?? [];

        const convertedData = rawData.map((item: any) => ({
            id: item.field_id.toString(),
            displayName: item.name,
            datasourceFieldName: item.field_id.toString()
        }));

        return {
            statusCode: 200,
            body: JSON.stringify(convertedData),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Could not retrieve custom fields',
            }),
        };
    }
};
const stepCategoryMap = {
    1: 'preceding',
    2: 'proposed',
    3: 'inprogress',
    4: 'completed',
    5: 'completed'
} as any;

const transformWorkflows = (data: any[], selectedProjects: any[], workspaces: any[]) => {
    const allWorkflows: Workflow[] = [];
    const allColumns: Column[] = [];

    const parentChild = new Map<number, number[]>();

    // Filter workflows based on selected projects
    const filteredWorkflows = data.filter(board => selectedProjects
        .some(proj => Number.parseInt(proj.id) === board.board_id));

    // board == project
    filteredWorkflows.forEach(board => {
        // workflow == workflow
        const workflowsInBoard = board.structure.workflows;

        // column == workflowstep
        const columnsInBoard = board.structure.columns;

        // Map the workflows
        Object.keys(workflowsInBoard).forEach((workFlowId: any) => {
            const workflow = (workflowsInBoard as any)[workFlowId] as any;

            /**
             * THIS DOES NOT WORK AS EXPECTED. NEEDS MORE WORK. 
             * KEEP THE CODE HERE BUT DONT USE IT 
             */
            const sectionColumns = workflow.section_columns;

            const arrivalPoint = sectionColumns['2'][0];
            const commitmentPoint = sectionColumns['3'][0];
            const departurePoint = sectionColumns['4'][0];

            const arrivalId = `${arrivalPoint}#${columnsInBoard[arrivalPoint].name}`;
            const commitmentId = `${commitmentPoint}#${columnsInBoard[commitmentPoint].name}`;
            const departureId = `${departurePoint}#${columnsInBoard[departurePoint].name}`;

            /* 
            * Converted the Ids to strings to match the field type in the database.
            * Consider improving this in the future.
            */
            allWorkflows.push({
                id: workFlowId.toString(),
                name: workflow.name,
                projectId: board.board_id,
                // This is for debugging events
                // sectionColumns,
                columnsOrder: workflow.bottom_columns,
                events: {
                    arrivalPoint,
                    commitmentPoint,
                    departurePoint,
                },
                workspace: findWorkspaceName(board.workspace_id, workspaces),
                projects: [board.board_id.toString()],
                projectNames: [board.name],
                arrivalId,
                commitmentId,
                departureId,
            });
        });

        // Map the columns 
        Object.keys(columnsInBoard).forEach((columnId: any) => {
            const column = (columnsInBoard as any)[columnId] as any;
            const parentId = column.parent_column_id;

            allColumns.push({
                id: columnId.toString(),
                workflowId: column.workflow_id,
                name: column.name,
                category: stepCategoryMap[parseInt(column.section)] || '',
                parentId
            });

            if (parentId > 0) {
                if (!parentChild.has(parentId)) {
                    parentChild.set(parentId, []);
                }
                parentChild.get(parentId)?.push(columnId);
            }
        });
    });

    const filteredColumns = allColumns
        // Remove all the parent columns, keep only the leaf columns
        .filter(c => !parentChild.has(c.id))
        .map(c => {
            const displayName = getDisplayName(allColumns, c);
            c.name = displayName;
            return c;
        });

    const result: any[] = [];
    allWorkflows.forEach(w => {
        const columns: Column[] = [];
        w.columnsOrder.forEach(id => {
            const column = filteredColumns.find(c => c.id.toString() === id.toString());
            if (!column) {
                console.error(`Could not find the column with id ${id}`);
            }
            else {
                columns.push(column);
            }
        });
        // const columns = filteredColumns.filter(c => c.workflowId === w.id);
        result.push({
            ...(_.omit(w, ['columnsOrder'])),
            steps: columns.map((c, i) => ({ ...c, order: i }))
        });
    });

    return result;
};

const transformCardTypes = (
    boards: typeof boardsData,
    workspaces: typeof workspacesData,
    cardTypes: typeof cardTypesData
) => {
    const workspacesMap = new Map<number, string>();
    const boardCardTypeMap = new Map<number, CardTypes[]>();

    const defaultCardType: CardTypes = {
        id: "0",
        name: "Card",
        level: "",
        serviceLevelExpectationInDays: 0,
    };

    cardTypes.forEach((ct: any) => {
        const boards = ct.boards ?? [];
        boards.forEach((b: any) => {
            if (!boardCardTypeMap.has(b.board_id)) {
                boardCardTypeMap.set(b.board_id, []);
            }
            boardCardTypeMap.get(b.board_id)!.push({
                id: ct.type_id.toString(),
                name: ct.name,
                level: "",
                serviceLevelExpectationInDays: 0,
            });
        });
    });

    const result: Boards[] = [];

    for (const [boardId, cardTypes] of boardCardTypeMap.entries()) {
        const board = boards.find(b => b.board_id === boardId);
        let workspace;
        if (board) {
            workspace = workspaces.find(w => board.workspace_id === w.workspace_id);
        } else {
            // This should never happen
            console.error(`board with id ${boardId} not found`);
        }

        if (board && !workspace) {
            // This should never happen
            console.error(`workspace with id ${board.workspace_id} not found`);
        }

        // Manually inject type `Card` into the list of card types
        cardTypes?.push(defaultCardType);

        if (board && workspace) {
            const workspace = workspaces.find(w => board.workspace_id === w.workspace_id);
            if (workspace) {
                result.push({
                    id: boardId.toString(),
                    name: board?.name,
                    workspaceId: board.workspace_id,
                    workspace: workspace.name,
                    projects: [board.board_id.toString()],
                    projectNames: [board.name],
                    cardTypes
                });
            }
        }
    }

    return result;
};

const tranformContexts = (contexts: any) => {
    const transformedData = [];

    for (const context of contexts) {
        const projectName = context.projectNames[0];
        const projectId = context.projects[0];

        transformedData.push({
            id: Number.parseInt(context.id),
            workspace: context.workspace,
            name: `${projectName} > ${context.name}`,
            projects: [projectId]
        });
    }

    return transformedData;
};

const getDisplayName = (columns: Column[], column: Column) => {
    const parents: Column[] = [];
    let parentId = column.parentId;
    parents.push(column);
    const visited = new Set<number>();
    while (parentId !== 0) {
        const parent = columns.find(c => c.id.toString() === parentId.toString());
        if (!parent) break;
        if (visited.has(parent.id)) break;
        visited.add(parent.id);
        parents.push(parent);
        parentId = parent.id;
    }

    return _.reverse(parents).map(c => c.name).join(' - ');
};

const findWorkspaceName = (workspaceId: number, workspaces: any[]) => {
    return workspaces.find((workspace) => workspace.workspace_id === workspaceId).name;
};

//TODO: note to move this to Trial class to be more consistent
export const updateTrialInfo = async (orgId: string, datasourceId: string) => {
    const model = await Organisation();

    const orgItems: any = await model.findOne({
        where: { id: orgId },
    });

    //check if it's on trial
    if (orgItems && orgItems.isOnTrial) {
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
