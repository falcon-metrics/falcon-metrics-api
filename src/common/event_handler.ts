import { APIGatewayProxyEventV2, ScheduledEvent } from 'aws-lambda';

export const CheckEventIsApiGateWay = function (event: any): boolean {
    return event.rawPath && event.headers; //the properties belongs to APIGatewayEvent but not in scheduled event
};

export const HandleEvent = async function (
    event: APIGatewayProxyEventV2 | ScheduledEvent,
    handler: any,
) {
    if (CheckEventIsApiGateWay(event)) {
        console.log('this is an api event =====>');
        event = <APIGatewayProxyEventV2>event;
        return await new handler(event).getEverything(event);
    } else {
        //is scheduledEvent
        console.log('it is a scheduled event ====>');
        return 200;
    }
};
