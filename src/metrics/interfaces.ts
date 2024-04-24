export type RawMetricName = {
    column_name: string;
};

export interface MetricsNames {
    metrics: Array<RawMetricName>;
}

export interface DefaultFlowBasedMetricsItem {
    columnName: string;
    displayName: string;
    description?: string;
}

export type MetricInfo = {
    id?: number;
    metric: string;
    display_on_checkpoints: boolean;
    display_on_benchmarking: boolean;
    filter_id?: number; // database filter_id
    filter_displayName?: string; // filter name
    description?: string;
    unit?: string;
    value?: string | number;
};

export type CustomViewInfo = Omit<MetricInfo, 'metric' | 'description'> & {
    tag: string; // tag name in normalisation
    displayName: string;
};

export type RawMetric = {
    id?: number;
    orgId?: string;
    metrics: MetricInfo[];
    customViews: CustomViewInfo[];
};

export type GetResponse = {
    defaultMetrics: DefaultFlowBasedMetricsItem[];
    metrics: RawMetric[];
};

export enum NormalizationCategories {
    DEMAND = 'demand',
    VALUE_AREA = 'value-area',
    QUALITY = 'quality',
    PLANNED_UNPLANNED = 'planned-unplanned',
    REFUTABLE_IRREFUTABLE = 'refutable-irrefutable',
    DELAYABLE_NONDELAYABLE = 'delayable-non-delayable',
    CLASS_OF_SERVICE = 'class-of-service',
}

export type DefaultCustomViewsType = {
    id: number;
    key: string;
    displayName: string;
    fields: {
        id: string;
        displayName: string;
    }[];
};

export type FilterWithId = {
    filter_displayName?: string;
    filter_id?: string | number;
    tag?: string;
    display_on_benchmarking: boolean;
    display_on_checkpoints: boolean;
};
