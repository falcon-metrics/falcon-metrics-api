import { SecurityContext } from '../common/security';
import { IContext } from './context_interfaces';

export interface IContextFilter {
    isAllowed(workItemKey: string): Promise<boolean>;
}

export class ContextFilter implements IContextFilter {
    private security: SecurityContext;
    private contextRestricted: boolean;
    private context: IContext;
    private contextIdFromQuery?: string;
    private allowedContextIds?: Array<string>;
    private allowedWorkItemKeys?: Array<string>;

    constructor(opts: {
        queryParameters: { [name: string]: string };
        security: SecurityContext;
        context: IContext;
    }) {
        this.context = opts.context;
        this.security = opts.security;

        if (opts.queryParameters && opts.queryParameters['contextId']) {
            this.contextIdFromQuery = opts.queryParameters['contextId'];
        }

        this.contextRestricted = opts.security.allowedContextIds.length > 0;
    }

    private async getAllowedContextIds(): Promise<Array<string>> {
        if (!this.allowedContextIds) {
            this.allowedContextIds = [];

            if (!this.security.organisation) return this.allowedContextIds;

            for (const contextId of this.security.allowedContextIds) {
                this.allowedContextIds = this.allowedContextIds.concat(
                    (
                        await this.context.getContextBranch(
                            this.security.organisation,
                            contextId,
                        )
                    )
                        .filter((item) => item.id)
                        .map((item) => item.id!),
                );
            }
        }

        return this.allowedContextIds;
    }

    // private async getWorkItemKeys(): Promise<Array<string>> {
    //     // Failsafe
    //     if (!this.security.organisation) return [];

    //     if (this.allowedWorkItemKeys) return this.allowedWorkItemKeys;

    //     // An unauthorised context id was selected by a standard user
    //     if (
    //         this.contextIdFromQuery &&
    //         !this.security.isPowerUser() &&
    //         !(await this.getAllowedContextIds()).includes(
    //             this.contextIdFromQuery,
    //         )
    //     )
    //         return [];

    //     // For a standard user that has not selected a context id
    //     // get the combined work item keys for the context ids
    //     // they're allowed to see
    //     if (!this.contextIdFromQuery && !this.security.isPowerUser()) {
    //         this.allowedWorkItemKeys = [];
    //         for (const contextId of await this.getAllowedContextIds()) {
    //             this.allowedWorkItemKeys.push(
    //                 ...(await this.context.getWorkItemKeysForContextBranch(
    //                     this.security.organisation!,
    //                     contextId,
    //                 )),
    //             );
    //         }

    //         return this.allowedWorkItemKeys;
    //     }

    //     // Power user, return the keys for the selected context branch
    //     if (this.contextIdFromQuery) {
    //         this.allowedWorkItemKeys = [];

    //         this.allowedWorkItemKeys = await this.context.getWorkItemKeysForContextBranch(
    //             this.security.organisation,
    //             this.contextIdFromQuery,
    //         );
    //     }

    //     return this.allowedWorkItemKeys ?? [];
    // }

    async isAllowed(workItemKey: string): Promise<boolean> {
        //TODO: implement when we don't
        return true;
        // Power user gets to see everything unless they want to filter out
        // by context id
        // if (!this.contextIdFromQuery && this.security.isPowerUser())
        //     return true;

        // // Standard user can only see stuff if they have been setup with a list of
        // // allowable context ids
        // if (!this.contextRestricted && !this.security.isPowerUser())
        //     return false;

        // return (await this.getWorkItemKeys()).includes(workItemKey);
    }
}
