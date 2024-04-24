import axios, { AxiosResponse } from 'axios';
import {
    DatadogLogMessage,
    DatadogMetricMessage,
} from '../customer_telemetry/types';

export class DatadogClient {
    private apiKey: string;
    private datadogLogResource: string;
    private datadogMetricsResource: string;
    private headers: {
        'Content-Type': string;
        'DD-API-KEY': string;
    };
    constructor() {
        if (!process.env.DATADOG_API_KEY) {
            throw Error('Cannot find datadog api key');
        }
        this.apiKey = process.env.DATADOG_API_KEY;
        this.datadogLogResource =
            'https://http-intake.logs.datadoghq.com/api/v2/logs';
        this.datadogMetricsResource = 'https://api.datadoghq.com/api/v1/series';
        this.headers = {
            'Content-Type': '',
            'DD-API-KEY': this.apiKey,
        };
    }
    async sendLogToDatadog(
        message: DatadogLogMessage,
    ): Promise<AxiosResponse<any>> {
        this.headers['Content-Type'] = 'application/json';
        return await axios.post(this.datadogLogResource, message, {
            headers: this.headers,
        });
    }
    async sendMetricsToDatadog(
        message: DatadogMetricMessage,
    ): Promise<AxiosResponse<any>> {
        this.headers['Content-Type'] = 'text/json';
        return await axios.post(this.datadogMetricsResource, message, {
            headers: this.headers,
        });
    }
}
