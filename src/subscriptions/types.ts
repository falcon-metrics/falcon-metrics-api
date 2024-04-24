import { DateTime } from "luxon";

export enum ThresholdUnit {
    Day = 'day',
    Week = 'week',
    Month = 'month',
    Percent = 'percent',
}
export enum ThresholdDirection {
    Up = 'up',
    Down = 'down',
    Both = 'both',
}


export interface ThresholdNotificationSubscriptionRequest {
    notificationId: string;
    threshold: number;
    thresholdUnit: ThresholdUnit;
    thresholdDirection: ThresholdDirection;
    queryParameters?: string;
    obeyaRoomId?: string;
    targetDate?: string;
};

export type ThresholdNotificationSubscription = Omit<
    ThresholdNotificationSubscriptionRequest,
    'targetDate'
> & {
    orgId: string;
    email: string;
    userId: string;
    targetDate?: DateTime;
    active: boolean;
};

export const ThresholdNotificationId = '1';
