import _, { flatMap, pick, sortBy, uniqBy, groupBy } from 'lodash';
import { ExtendedStateItem, LinkedItem, StateItem } from './interfaces';
import { DateTime } from 'luxon';
import { AllowedNames } from '../utils/typescript';
import ProjectModel from '../models/ProjectModel';
import DatasourceModel from '../models/DatasourceModel';
import { Op } from 'sequelize';
import { extractNamespaceFromServiceUrl } from '../datasources/datasources';
import { getPercentile } from '../utils/statistics';

type StateKey = keyof StateItem;
type StateKeys = Array<StateKey>;
export type NumberKey = AllowedNames<StateItem, number | undefined>;
export type ProjectData = {
    projectName: string;
    projectId: string;
    datasourceId: string;
    datasourceType: string;
    namespace: string;
    serviceUrl: string;
};

const returnFields: StateKeys = [
    'workItemId',
    'title',
    'assignedTo',
    'flomatikaWorkItemTypeName',
    'state',
    'arrivalDate',
    'commitmentDate',
    'departureDate',
    'customFields',
];

type CustomFieldNames = {
    name: string;
    displayName: string;
};

export type WorkItemListEntry = StateItem & {
    projectName?: string;
    datasourceType?: string;
};

// Joins subset of StateItem with ProjectData and dynamic custom fields
export interface ProjectStateItem {
    workItemId?: string;
    title?: string;
    assignedTo?: string;
    flomatikaWorkItemTypeName?: string;
    flomatikaWorkItemTypeLevel?: string;
    state?: string;

    arrivalDate?: string;
    arrivalDateTime?: DateTime;

    commitmentDate?: string;
    commitmentDateTime?: DateTime;

    departureDate?: string;
    departureDateTime?: DateTime;

    serviceLevelExpectationInDays?: number | undefined;
    itemAge?: number | undefined;
    ['age%OfSLE']?: number | undefined;
    projectName?: string;
    projectId?: string;
    datasourceId?: string;
    datasourceType?: string;
    serviceUrl?: string;
    namespace?: string;
    customFields?: Record<string, string | undefined>;
    activeTime?: number;
    flowEfficiency?: number;
    waitingTime?: number;
    isDelayed?: boolean;
    isAboveSle?: boolean;
    isAboveSleByWipAge?: boolean;
    isStale?: boolean;

    flagged?: boolean;
    desiredDeliveryDate?: string;
    startStatus?: string;
    optimalStartDateRange?: string;
    expectedDeliveryDate?: string;
    suggestedClassOfService?: string;
}

export class WorkItemListService {
    async getWorkItemList(
        workItems: StateItem[],
        ageField: NumberKey,
        orgId: string,
    ): Promise<Array<WorkItemListEntry>> {
        const projectsData = await this.getProjectsData(orgId);

        const customFieldConfigs = this.getCustomFieldConfigs(workItems);
        const result = workItems.map((workItem) => {
            const SLE =
                workItem.flomatikaWorkItemTypeServiceLevelExpectationInDays;
            const itemAge = ageField ? workItem[ageField] : undefined;
            const agePercentageOfSLE =
                itemAge !== undefined && SLE ? itemAge / SLE : '-';
            const projectData = projectsData.find(
                ({ projectId, datasourceId }) =>
                    projectId === workItem.projectId &&
                    datasourceId === workItem.datasourceId,
            );
            return {
                ...pick(workItem, returnFields),
                serviceLevelExpectationInDays: SLE,
                itemAge,
                ['age%OfSLE']: agePercentageOfSLE,
                ...projectData,
            };
        });
        const transformedCustomFields = this.getObjectsWithCustomFields(
            result,
            customFieldConfigs,
        );
        return transformedCustomFields;
    }

