import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { asClass } from 'awilix';
import {
    ContextQueries,
    IContextQueries,
    ContextItems,
} from './context_queries';
import { Context } from './context_db_aurora';

export type HierarchyAsArray = Array<{
    id: string;
    displayName: string;
    children: HierarchyAsArray | ContextItems;
}>;

export class ContextHandler extends BaseHandler {
    contextQueries: IContextQueries;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            contextQueries: asClass(ContextQueries),
            context: asClass(Context),
        });

        this.contextQueries = this.dependencyInjectionContainer.cradle.contextQueries;
    }

    async getContexts(): Promise<APIGatewayProxyResultV2> {
        let response: ContextItems;

        try {
            response = await this.contextQueries.getVisibleContextTree();
        } catch (e) {
            console.error('Failed: ' + (e as Error).message + '\n' + (e as Error).stack);
            return {
                statusCode: 400,
                body: JSON.stringify({ error: (e as Error).message }),
            };
        }

        const theArray: HierarchyAsArray | ContextItems = Array.from(
            response.values(),
        );

        theArray.forEach((portfolio) => {
            portfolio.children = Array.from(portfolio.children.values()).map(
                (initiative) => {
                    initiative.children = Array.from(
                        initiative.children.values(),
                    );
                    return initiative;
                },
            );
        });

        const rearranged = [
            // Dont add the 'All' context if there is only one top level context
            ...(
                // why 2? When there is only one top level context, 
                // there will be 2 elements in the array. The top level context and All context
                theArray.length > 2
                    ? (theArray.filter(c => c.displayName === 'All'))
                    : []
            ),
            ...theArray.filter(c => c.displayName !== 'All'),
        ];

        return {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(rearranged),
        };
    }
}

export const getContexts = async (
    event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
    return await new ContextHandler(event).getContexts();
};
