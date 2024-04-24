import { APIGatewayProxyEventV2 } from 'aws-lambda';

import jwtToUser from '../../datasources/jwtToUser';
import { APIProcessedEvent } from './interfaces';

export default async function beforeRequest(
    event: APIGatewayProxyEventV2,
): Promise<APIProcessedEvent> {
    const {
        requestContext: { authorizer: { jwt } = {} },
    } = event;
    const jwtData = jwtToUser(jwt);
    const user = jwt?.claims.sub;
    // @ts-ignore  typescript is terrible on understanding this kind of type operation
    return Object.assign(event, { ...jwtData, jwt, user });
}