    static convertToProjectStateItem(
        workItem: ExtendedStateItem,
        ageField: NumberKey,
        projectsData: ProjectData[],
        customFieldConfigs: CustomFieldNames[],
    ): ProjectStateItem {
        // Partial State Item Properties
        const {
            workItemId,
            title,
            assignedTo,
            flomatikaWorkItemTypeName,
            flomatikaWorkItemTypeLevel,
            state,
            arrivalDate,
            commitmentDate,
            departureDate,
            flagged,
            isDelayed,
            isAboveSle,
            isAboveSleByWipAge,
            isStale,
            arrivalDateTime,
            commitmentDateTime,
            departureDateTime,
        } = workItem;

        // New Service Level Properties
        const SLE: number | undefined =
            workItem.flomatikaWorkItemTypeServiceLevelExpectationInDays;
        const itemAge: number | undefined = ageField
            ? workItem[ageField]
            : undefined;
        const agePercentageOfSLE: number | undefined =
            itemAge !== undefined && SLE ? itemAge / SLE : undefined;

        // Parent Project Properties
        const projectData: ProjectData | undefined = projectsData.find(
            ({ projectId, datasourceId }) =>
                projectId === workItem.projectId &&
                datasourceId === workItem.datasourceId,
        );
        const {
            projectName,
            projectId,
            datasourceId,
            datasourceType,
            serviceUrl,
            namespace,
        } = projectData || {};

        // Custom Fields
        const customFieldsProperties: Record<
            string,
            string | undefined
        > = customFieldConfigs.reduce((records, customFieldConfig) => {
            // Setting field to show 'displayName' instead of 'name'
            const key = customFieldConfig.displayName;

            // Find all objects in the customfields array with the display name
            // Use map to get customfield.value
            const customFieldEntry: any = workItem.customFields
                ?.filter(
                    (customField) =>
                        customField.displayName ===
                        customFieldConfig.displayName,
                )
                .map((cf) => cf.value);

            // Ideally, this should be done in the UI, but its easier to do it here
            // If there is only one value, get that value
            let customFieldEntryStr;
            if (customFieldEntry?.length === 1) {
                customFieldEntryStr = customFieldEntry[0];
            } else if (customFieldEntry && customFieldEntry?.length > 1) {
                // If there are multiple values, add brackets [ ] around the list.
                // Use join to concat the array of strings.
                customFieldEntryStr = `[${customFieldEntry?.join(',')}]`;
            }

            return {
                ...records,
                [key]: customFieldEntryStr,
            };
        }, {});

        return {
            workItemId,
            title,
            assignedTo,
            flomatikaWorkItemTypeName,
            flomatikaWorkItemTypeLevel,
            state,
            arrivalDate,
            commitmentDate,
            departureDate,
            serviceLevelExpectationInDays: SLE,
            itemAge,
            ['age%OfSLE']: agePercentageOfSLE,
            projectName,
            projectId,
            datasourceId,
            datasourceType,
            namespace,
            serviceUrl,
            activeTime: workItem.activeTime,
            waitingTime: workItem.waitingTime,
            flowEfficiency:
                typeof workItem.flowEfficiency === 'number'
                    ? workItem.flowEfficiency * 100
                    : 0,
            flagged,
            isDelayed,
            isAboveSle,
            isAboveSleByWipAge,
            isStale,
            arrivalDateTime,
            commitmentDateTime,
            departureDateTime,
            customFields: {
                ...customFieldsProperties,
            },
        };
    }

    static getStartStatus(
        difference: number,
        leadTimeDistribution: any,
    ): string {
        if (difference > 2 * leadTimeDistribution.percentile98) {
            return 'SUPER EARLY';
        }
        if (
            difference > leadTimeDistribution.percentile98 &&
            difference <= 2 * leadTimeDistribution.percentile98
        ) {
            return 'EARLY';
        }
        if (
            difference >= leadTimeDistribution.percentile85 &&
            difference <= leadTimeDistribution.percentile98
        ) {
            return 'NORMAL';
        }
        if (
            difference >= leadTimeDistribution.percentile60 &&
            difference <= leadTimeDistribution.percentile84
        ) {
            return 'LATE';
        }
        if (
            difference >= leadTimeDistribution.percentile50 &&
            difference <= leadTimeDistribution.percentile59
        ) {
            return 'LRM';
        }
        return 'IRRESPONSIBLY LATE';
    }

