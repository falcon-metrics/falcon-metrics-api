export interface CheckpointItem {
    id?: number;
    name?: string;
    startDate?: Date;
    finishDate?: Date;
    orgId?: string;
}

export type CheckpointSnapshotItem = {
    id: number;
    name?: string;
    checkpoints_view_id: number;
    orgId: string;
    context_id: string;
    snapshot_date: Date;
    lead_time_85: number;
    wip_count: number;
    wip_age_85: number;
    fitness_level: number;
    lead_time_predictability: string;
    flow_efficiency: number;
    stale_work: number;
    average_throughput: number;
    flow_debt: number;
    lead_time_portfolio_85: number;
    lead_time_target_met: number;
    throughput_predictability: string;
    total_throughput: number,
    wip_age_avg: number,
    lead_time_team_avg: number,
    lead_time_portfolio_avg: number,
    key_sources_of_delay: Record<string, any>,
};

export type CheckpointWithUnit = {
    value: number | string;
    unit: string;
    colour?: string;
};

export type ComparisionWithArrowDirection = {
    value: string | number;
    arrow: {
        direction: string;
        colour: string;
    };
};

type DefaultListValue = {
    [key: string]: CheckpointWithUnit | ComparisionWithArrowDirection;
};

export type CheckpointsListResponse = {
    lead_time_85?: DefaultListValue;
    wip_age_85?: DefaultListValue;
    fitness_level?: DefaultListValue;
    lead_time_predictability?: DefaultListValue;
    flow_efficiency?: DefaultListValue;
    value_demand?: DefaultListValue;
    current_productivity?: DefaultListValue;
    stale_work?: DefaultListValue;
    blockers?: DefaultListValue;
    average_throughput?: DefaultListValue;
    delayed_items_count?: DefaultListValue;
    expedite_pcnt?: DefaultListValue;
    comparision?: ComparisionWithArrowDirection;
};
