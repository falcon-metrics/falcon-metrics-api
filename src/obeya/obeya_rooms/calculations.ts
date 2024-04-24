import { getLogger } from 'log4js';
import { DateTime } from 'luxon';
import { Sequelize, Transaction } from 'sequelize';
import { v4 as uuidV4 } from 'uuid';

import { SecurityContext } from '../../common/security';
import { CustomFieldConfigs } from '../../data_v2/custom_fields_config';
import FQLService from '../../fql/fql_service';
import { CustomFieldConfigAttributes } from '../../models/CustomFieldConfigModel';
import { ObeyaRoomModel } from '../../models/ObeyaRoomModel';
import { StateModel } from '../../models/StateModel';
import connection, { writerConnection } from '../../models/sequelize';
import {
    ExtendedStateItem
} from '../../workitem/interfaces';
import { IState } from '../../workitem/state_aurora';
import ContextModel, { ContextAttributes } from '../../models/ContextModel';
import _ from 'lodash';

export type ObeyaRoom = {
    orgId?: string;
    filterId?: string;
    roomId: string;
    roomName?: string;
    beginDate?: Date;
    endDate?: Date;
    datasourceId?: string;
    parsedQuery?: string;
    flomatikaQuery?: string;
    purpose?: string;
    type?: string;
    includeRelated: boolean;
    includeChildren: boolean;
    includeChildrenOfChildren: boolean;
    includeChildrenOfRelated: boolean;
    hierarchyLevel?: number;
    excludeQuery?: string;
    parsedExcludeQuery?: string;
    linkTypes?: string[];
    columnId?: string;
    contextId?: string;
    order?: number;
    isFinished?: boolean;
    isArchived?: boolean;
    workItems?: ExtendedStateItem[];
    relationshipCount?: number;
    baselines?: JSON;
    dependencies?: JSON;
    ratingId?: string;
    // constraintType?: string;
    // constraintDate?: Date;
};

export type CreateObeyaPayload = {
    type: string;
    goal: string;
    roomName: string;
    beginDate: string;
    endDate: string;
    flomatikaQuery: string;
    datasourceId: string;
    includeRelated: boolean;
    includeChildren: boolean;
    includeChildrenOfRelated: boolean;
    hierarchyLevel: number;
    excludeQuery: string;
    linkTypes: string[];
    columnId: string;
    contextId?: string;
    order?: number;
    isFinished?: boolean;
    isArchived?: boolean;
    baselines?: JSON;
    dependencies?: JSON;
    ratingId?: string;
    // constraintType?: string;
    // constraintDate?: Date;
};
export type UpdateObeyaPayload = CreateObeyaPayload & {
    roomId: string;
};

export type UpdateStatesPayload = {
    workItemId: string;
    beginDate: string;
    endDate: string;
    baselines: JSON;
    dependencies?: JSON;
};

export interface IObeyaRoomsCalculations {
    getObeyaRoom(obeyaRoomId?: string): Promise<ObeyaRoom>;
}

export class ObeyaRoomsCalculations implements IObeyaRoomsCalculations {
    private aurora: Promise<Sequelize>;
    private orgId: string;
    private state: IState;
    constructor(opts: {
        aurora: Promise<Sequelize>;
        state: IState;
        security: SecurityContext;
    }) {
        this.orgId = opts.security.organisation!;
        this.aurora = opts.aurora;
        this.state = opts.state;
    }

    async getCustomFieldsConfigs(): Promise<CustomFieldConfigAttributes[]> {
        const database = await connection();
        const logger = getLogger();
        const customFieldConfigs = new CustomFieldConfigs({ logger, database });
        return customFieldConfigs.getCustomFieldConfigs(this.orgId);
    }

    async getObeyaRooms(
        overrideOrgId?: string,
        roomId?: string,
    ): Promise<{
        obeyaRooms: ObeyaRoom[];
        customFieldsConfig: CustomFieldConfigAttributes[];
    }> {
        const aurora = await this.aurora;
        const model = ObeyaRoomModel(aurora);

        // Had to do this, but this is weird. 
        const where: Record<string, any> = {
            orgId: overrideOrgId ?? this.orgId,
        };

        if (roomId !== undefined) {
            where.roomId = roomId;
        }

        const obeyaRooms: any[] = await model.findAll({
            where,
        });

        const customFieldsConfigs = await this.getCustomFieldsConfigs();

        return {
            obeyaRooms,
            customFieldsConfig: customFieldsConfigs,
        };
    }