    static addDesiredDeliveryDateFields(
        item: ExtendedStateItem,
        projectItem: ProjectStateItem,
        perspective: string,
        leadTimeDistributions: { [key: string]: any; },
        desiredDeliveryDateFields: string[] = [],
        classOfServiceCustomField: string = '',
    ): ProjectStateItem {
        let isDesiredDeliveryDatePresentForWorkItem = false;
        const tempDateTime = DateTime.now();
        let desiredDeliveryDate: DateTime = tempDateTime;
        if (desiredDeliveryDateFields && desiredDeliveryDateFields.length > 0) {
            desiredDeliveryDateFields.forEach((desiredDeliveryDateField) => {
                const value = item.customFields?.find(
                    (i) => i.name === desiredDeliveryDateField,
                )?.value;
                if (
                    typeof value === 'string' &&
                    DateTime.fromISO(value).isValid
                ) {
                    isDesiredDeliveryDatePresentForWorkItem = true;
                    if (
                        desiredDeliveryDate === tempDateTime ||
                        DateTime.fromISO(value).toMillis() <
                        desiredDeliveryDate.toMillis()
                    ) {
                        desiredDeliveryDate = DateTime.fromISO(value);
                    }
                }
            });
        }
        let selectedLeadTimeDistribution;
        let isLeadTimeDataPresentForWorkItem = false;
        if (classOfServiceCustomField && classOfServiceCustomField.length > 0) {
            const key = `${item.flomatikaWorkItemTypeId}-|-|-|${item.customFields?.find(
                (f) => f.name === classOfServiceCustomField,
            )?.value
                }`;
            isLeadTimeDataPresentForWorkItem = leadTimeDistributions.hasOwnProperty(
                key,
            );
            selectedLeadTimeDistribution = leadTimeDistributions[key];
        } else {
            isLeadTimeDataPresentForWorkItem =
                item.flomatikaWorkItemTypeId &&
                leadTimeDistributions[item.flomatikaWorkItemTypeId];
            if (item.flomatikaWorkItemTypeId) {
                selectedLeadTimeDistribution =
                    leadTimeDistributions[item.flomatikaWorkItemTypeId];
            }
        }

        if (
            isLeadTimeDataPresentForWorkItem &&
            isDesiredDeliveryDatePresentForWorkItem
        ) {
            // let mockDesiredDeliveryDate;
            // if (perspective === 'past') {
            //     const random = Math.ceil(Math.random() * 20) - 10;
            //     mockDesiredDeliveryDate = random > 0 ? item.departureDateTime?.plus({ days: random }) : item.departureDateTime?.minus({ days: random });
            // } else {
            //     const random = Math.ceil(Math.random() * 3 * leadTimeDistributions[item.flomatikaWorkItemTypeId!].percentile98);
            //     mockDesiredDeliveryDate = DateTime.now().plus({ days: random });
            // }
            // if (desiredDeliveryDateField && desiredDeliveryDateField.length > 0) {
            //     const value = item.customFields?.find(i => i.name === desiredDeliveryDateField)?.value;
            //     if (typeof value === 'string' && DateTime.fromISO(value).isValid) {
            //         mockDesiredDeliveryDate = DateTime.fromISO(value);
            //     }
            // }
            let difference;
            if (perspective === 'future') {
                difference = desiredDeliveryDate?.diffNow('days').days! + 1;
            } else {
                difference =
                    desiredDeliveryDate?.diff(item.commitmentDateTime!, 'days')
                        .days! + 1;
            }
            const startStatus = WorkItemListService.getStartStatus(
                difference!,
                selectedLeadTimeDistribution,
            );
            const optimalStartDateRangeBeginning = desiredDeliveryDate?.minus({
                days: selectedLeadTimeDistribution.percentile98 + 1,
            });
            const optimalStartDateRangeEnding = desiredDeliveryDate?.minus({
                days: selectedLeadTimeDistribution.percentile85 + 1,
            });
            let suggestedClassOfService;
            if (
                startStatus === 'SUPER EARLY' ||
                startStatus === 'EARLY' ||
                startStatus === 'NORMAL'
            ) {
                suggestedClassOfService = 'Standard';
            } else if (startStatus === 'LATE') {
                suggestedClassOfService = 'Fixed date';
            } else {
                suggestedClassOfService = 'Expedite';
            }

            if (perspective === 'present') {
                return {
                    ...projectItem,
                    ...{
                        desiredDeliveryDate: desiredDeliveryDate?.toLocaleString(
                            { dateStyle: 'medium' } as any,
                        ),
                        startStatus,
                        optimalStartDateRange:
                            optimalStartDateRangeBeginning?.toLocaleString({
                                dateStyle: 'medium',
                            } as any) +
                            ' to ' +
                            optimalStartDateRangeEnding?.toLocaleString({
                                dateStyle: 'medium',
                            } as any),
                        expectedDeliveryDate: item.commitmentDateTime
                            ?.plus({
                                days: selectedLeadTimeDistribution.percentile85,
                            })
                            .toLocaleString({ dateStyle: 'medium' } as any),
                        suggestedClassOfService,
                    },
                };
            }
            if (perspective === 'past') {
                return {
                    ...projectItem,
                    ...{
                        desiredDeliveryDate: desiredDeliveryDate?.toLocaleString(
                            { dateStyle: 'medium' } as any,
                        ),
                        startStatus,
                        optimalStartDateRange:
                            optimalStartDateRangeBeginning?.toLocaleString({
                                dateStyle: 'medium',
                            } as any) +
                            ' to ' +
                            optimalStartDateRangeEnding?.toLocaleString({
                                dateStyle: 'medium',
                            } as any),
                    },
                };
            }
            if (perspective === 'future') {
                return {
                    ...projectItem,
                    ...{
                        desiredDeliveryDate: desiredDeliveryDate?.toLocaleString(
                            { dateStyle: 'medium' } as any,
                        ),
                        startStatus,
                        optimalStartDateRange:
                            optimalStartDateRangeBeginning?.toLocaleString({
                                dateStyle: 'medium',
                            } as any) +
                            ' to ' +
                            optimalStartDateRangeEnding?.toLocaleString({
                                dateStyle: 'medium',
                            } as any),
                        suggestedClassOfService,
                    },
                };
            }
        }
        return projectItem;
    }

