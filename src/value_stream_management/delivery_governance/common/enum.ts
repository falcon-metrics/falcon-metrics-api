export enum PredefinedWidgetTypes {
    //Fitness Criteria
    LEADTIME                         = 'lead-time',
    SERVICELEVEL                     = 'service-level',
    PREDICTABILITY                   = 'predictability',
    DELIVERYRATE                     = 'delivery-rate',
    VALUEDELIVERED                   = 'value-delivered',
    FLOWEFFICIENCY                   = 'flow-efficiency',

    //Flow of Demands
    DEMANDVSCAPACITY                 = 'demand-vs-capacity',
    WORK_STARTED_COMPLETED           = 'work-started-completed',
    TOTAL_UPCOMING_WORK              = 'total-upcoming-work',
    COMMITTED_WORK_RATE              = 'committed-work-rate',
    TIMETOSTART                      = 'time-to-start',
    WIPCOUNT                         = 'wip-count',
    WIPAGE                           = 'wip-age',
    TOTAL_WORK_COMPLETED             = 'total-work-completed',

    //Profile Of Work
    DEMANDDISTRIBUTION_UPCOMINGWORK  = 'demand-distribution-upcoming-work',
    DEMANDDISTRIBUTION_WORKINPROCESS = 'demand-distribution-work-in-process',
    DEMANDDISTRIBUTION_COMPLETEDWORK = 'demand-distribution-completed-work',

    //Source of Delay and Waste
    RETURNED_TO_BACKLOG              = 'returned-to-work',
    CANCELLED_WORK                   = 'cancelled-work',
    STALEWORK                        = 'stale-work',
    IMPEDIMENTS                      = 'impediments',
    ABORTED_ITEMS                    = 'aborted-items',
    PRODUCTIVITY_DEBT                = 'productivity-debt',
    TOP_WAIT_STEPS                   = 'top-wait-steps',
    WIPEXCESS                        = 'wip-excess',
    DELAYEDITEMS                     = 'delayed-items',

    //Class of Service
    CLASSOFSERVICE_UPCOMINGWORK      = 'class-of-service-upcoming-work',
    CLASSOFSERVICE_WORKINPROCESS     = 'class-of-service-work-in-process',
    CLASSOFSERVICE_COMPLETEDWORK     = 'class-of-service-completed-work',
    
    //Performance Checkpoint
    PERFORMANCE_COMPARISON           = 'performance-comparison-by-time'
}
