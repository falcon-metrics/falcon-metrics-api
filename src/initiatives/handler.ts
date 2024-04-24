import { asClass } from "awilix";
import { Context as LambdaContext, SNSEvent, SQSEvent } from "aws-lambda";
import _ from "lodash";
import { Logger } from "log4js";
import { Sequelize } from "sequelize";
import { BaseHandler } from "../common/base_handler";
import { Context } from "../context/context_db_aurora";
import { DatasourceItem } from "../datasources/Providers";
import DatasourceModel from "../models/DatasourceModel";
import { ObeyaRoomModel } from "../models/ObeyaRoomModel";
import { ObeyaCalculation } from "../obeya/calculations";
import { ObeyaRoom, ObeyaRoomsCalculations } from "../obeya/obeya_rooms/calculations";
import { SqsClient } from "../utils/sqs_client";
import { State } from "../workitem/state_aurora";

type StateItem = any;
type PopulateResult = any;
type PopulateResponseContext = any;

type Payload = { initiativeId?: string; orgId?: string; };

export const schedule = async (event: SNSEvent, context: LambdaContext) => {
    let logger: Logger | undefined;
    try {
        // Why '' as the orgId here? 
        // Its because if you run an any query accidentally, we dont want to use 
        // any specific orgId. We want to queries to fail
        await new InitiativeContextMappingProcessor({ orgId: '' }).schedule();
    } catch (e) {
        (logger ?? console).info(JSON.stringify({
            message: 'Error scheduling initiative-workitems mapping',
            errorMessage: (e as Error).message,
            errorStack: (e as Error).stack,
        }));
    }
    return '';
};

export const process = async (
    event: SQSEvent,
    context: LambdaContext
) => {
    try {
        const promises = [];
        for (const record of event.Records) {
            const { initiativeId, orgId } = JSON.parse(record.body) as Payload;
            if (initiativeId && orgId) {
                const processor = new InitiativeContextMappingProcessor({ orgId });
                promises.push(processor.processInitiative(initiativeId));
            } else {
                console.error(JSON.stringify({
                    message: 'initiativeId or orgId is undefined',
                    recordBody: record.body,
                    event,
                }));
            }
        }
        await Promise.all(promises);
    } catch (e) {
        console.error(JSON.stringify({
            message: 'Error processing initiatives',
            errorMessage: (e as Error).message,
            errorStack: (e as Error).stack,
            event
        }));
        throw e;
    }
    return '';
};


/**
 * Function to push an initiative to the SQS queue for populating the initiative-workitems mapping
 */
export const pushInitiativeToSQS = async (
    sqsClient: SqsClient,
    initiative: Required<Payload>
) => {
    return sqsClient.sendMessageToFIFOQueue(
        'InitiativeContextWorkItemsMappingQueue.fifo',
        initiative,
        'INITIATIVES_WORKITEM_MAPPING'
    );
};

class InitiativeContextMappingProcessor extends BaseHandler {
    private logger: Logger;
    private database: Sequelize;
    private context: Context;
    private obeyaCalculation: ObeyaCalculation;
    private sqsClient: SqsClient;

    constructor(event: any) {
        super(event, {
            processor: asClass(InitiativeContextMappingProcessor),
            context: asClass(Context),
            state: asClass(State),
            obeyaCalculation: asClass(ObeyaCalculation),
            obeyaRoomsCalculations: asClass(ObeyaRoomsCalculations),
            sqsClient: asClass(SqsClient),
        });
        this.logger = this.dependencyInjectionContainer.cradle.logger;
        this.database = this.dependencyInjectionContainer.cradle.auroraWriter;
        this.context = this.dependencyInjectionContainer.cradle.context;
        this.obeyaCalculation = this.dependencyInjectionContainer.cradle.obeyaCalculation;
        this.sqsClient = this.dependencyInjectionContainer.cradle.sqsClient;
    }

    async getInitiativesInOrg(
        orgId: string,
        roomId?: string,
    ): Promise<ObeyaRoom[]> {
        const aurora = await this.database;
        const model = ObeyaRoomModel(aurora);
        const where: Record<string, any> = {
            orgId
        };

        if (roomId !== undefined) {
            where.roomId = roomId;
        }

        const obeyaRooms: any[] = await model.findAll({
            where,
        });

        return obeyaRooms.map(o => o.toJSON());
    }

    async getAllDatasources(): Promise<DatasourceItem[]> {
        const datasourceModel = await DatasourceModel();
        const datasources = await datasourceModel.findAll({
            where: { enabled: true, deletedAt: null },
        });
        return datasources;
    }

    private async getAllInitiatives() {
        const datasources = await this.getAllDatasources();
        const promises = [];
        for (const datasource of datasources) {
            promises.push(this.getInitiativesInOrg(datasource.orgId));
        }
        const initiatives = await Promise.all(promises);
        return _.flatten(initiatives);
    }

    async getInitiativeData(obeya: ObeyaRoom) {
        return this.obeyaCalculation.getInitiativeData(obeya);
    }

    async processInitiative(initiativeId: string) {
        try {
            const initiative = await this.obeyaCalculation.getObeyaRoom(initiativeId);
            const obeyaData = await this.getInitiativeData(initiative);
            await this.obeyaCalculation.populateObeyaContext(
                initiative.orgId!,
                obeyaData,
                initiative.roomId!,
            );
        } catch (e) {
            console.error(e);
            console.error(JSON.stringify({
                message: 'Error processing initiative',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
                initiativeId
            }));
        }
    }

    async schedule() {
        try {
            const initiatives = await this.getAllInitiatives();
            const promises: any[] = [];

            let i = 1;
            for (const initiative of initiatives) {
                promises.push(
                    pushInitiativeToSQS(
                        this.sqsClient,
                        {
                            initiativeId: initiative.roomId,
                            orgId: initiative.orgId!
                        }
                    )
                );
            }
            const start = Date.now();
            const results = await Promise.all(promises);
            const end = Date.now();
            console.log('elapsed time : ', (end - start) / 1000);
            return {
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                }),
            };
        } catch (e) {
            return {
                statusCode: 500,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    message: 'Internal Server Error'
                }),
            };
        }

    }
}
