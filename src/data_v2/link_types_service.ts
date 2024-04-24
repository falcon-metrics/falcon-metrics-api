import { SecurityContext } from '../common/security';
import { IState } from '../workitem/state_aurora';

export interface ILinkTypesService {
    getEverything(): Promise<string[]>;
}

export class LinkTypesService implements ILinkTypesService {
    private orgId: string;
    private state: IState;

    constructor(opts: { 
        security: SecurityContext;
        state: IState; 
    }) {
        this.orgId = opts.security.organisation!;
        this.state = opts.state;
    }

    async getEverything(): Promise<string[]> {
        const linkTypeList: string[] = 
            await this.state.getLinkTypes(this.orgId);
            
        return linkTypeList;
    }
}