    static getLeadTimeDistributions(
        completedItems: StateItem[],
        classOfServiceCustomField: string = '',
    ): any {
        const getLeadTimes = (
            completedWorkItems: StateItem[],
        ): Array<number> => {
            return completedWorkItems
                .filter((item) => item.leadTimeInWholeDays != undefined)
                .map((item) => item.leadTimeInWholeDays!);
        };
        let itemsByWorkItemType: any;
        if (classOfServiceCustomField && classOfServiceCustomField.length > 0) {
            itemsByWorkItemType = groupBy(completedItems, (item) => {
                return `${item.flomatikaWorkItemTypeId}-|-|-|${item.customFields?.find(
                    (f) => f.name === classOfServiceCustomField,
                )?.value
                    }`;
            });
        } else {
            itemsByWorkItemType = groupBy(
                completedItems,
                'flomatikaWorkItemTypeId',
            );
        }
        const result: { [key: string]: any; } = {};
        Object.keys(itemsByWorkItemType).forEach((workItemType) => {
            const leadTimes = getLeadTimes(itemsByWorkItemType[workItemType]);
            result[workItemType] = {
                percentile50: Math.round(getPercentile(50, leadTimes)),
                percentile59: Math.round(getPercentile(59, leadTimes)),
                percentile60: Math.round(getPercentile(60, leadTimes)),
                percentile84: Math.round(getPercentile(84, leadTimes)),
                percentile85: Math.round(getPercentile(85, leadTimes)),
                percentile98: Math.round(getPercentile(98, leadTimes)),
            };
        });

        return result;
    }

