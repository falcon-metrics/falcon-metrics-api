import {
    IContext,
    ContextItem as DataContextItem,
    ContextLevel,
} from './context_interfaces';
import { SecurityContext } from '../common/security';

export interface IContextQueries {
    getVisibleContextTree(): Promise<ContextItems>;
    getIfVisible(contextId: string): Promise<DataContextItem | undefined>;
}

export type ContextItem = {
    id: string;
    displayName: string;
    rollingWindowPeriodInDays?: number;
    children: ContextItems;
    obeyaId?: string;
};

export type ContextItems = Map<string, ContextItem>;

export class ContextQueries implements IContextQueries {
    private context: IContext;
    private secContext: SecurityContext;

    constructor(opts: { context: IContext; security: SecurityContext; }) {
        this.context = opts.context;
        this.secContext = opts.security;
    }

    async getIfVisible(contextId: string): Promise<ContextItem | undefined> {
        const contextTree = await this.getVisibleContextTree();

        for (const portfolioContext of contextTree.values()) {
            if (portfolioContext.id === contextId) return portfolioContext;

            for (const initiativeContext of portfolioContext.children.values()) {
                if (initiativeContext.id === contextId)
                    return initiativeContext;

                for (const teamContext of initiativeContext.children.values()) {
                    if (teamContext.id === contextId) return teamContext;
                }
            }
        }

        return undefined;
    }

    async getVisibleContextTree(): Promise<ContextItems> {
        let contextItems: Array<DataContextItem> = [];

        contextItems = await this.context.getAllExceptArchived(this.secContext.organisation!);

        const hierarchy: ContextItems = new Map();

        const portfolioItems = contextItems
            .filter((item) => item.level === ContextLevel.Portfolio);
        portfolioItems.filter((item) => item.obeyaId === null || item.obeyaId === undefined).concat(portfolioItems.filter((item) => item.obeyaId !== null && item.obeyaId !== undefined))
            .forEach(
                (item) =>
                    item.positionInHierarchy &&
                    hierarchy.set(
                        `${item.datasourceId}#${item.positionInHierarchy}`,
                        {
                            id: item.id ?? '',
                            displayName: item.name ?? '',
                            children: new Map(),
                            obeyaId: item.obeyaId
                        },
                    ),
            );

        contextItems
            .filter((item) => item.level === ContextLevel.Initiative)
            .forEach((item) => {
                if (!item.positionInHierarchy) return;

                const [
                    parentPortfolioId,
                    initiativeId,
                ] = item.positionInHierarchy.split('.');

                const parentPortfolio = hierarchy.get(
                    `${item.datasourceId}#${parentPortfolioId}`,
                );

                if (!parentPortfolio) return;

                parentPortfolio.children.set(
                    `${item.datasourceId}#${initiativeId}`,
                    {
                        id: item.id ?? '',
                        displayName: item.name ?? '',
                        children: new Map(),
                        obeyaId: item.obeyaId
                    },
                );
            });

        contextItems
            .filter((item) => item.level === ContextLevel.Team)
            .forEach((item) => {
                if (!item.positionInHierarchy) return;

                const [
                    parentPortfolioId,
                    initiativeId,
                    teamId,
                ] = item.positionInHierarchy.split('.');

                const parentPortfolio = hierarchy.get(
                    `${item.datasourceId}#${parentPortfolioId}`,
                );

                if (!parentPortfolio) return;

                const parentInitiative = parentPortfolio.children.get(
                    `${item.datasourceId}#${initiativeId}`,
                );

                if (!parentInitiative) return;

                parentInitiative.children.set(
                    `${item.datasourceId}#${teamId}`,
                    {
                        id: item.id ?? '',
                        displayName: item.name ?? '',
                        children: new Map(),
                        obeyaId: item.obeyaId
                    },
                );
            });

        return this.filterOnlyAllowedBranches(hierarchy);
    }

    private filterOnlyAllowedBranches(hierarchy: ContextItems): ContextItems {
        // If power user allow all contexts
        // OR if access control is not enabled for this org, allow all contexts
        if (this.secContext.isPowerUser() || !this.secContext.isContextAccessControlEnabled()) return hierarchy;

        const portfolioKeys = Array.from(hierarchy.keys());

        for (const portfolioKey of portfolioKeys) {
            const portfolioContext = hierarchy.get(portfolioKey);

            // If the portfolio is ok, then all its children and grandchildren are visible
            if (
                portfolioContext?.displayName !== 'All' &&
                this.secContext.allowedContextIds.includes(portfolioContext!.id) // eslint-disable-line
            )
                continue;

            const initiativeKeys = Array.from(
                portfolioContext!.children.keys(),  // eslint-disable-line
            );

            for (const initiativeContextId of initiativeKeys) {
                const initiativeContext = portfolioContext!.children.get(  // eslint-disable-line
                    initiativeContextId,
                );

                // If the initiative is visible, then its children are visible
                if (
                    this.secContext.allowedContextIds.includes(
                        initiativeContext!.id, // eslint-disable-line
                    )
                )
                    continue;

                const teamKeys = Array.from(initiativeContext!.children.keys()); // eslint-disable-line

                for (const teamContextId of teamKeys) {
                    const teamContext = initiativeContext!.children.get( // eslint-disable-line
                        teamContextId,
                    );

                    if (
                        this.secContext.allowedContextIds.includes(
                            teamContext!.id, // eslint-disable-line
                        )
                    )
                        continue;

                    initiativeContext!.children.delete(teamContextId); // eslint-disable-line
                }

                // If there are children then the parent also needs to be visible
                if (initiativeContext!.children.size > 0) continue; // eslint-disable-line

                portfolioContext!.children.delete(initiativeContextId); // eslint-disable-line
            }

            // If there are children then the parent also needs to be visible
            if (portfolioContext!.children.size > 0) continue; // eslint-disable-line

            hierarchy.delete(portfolioKey);
        }

        return hierarchy;
    }
}