    async createObeyaRoom(obeyaRoom: CreateObeyaPayload) {
        const aurora = await writerConnection();
        const model = ObeyaRoomModel(aurora);

        const service = await FQLService();

        const transaction = await aurora.transaction();
        try {
            const parsedQuery = await service.convertFQLToSQL(
                this.orgId,
                '',
                obeyaRoom.flomatikaQuery,
            );

            const parsedExcludeQuery = obeyaRoom.excludeQuery
                ? await service.convertFQLToSQL(
                    this.orgId,
                    '',
                    obeyaRoom.excludeQuery,
                )
                : null;

            const startDatetime = DateTime.fromISO(obeyaRoom.beginDate);
            const endDatetime = DateTime.fromISO(obeyaRoom.endDate);

            const obeyaRoomPayload = {
                orgId: this.orgId,
                datasourceId: obeyaRoom.datasourceId,
                roomId: uuidV4(),
                // Remove column if not used
                filterId: undefined,
                roomName: obeyaRoom.roomName,
                beginDate: startDatetime.toISO(),
                endDate: endDatetime.toISO(),
                flomatikaQuery: obeyaRoom.flomatikaQuery,
                parsedQuery,
                goal: obeyaRoom.goal,
                type: obeyaRoom.type,
                includeRelated: obeyaRoom.includeRelated,
                includeChildren: obeyaRoom.includeChildren,
                includeChildrenOfRelated: obeyaRoom.includeChildrenOfRelated,
                // Remove if not used
                includeChildrenOfChildren: undefined,
                hierarchyLevel: obeyaRoom.hierarchyLevel,
                excludeQuery: obeyaRoom.excludeQuery,
                parsedExcludeQuery,
                linkTypes: obeyaRoom.linkTypes,
                columnId: obeyaRoom.columnId,
                contextId: obeyaRoom.contextId,
                order: obeyaRoom.order,
                isFinished: obeyaRoom.isFinished,
                isArchived: obeyaRoom.isArchived,
                ratingId: obeyaRoom.ratingId,
            };

            const response = await model.create(obeyaRoomPayload, {
                transaction,
            });

            await this.createContextsForObeyaRoom(response.toJSON(), transaction);
            await transaction.commit();
            return (response as any).toJSON();
        } catch (e) {
            console.log(e);
            await transaction.rollback();
            return e;
        }
    }

    async updateObeyaRoom(
        obeyaRooms: UpdateObeyaPayload | UpdateObeyaPayload[],
    ): Promise<ObeyaRoom[]> {
        const aurora = await writerConnection();
        const model = ObeyaRoomModel(aurora);
        const service = await FQLService();
        const transaction = await aurora.transaction();

        try {
            const rooms = Array.isArray(obeyaRooms) ? obeyaRooms : [obeyaRooms];
            const responses = [];

            for (const obeyaRoom of rooms) {
                const parsedQuery = await service.convertFQLToSQL(
                    this.orgId,
                    '',
                    obeyaRoom?.flomatikaQuery,
                );

                const parsedExcludeQuery = obeyaRoom.excludeQuery
                    ? await service.convertFQLToSQL(
                        this.orgId,
                        '',
                        obeyaRoom.excludeQuery,
                    )
                    : null;

                const startDatetime = DateTime.fromISO(obeyaRoom.beginDate);
                const endDatetime = DateTime.fromISO(obeyaRoom.endDate);

                const obeyaRoomPayload = {
                    orgId: this.orgId,
                    datasourceId: obeyaRoom.datasourceId,
                    roomId: obeyaRoom.roomId,
                    // Remove column if not used
                    filterId: undefined,
                    roomName: obeyaRoom.roomName,
                    beginDate: startDatetime.toISO(),
                    endDate: endDatetime.toISO(),
                    flomatikaQuery: obeyaRoom.flomatikaQuery,
                    parsedQuery,
                    goal: obeyaRoom.goal,
                    type: obeyaRoom.type,
                    includeRelated: obeyaRoom.includeRelated,
                    includeChildren: obeyaRoom.includeChildren,
                    includeChildrenOfRelated:
                        obeyaRoom.includeChildrenOfRelated,
                    // Remove if not used
                    includeChildrenOfChildren: undefined,
                    hierarchyLevel: obeyaRoom.hierarchyLevel,
                    excludeQuery: obeyaRoom.excludeQuery,
                    parsedExcludeQuery,
                    linkTypes: obeyaRoom.linkTypes,
                    columnId: obeyaRoom.columnId,
                    contextId: obeyaRoom.contextId,
                    order: obeyaRoom.order,
                    isFinished: obeyaRoom.isFinished,
                    isArchived: obeyaRoom.isArchived,
                    ratingId: obeyaRoom?.ratingId,
                };

                await model.update(obeyaRoomPayload, {
                    transaction,
                    where: {
                        orgId: this.orgId,
                        roomId: obeyaRoomPayload.roomId,
                    } as any,
                } as any);

                responses.push(obeyaRoomPayload as any);
            }

            await transaction.commit();
            return responses;
        } catch (e) {
            await transaction.rollback();
            throw e;
        }
    }

    async updatePortfolioRoadmap(
        obeyaRooms: UpdateObeyaPayload | UpdateObeyaPayload[],
    ) {
        const aurora = await writerConnection();
        const model = ObeyaRoomModel(aurora);
        const transaction = await aurora.transaction();

        try {
            const rooms = Array.isArray(obeyaRooms) ? obeyaRooms : [obeyaRooms];
            const responses = [];

            for (const obeyaRoom of rooms) {
                const payload = {
                    orgId: this.orgId,
                    roomId: obeyaRoom.roomId,
                    beginDate: obeyaRoom.beginDate,
                    endDate: obeyaRoom.endDate,
                    baselines: obeyaRoom.baselines,
                    dependencies: obeyaRoom.dependencies,
                    // constraintType: obeyaRoom.constraintType,
                    // constraintDate: obeyaRoom.constraintDate,
                };

                const response = await model.update(payload, {
                    transaction,
                    where: {
                        orgId: this.orgId,
                        roomId: payload.roomId,
                    } as any,
                } as any);

                responses.push(response);
            }

            await transaction.commit();
            return Array.isArray(obeyaRooms) ? responses : responses[0];
        } catch (e) {
            await transaction.rollback();
            throw e;
        }
    }

