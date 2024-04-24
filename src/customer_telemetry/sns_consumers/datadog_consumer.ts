import { AxiosResponse } from 'axios';
import { DatadogClient } from '../../external_apis/datadog_client';
import {
    Actions,
    DatadogAttributes,
    DatadogLogMessage,
    DatadogMetricMessage,
    DatadogServiceTag,
    DatadogTags,
    TelemetryMessage,
} from '../types';

const SERVICE = DatadogServiceTag.service;
const METRIC_PREFIX = 'falcon-metrics.telemetry.';

export const sendToDatadogLogs = async (
    telemetry: TelemetryMessage,
    datadogClient: DatadogClient,
): Promise<AxiosResponse<any>> => {
    const logMessage = formatDatadogLogMessage(telemetry);
    try {
        return await datadogClient.sendLogToDatadog(logMessage);
    } catch (error) {
        console.log(error);
        throw error;
    }
};
export const sendToDatadogMetrics = async (
    telemetry: TelemetryMessage,
    datadogClient: DatadogClient,
): Promise<AxiosResponse<any>> => {
    const metricMessage = formatDatadogMetricMessage(telemetry);
    try {
        return await datadogClient.sendMetricsToDatadog(metricMessage);
    } catch (error) {
        console.log(error);
        throw error;
    }
};

const formatDatadogLogMessage = (
    telemetry: TelemetryMessage,
): DatadogLogMessage => {
    const tagObject = formatDatadogTags(telemetry);
    const userType = tagObject.email.includes('falcon-metrics.com')
        ? 'internal'
        : 'client';
    const attributes: DatadogAttributes = {
        ...tagObject,
        'usr.type': userType,
    };
    return {
        service: SERVICE,
        ddsource: 'telemetry',
        ddtags: convertTagsToStringForLog(tagObject), //use for aggregate
        message: `[USER]:${telemetry.user.name}; [DETAIL]:${telemetry.detail}`,
        ...attributes, ///used for search
    };
};

const formatDatadogMetricMessage = (
    telemetry: TelemetryMessage,
): DatadogMetricMessage => {
    const tagObject = formatDatadogTags(telemetry);
    const nowInSeconds = Math.round(Date.now() / 1000);
    return {
        series: [
            {
                metric: formatMetricName(telemetry.action),
                service: SERVICE,
                points: [[nowInSeconds, 1]],
                tags: convertTagsToStringForMetrics(tagObject),
                type: 'count',
            },
        ],
    };
};
const formatDatadogTags = (telemetry: TelemetryMessage): DatadogTags => {
    return {
        action: telemetry.action,
        email: telemetry.user.email,
        organisation: telemetry.user.organisation,
        page: telemetry.feature?.page,
        widget: telemetry.feature?.widget,
        username: telemetry.user.name,
    };
};
const formatMetricName = (action: Actions): string => {
    const camelCase = action.charAt(0).toLowerCase() + action.slice(1);
    return (
        METRIC_PREFIX +
        camelCase.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
    ); //camel to dash
};
const convertTagsToStringForLog = (tags: DatadogTags) => {
    const tagString: string[] = [];
    Object.keys(tags).forEach((tagKey, index) => {
        const tagValue = tags[tagKey as keyof DatadogTags];
        if (tagValue) {
            tagString.push(tagKey);
            tagString.push(':');
            tagString.push(tagValue);
            if (index < Object.keys(tags).length - 1) tagString.push(',');
        }
    });
    return tagString.join('');
};
const convertTagsToStringForMetrics = (tags: DatadogTags): string[] => {
    const tagFields: string[] = [];
    Object.keys(tags).forEach((tagKey) => {
        const tagValue = tags[tagKey as keyof DatadogTags];
        if (tagValue) {
            const tagFieldString = `${tagKey}:${tagValue}`;
            tagFields.push(tagFieldString);
        }
    });
    return tagFields;
};
