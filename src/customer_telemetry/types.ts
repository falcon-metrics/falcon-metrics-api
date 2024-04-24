export type Actions =
    | 'ContextSelection'
    | 'SignUp'
    | 'SignOut'
    | 'DatasourcesManaging'
    | 'ApplyFilter'
    | 'PageNavigation'
    | 'CreateDatasource'
    | 'EnabledDatasource'
    | 'DisabledDatasource'
    | 'EditDatasource'
    | 'DeleteDatasource'
    | 'SummaryPageNavigation'
    | 'AnalyticsPageNavigation'
    | 'AccessedDatasource'
    | 'AccessedProjects'
    | 'AccessedWorkflows'
    | 'AccessedSettings'
    | 'AccessedWorkItemTypes'
    | 'AccessedBoardsAndAggregations'
    | 'AccessedCustomFields'
    | 'AccessedDatasourceSettings'
    | 'AccessedOrganizationSettings'
    | 'AccessedNormalization'
    | 'ConfiguredDatasource'
    | 'ConfiguredSettings'
    | 'ConfiguredWorkflows'
    | 'ConfiguredDatasourceSettings'
    | 'ConfiguredProjects'
    | 'ConfiguredNormalization'
    | 'ConfiguredCustomFields'
    | 'ConfiguredOrganizationSettings'
    | 'ConfiguredWorkItemTypes'
    | 'ConfiguredBoardsAndAggregations'
    | 'AccessedSummaryPage'
    | 'ConfirmedSummaryPage'
    | 'FinishedCreateDatasource'
    | 'AccessObeyaHomePage'
    | 'SelectObeyaRoom'
    | 'CreateOKR'
    | 'RemoveOKR'
    | 'EditOKR'
    | 'AddKeyResult'
    | 'DeleteKeyResult'
    | 'AccessObeyaRooms'
    | 'DeleteObeyaRoom'
    | 'AccessNewObeyaRoomForm'
    | 'AccessEditObeyaRoomForm'
    | 'CreateObeyaRoom'
    | 'EditObeyaRoom'
    | 'CreateDependency'
    | 'UpdateDependency'
    | 'UpdateRisk'
    | 'CreateRisk'
    | TelemetryNavigationActions
    | TelemetryValueStreamManagementNavigationActions
    | AccordionActions
    | PredictiveAnalysisTelemetryAction
    | ObeyaTelemetryActions;

export enum TelemetryNavigationActions {
    accessValueStreamManagement = 'AccessValueStreamManagement',
    accessAnalyticsDashboard = 'AccessAnalyticsDashboard',
    accessGovernanceObeya = 'AccessGovernanceObeya',
}
export enum TelemetryValueStreamManagementNavigationActions {
    accessDeliveryGovernance = 'AccessValueDeliveryGovernance',
    accessDeliveryManagement = 'AccessDeliveryManagement',
    accessContinuousImprovements = 'AccessContinuousImprovements',
}
export enum AccordionActions {
    openAccordion = 'OpenAccordion',
    closeAccordion = 'closeAccordion',
}
export enum PredictiveAnalysisTelemetryAction {
    accessWhen = 'AccessWhenAnalysis',
    accessHowMany = 'AccessHowManyAnalysis',
    accessSettings = 'AccessForecastingSettings',
    updateSettings = 'UpdateForecastingSettings',
}
export enum ObeyaTelemetryActions {
    AccessObeyaHomePage = 'AccessObeyaHomePage',
    SelectObeyaRoom = 'SelectObeyaRoom',
    CreateOKR = 'CreateOKR',
    RemoveOKR = 'RemoveOKR',
    EditOKR = 'EditOKR',
    AddKeyResult = 'AddKeyResult',
    DeleteKeyResult = 'DeleteKeyResult',
    AccessObeyaRooms = 'AccessObeyaRooms',
    DeleteObeyaRoom = 'DeleteObeyaRoom',
    AccessNewObeyaRoomForm = 'AccessNewObeyaRoomForm',
    AccessEditObeyaRoomForm = 'AccessEditObeyaRoomForm',
    CreateObeyaRoom = 'CreateObeyaRoom',
    EditObeyaRoom = 'EditObeyaRoom',
    CreateDependency = 'CreateDependency',
    UpdateDependency = 'UpdateDependency',
    UpdateRisk = 'UpdateRisk',
    CreateRisk = 'CreateRisk',
}
export type Feature = {
    page?: string;
    widget?: string;
};
export type User = {
    name: string;
    email: string;
    organisation: string;
};

export type TelemetryMessage = {
    user: User;
    action: Actions;
    detail: string;
    feature?: Feature;
};

///////////////Datadog stuff
/**
 * {
  "series": [
    {
      "metric": "system.load.1",
      "type": "count",
      "points": [
        [
          1636629071,
          1.1
        ]
      ],
     "tags": [
      "test:yy-test-tag",
      "widget:test-widget"
      ]
    }
  ]
}
 */
export enum DatadogServiceTag {
    service = 'api',
}

export type DatadogAttributes = DatadogTags & {
    'usr.type': 'client' | 'internal';
};
export type DatadogTags = Feature & {
    action: string;
    email: string;
    organisation: string;
    username: string;
};

export type DatadogMetricMessage = {
    series: DatadogMetricItem[];
};

export type DatadogMetricItem = {
    metric: string;
    service: DatadogServiceTag;
    points: [number, number][];
    tags: string[];
    type: 'count';
};
export type DatadogLogMessage = DatadogAttributes & {
    ddsource: string;
    ddtags: string;
    service: string;
    message: string;
};
