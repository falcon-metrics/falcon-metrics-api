import { OKRObjective } from '../obeya/objectives/calculations';
import { Relationship } from '../relationships/handler';

export type HorizonItem = {
    id: string | number;
    orgId: string;
    contextId: string;
    visionId: string;
    title: string;
    startDate: string;
    endDate: string;
};

export type StrategyItem = {
    id?: string | number;
    strategyStatement?: string;
    strategyDescription?: string;
    associationType: string;
    relationShips: Relationship[];
    updatedAt: string;
    userCreated: string;
    userModified: string;
    orgId: string;
    contextId: string;
    parentStrategicDriverId?: string;
    strategicDrivers: any[];
    strategy: any;
    okrs?: OKRObjective[];
};