    async updateObeyaRoadmap(
        workItems: UpdateStatesPayload | UpdateStatesPayload[],
    ) {
        const aurora = await writerConnection();
        const model = StateModel(aurora);
        const transaction = await aurora.transaction();

        try {
            const items = Array.isArray(workItems) ? workItems : [workItems];
            const responses = [];

            for (const workItem of items) {
                const payload = {
                    partitionKey: `state#${this.orgId}`,
                    workItemId: workItem.workItemId,
                    targetStart: new Date(workItem.beginDate),
                    targetEnd: new Date(workItem.endDate),
                    baselines: workItem.baselines,
                    dependencies: workItem.dependencies,
                };

                const response = await model.update(payload, {
                    transaction,
                    where: {
                        partitionKey: `state#${this.orgId}`,
                        workItemId: payload.workItemId,
                    } as any,
                } as any);

                responses.push(response);
            }

            await transaction.commit();
            return Array.isArray(workItems) ? responses : responses[0];
        } catch (e) {
            await transaction.rollback();
            throw e;
        }
    }

    async removeObeyaRoom(obeyaRoomId?: string) {
        const aurora = await writerConnection();
        const transaction = await aurora.transaction();
        const model = ObeyaRoomModel(aurora);
        try {
            const response = await model.destroy({
                where: {
                    orgId: this.orgId,
                    roomId: obeyaRoomId,
                },
            });
            await transaction.commit();
            return response;
        } catch (e) {
            await transaction.rollback();
            return e;
        }
    }

    async getObeyaRoom(
        // This should not be optional. Always required. 
        // Refactor this
        obeyaRoomId?: string,
        /**
         * This param is required if we're calling this method 
         * for different orgs
         */
        orgIdOverride?: string
    ): Promise<ObeyaRoom> {
        const aurora = await this.aurora;
        const model = ObeyaRoomModel(aurora);

        const orgId = orgIdOverride ?? this.orgId;
        const obeyaRoomsList = await this.getObeyaRooms(orgId, obeyaRoomId);

        const isMatched = obeyaRoomsList.obeyaRooms.some(
            (o) => o.roomId === obeyaRoomId,
        );


        const obeyaRoom: any = isMatched
            ? await model.findOne({
                where: {
                    orgId,
                    roomId: obeyaRoomId,
                },
            })
            : await model.findOne({ where: { orgId: this.orgId } });

        return obeyaRoom;
    }


    /**
     * Create contexts for the obeya room
     * 
     * 2 contexts are created. This method returns the contexts
     * that are created.
     * 
     */
    async createContextsForObeyaRoom(obeyaRoom: ObeyaRoom, transaction?: Transaction): Promise<ContextAttributes[]> {
        const orgId = obeyaRoom.orgId;
        const contextModel = await ContextModel();
        const where: any = {
            obeyaId: obeyaRoom.roomId,
            orgId,
            archived: false
        };
        const contexts = await contextModel.findAll({
            where,
            raw: true,
        });
        // Obeya contexts will have position as 10000 and above to not interfere with the position logic for non-obeya contexts.
        let positionInHierarchy = 10000;
        // Find the next available position for the new context
        // At the time of writing this code, positionHierarchy is not used 
        // for obeya contexts. But we're doing this to avoid collisions
        const nextAvailablePosition = _.chain(contexts)
            .filter(
                (context) =>
                    typeof context.obeyaId === 'string' &&
                    !context.positionInHierarchy.includes('.'),
            )
            .map(c => Number.parseInt(c.positionInHierarchy))
            .max()
            .add(1)
            .value();

        // Setting a random datasource id. DatasourceId is not used when reading obeya contexts
        const dataSourceId = uuidV4();

        positionInHierarchy = positionInHierarchy + nextAvailablePosition;
        const contextsToInsert = [
            {
                contextId: uuidV4(),
                orgId,
                datasourceId: dataSourceId,
                projectId: null,
                name: obeyaRoom.roomName,
                positionInHierarchy: positionInHierarchy.toString(),
                contextAddress: null,
                archived: false,
                obeyaId: obeyaRoom.roomId,
            },
            {
                contextId: uuidV4(),
                orgId,
                datasourceId: dataSourceId,
                projectId: null,
                name: obeyaRoom.roomName,
                positionInHierarchy: positionInHierarchy.toString() + '.1',
                contextAddress: null,
                archived: false,
                obeyaId: obeyaRoom.roomId,
            },
        ];
        const response = await contextModel.bulkCreate(contextsToInsert, { transaction });

        return response.map(m => m.toJSON());
    }
}
