import { isEqual, orderBy, uniqWith } from 'lodash';
import { morphism } from 'morphism';
import { Transaction } from 'sequelize';
import DatasourceModel from '../models/DatasourceModel';
import btoa from 'btoa';
import { getDeletedAtFilterCondition } from './delete/delete_functions';

export const kickOffReIngest = async (
    orgId: string,
    datasourceId: string,
    transaction?: Transaction,
): Promise<void> => {
    const where = {
        orgId,
        datasourceId,
    };
    //check if datasource is already there and enabled
    //reset the nextRunStartFrom
    const datasourceModel = await DatasourceModel();

    await datasourceModel.update(
        {
            nextRunStartFrom: null,
        },
        {
            where: getDeletedAtFilterCondition(where) as any,
            transaction
        } as any,
    );
};

export const stepCategories = {
    new: 'proposed',
    indeterminate: 'inprogress',
    done: 'completed',
} as any;

export const stepSchema = {
    id: 'id',
    name: 'name',
    category: {
        path: 'statusCategory.key',
        fn: (value: string) => stepCategories[value] || '',
    },
};
export const workflowSchema = {
    id: 'id',
    name: 'name',
    steps: {
        path: 'statuses',
        fn: (value: []) => morphism(stepSchema, value),
    },
};

export type WorkflowResp = {
    id: string;
    name: string;
    steps: Step[];
};

export type Step = {
    id: string;
    name: string;
    category: string;
};

export const projectContainsWorkflow = (
    projectId: string,
    workflow: WorkflowResp,
    workflowsInProject: { [key: string]: WorkflowResp[]; },
) => {
    const includeId = workflowsInProject[projectId]
        .map((item: { id: string; }) => item.id)
        .includes(workflow.id);
    if (!includeId) return false;
    //also need to check the ones with workflow id has the same steps
    const projectWorkflowSteps = workflowsInProject[projectId]
        .filter((item: { id: string; }) => item.id === workflow.id)
        .map((item: { steps: Step[]; }) => item.steps);

    //loop through project workflowsteps to check if its steps are identical to the steps of the workflow
    const found = projectWorkflowSteps.filter((steps: Step[]) =>
        isEqual(steps.sort((a, b) => a.id.localeCompare(b.id)), workflow.steps.sort((a, b) => a.id.localeCompare(b.id))),
    );
    return found.length > 0;
};

export type FormattedWorkflow = {
    id: string;
    name: string;
    projectNames: string[];
    projects: string[];
    steps: Step[];
};

export const FormatWorkflowResp = (
    /**
     * Workflows from all projects
     */
    allWorkflows: WorkflowResp[],
    projects: { projectId: string; name: string; }[],
    /**
     * Workflows per project
     */
    workflowsPerProject: { [key: string]: WorkflowResp[]; },
): FormattedWorkflow[] => {
    Object.keys(workflowsPerProject).forEach(k => {
        workflowsPerProject[k].forEach(wf => {
            wf.steps.sort((a, b) => a.id.localeCompare(b.id));
        });
    });
    const uniqUnion = orderBy(uniqWith(allWorkflows, isEqual), ['id']); //this is finding unique workflows
    const resp = uniqUnion.map((workflow) => {
        const mappedProjects = projects.filter((project) => {
            return projectContainsWorkflow(
                project.projectId,
                workflow,
                workflowsPerProject,
            );
        });
        return {
            ...workflow,
            projects: mappedProjects.map((project) => project.projectId),
            projectNames: mappedProjects.map((project) => project.name),
        };
    });
    return resp;
};

export const getHeader = (accessCredentials: string) => {
    const token = accessCredentials.startsWith('Basic ')
        ? accessCredentials
        : 'Basic '.concat(btoa(accessCredentials));
    return {
        // For some reason, explicitly adding Content-Type is not working for jira-server 
        // Since it is not being used in jira-cloud, we could safely disable it for both
        // 'Content-Type': 'application/json',
        Authorization: token,
        //these language headings are here because otherwise Jira provides inconsistent
        //response for issue type names, sometimes in english, sometimes in local language
        //so we're forcing it to always return in english
        'Accept-Language': 'en',
        'X-Force-Accept-Language': 'true',
    };
};

export const getKanbanizeHeader = (apiKey: string) => {
    return {
        'Content-Type': 'application/json',
        'apikey': apiKey
    };
};


export const buildResponse = (code: number, body: any) => {
    if (typeof body === 'string') {
        body = { message: body };
    }
    return {
        statusCode: code,
        body: JSON.stringify(body),
    };
};
