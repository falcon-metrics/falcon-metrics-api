import { Logger } from 'log4js';
import { Sequelize } from 'sequelize';
import { IQueryFilters } from '../common/filters_v2';
import { SecurityContext } from '../common/security';
import { CommentsDbAurora } from './comments_db_aurora';
import { RawComment } from './interfaces';

export class Calculations {
    readonly orgId?: string;
    readonly logger: Logger;
    readonly filters?: IQueryFilters;
    readonly commentsDbAurora: CommentsDbAurora;
    readonly auroraWriter: Promise<Sequelize>;

    constructor(opts: {
        auroraWriter: Promise<Sequelize>;
        security: SecurityContext;
        logger: Logger;
        filters?: IQueryFilters;
        commentsDbAurora: CommentsDbAurora;
    }) {
        this.auroraWriter = opts.auroraWriter;
        this.orgId = opts.security.organisation!;
        this.logger = opts.logger;
        this.filters = opts.filters;
        this.commentsDbAurora = opts.commentsDbAurora;
    }

    async getComment(id: number, contextId: string): Promise<RawComment[]> {
        const dateRange = await this.filters?.datePeriod();
        return await this.commentsDbAurora.getComment(
            id,
            this.orgId!,
            contextId,
            dateRange!,
        );
    }

    async getComments(contextId: string): Promise<RawComment[]> {
        const dateRange = await this.filters?.datePeriod();
        return await this.commentsDbAurora.getAllComments(
            this.orgId!,
            contextId,
            dateRange!,
        );
    }

    async getCommentWithReplies(
        commentId: string,
        // contextId: string,
    ): Promise<RawComment[]> {
        return await this.commentsDbAurora.getCommentWithReplies(
            this.orgId!,
            // contextId,
            commentId,
        );
    }

    async createComment(
        commentObject: RawComment,
    ): Promise<RawComment | unknown> {
        const aurora: Sequelize = await this.auroraWriter;
        try {
            const result = await this.commentsDbAurora.saveComment(
                this.orgId!,
                commentObject,
                aurora,
            );
            return result;
        } catch (error) {
            const message =
                error instanceof Error && error?.message
                    ? error.message
                    : 'An error occured on createComment';
            console.debug('Error create a Comment: ', message);
        }
    }

    async updateComment(
        commentObject: RawComment,
    ): Promise<RawComment | unknown> {
        const aurora: Sequelize = await this.auroraWriter;
        try {
            return await this.commentsDbAurora.updateComment(
                this.orgId!,
                commentObject,
                aurora,
            );
        } catch (error) {
            const message =
                error instanceof Error && error?.message
                    ? error.message
                    : 'An error occured on update';
            console.debug('Error when Update Comment: ', message);
        }
    }

    /*
     * (Case 1) When a comment has replies
     * Behaviour: Delete a (main comment) who has a lot of replies
     * Expected: Delete first all children before delete the (main comment)
     *
     * (Case 2) When a comment is only a reply
     * Expected: Find this comment and just remove
     *
     * (Case 3) When a comment has no replies
     * Expect: Find and delete this only
     **/
    async deleteComment(comentId: number): Promise<void> {
        const aurora: Sequelize = await this.auroraWriter;
        try {
            // Delete comment
            await this.commentsDbAurora.delete(comentId, this.orgId!, aurora);
        } catch (error) {
            console.debug(
                'error calculations delete Comment and replies ==>',
                error,
            );
            throw error;
        }
    }
}