    /**
     * Builds list of work items with project information. Each work item entry
     * contains combined state item, service level, and project properties.
     * @param projectsData
     * @param workItems
     * @param ageField
     */
    getProjectsItemList(
        projectsData: ProjectData[],
        workItems: ExtendedStateItem[],
        ageField: NumberKey,
        completedItems: StateItem[] = [],
        perspective: string = '',
        desiredDeliveryDateField: string[] = [],
        classOfServiceCustomField: string = '',
    ): ProjectStateItem[] {
        const customFieldConfigs: CustomFieldNames[] = this.getCustomFieldConfigs(
            workItems,
        );

        const leadTimeDistributions: any = WorkItemListService.getLeadTimeDistributions(
            completedItems,
            classOfServiceCustomField,
        );

        const projectItems: ProjectStateItem[] = workItems.map((workItem) => {
            const projectItem = WorkItemListService.convertToProjectStateItem(
                workItem,
                ageField,
                projectsData,
                customFieldConfigs,
            );
            return WorkItemListService.addDesiredDeliveryDateFields(
                workItem,
                projectItem,
                perspective,
                leadTimeDistributions,
                desiredDeliveryDateField,
                classOfServiceCustomField,
            );
        });
        return projectItems;
    }

    async getProjectsData(orgId: string): Promise<ProjectData[]> {
        const projectModel = await ProjectModel();
        const datasourceModel = await DatasourceModel();
        (projectModel as any).belongsTo(datasourceModel, {
            foreignKey: 'datasourceId',
            targetKey: 'datasourceId',
            as: 'datasources',
        });
        const projectData = projectModel.findAll({
            where: { orgId },
            attributes: ['datasourceId', 'name', 'projectId'],
            include: [
                {
                    model: datasourceModel,
                    as: 'datasources',
                    attributes: ['datasourceType', 'serviceUrl'],
                    where: {
                        datasourceType: { [Op.ne]: null },
                    },
                },
            ],
        });
        const projects = ((await projectData) as unknown) as {
            dataValues: {
                datasourceId: string;
                name: string;
                projectId: string;
                datasources: {
                    dataValues: { datasourceType: string; serviceUrl: string; };
                };
            };
        }[];
        return projects.map((p) => {
            const {
                dataValues: {
                    datasources: {
                        dataValues: { datasourceType, serviceUrl },
                    },
                    name: projectName,
                    ...project
                },
            } = p;
            return {
                ...project,
                projectName,
                datasourceType,
                serviceUrl,
                namespace: extractNamespaceFromServiceUrl(
                    datasourceType,
                    serviceUrl,
                ),
            };
        });
    }

    private getObjectsWithCustomFields(
        workItems: StateItem[],
        customFieldConfigs: CustomFieldNames[],
    ) {
        const response = workItems.map((workItem) => {
            const { customFields, ...workItemRest } = workItem;
            const newWorkItem: {
                [key: string]:
                | string
                | number
                | DateTime
                | LinkedItem[]
                | JSON
                | undefined;
            } = { ...workItemRest };
            customFieldConfigs.forEach((customFieldConfig) => {
                const key = customFieldConfig.name;
                const customField = workItem.customFields?.find(
                    (cF) => cF.name === customFieldConfig.name,
                );
                const newValue = customField?.value;
                newWorkItem[key] = newValue;
            });
            return newWorkItem;
        });
        return response;
    }

    private getCustomFieldConfigs(workItems: StateItem[]) {
        const customFieldsNames: CustomFieldNames[] = flatMap(
            workItems,
            (workItem) => {
                const { customFields } = workItem;
                if (!customFields) {
                    return [];
                }
                return customFields.map(({ name, displayName }) => ({
                    name,
                    displayName,
                }));
            },
        );
        const uniqueNames = uniqBy(customFieldsNames, 'name');
        const sortedUniqueNames = sortBy(uniqueNames, 'name');

        return sortedUniqueNames;
    }
}

export default async function (): Promise<WorkItemListService> {
    return new WorkItemListService();
}
