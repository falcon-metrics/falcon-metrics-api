import { asClass, Lifetime } from 'awilix';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { BaseHandler } from '../common/base_handler';
import { IQueryFilters, QueryFilters } from '../common/filters_v2';
import { Calculations as CommentsCalculations } from './calculations';
import { CommentsDbAurora } from './comments_db_aurora';
import { GetResponse } from './interfaces';
import RelationshipsDbAurora from '../relationships/relationships_db_aurora';

class Comments extends BaseHandler {
    readonly commentsCalculations: CommentsCalculations;
    readonly commentsDbAurora: CommentsDbAurora;
    readonly orgId: string;
    readonly filters: IQueryFilters;
    private relationshipsDbAurora: RelationshipsDbAurora;

    constructor(event: APIGatewayProxyEventV2) {
        super(event, {
            commentsDbAurora: asClass(CommentsDbAurora, {
                lifetime: Lifetime.SCOPED,
            }),
            commentsCalculations: asClass(CommentsCalculations, {
                lifetime: Lifetime.SCOPED,
            }),
            filters: asClass(QueryFilters, {
                lifetime: Lifetime.SCOPED,
            }),
            relationshipsDbAurora: asClass(RelationshipsDbAurora, {
                lifetime: Lifetime.SCOPED
            })
        });
        this.commentsCalculations = this.dependencyInjectionContainer.cradle.commentsCalculations;
        this.commentsDbAurora = this.dependencyInjectionContainer.cradle.commentsDbAurora;
        this.orgId = this.dependencyInjectionContainer.cradle.security.organisation!;
        this.filters = this.dependencyInjectionContainer.cradle.filters;
        this.relationshipsDbAurora = this.dependencyInjectionContainer.cradle.relationshipsDbAurora;
    }

    async getCommentWithReplies(
        event: APIGatewayProxyEventV2,
    ): Promise<GetResponse | { statusCode: number; body: string; }> {
        const contextId = event?.queryStringParameters?.contextId as
            | string
            | undefined;

        const commentId = event?.pathParameters?.id as string | undefined;

        // if (!contextId) {
        //     return {
        //         statusCode: 400,
        //         body: JSON.stringify({
        //             error: { message: 'contextId is required' },
        //         }),
        //     };
        // }

        if (!commentId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Comment id is required' },
                }),
            };
        }
        try {
            /*
                Should list the comments stored by the current org level
            */
            const comment = await this.commentsCalculations.getCommentWithReplies(
                commentId,
                // contextId,
            );
            await Promise.all(comment.map(async (c) => {
                const relationshipCount = await this.relationshipsDbAurora.getRelationshipCount(c.id || '', 'comment', this.orgId);
                c.relationshipCount = relationshipCount;
            }));
            return {
                statusCode: 200,
                body: JSON.stringify({
                    comment, // stored comments
                }),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in comments.withAllReplies',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors
                        ? (error as any).errors
                        : error instanceof Error
                            ? error.message
                            : 'Internal Server Error',
                ),
            };
        }
    }

    async getAllComments(
        event: APIGatewayProxyEventV2,
    ): Promise<GetResponse | { statusCode: number; body: string; }> {
        const contextId = event?.queryStringParameters?.contextId as
            | string
            | undefined;

        if (!contextId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'contextId is required' },
                }),
            };
        }
        try {
            /*
                Should list the comments stored by the current org level
            */
            const comments = await this.commentsCalculations.getComments(
                contextId,
            );
            await Promise.all(comments.map(async (comment) => {
                const relationshipCount = await this.relationshipsDbAurora.getRelationshipCount(comment.id || '', 'comment', this.orgId);
                comment.relationshipCount = relationshipCount;
            }));
            return {
                statusCode: 200,
                body: JSON.stringify({
                    comments, // stored comments
                }),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in comments.getAllComments',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors
                        ? (error as any).errors
                        : error instanceof Error
                            ? error.message
                            : 'Internal Server Error',
                ),
            };
        }
    }

    private parseBody(body: string) {
        const checkpointView = JSON.parse(body!);
        return checkpointView;
    }

    async postComment({ body, requestContext }: APIGatewayProxyEventV2) {
        if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const comment = this.parseBody(body!);
        delete comment.id;
        if (!comment.context_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'context_id field is required' },
                }),
            };
        }

        const userId = requestContext?.authorizer?.jwt.claims.sub;
        if (!userId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Invalid user id in comment request.' },
                }),
            };
        }

        const newComment = {
            ...comment,
            user_id: userId,
            elementFields: comment?.elementFields
                ? JSON.stringify(comment?.elementFields)
                : null,
        };

        try {
            const result = await this.commentsCalculations.createComment(
                newComment,
            );
            return {
                statusCode: 200,
                body: JSON.stringify(result),
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in comment',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );

            return {
                statusCode: 500,
                body: JSON.stringify(
                    error && (error as any).errors
                        ? (error as any).errors
                        : error instanceof Error
                            ? error.message
                            : 'Internal Server Error',
                ),
            };
        }
    }

    async removeComment(event: APIGatewayProxyEventV2) {
        if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const commentId = event?.pathParameters?.id as string | undefined;

        if (!commentId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: { message: 'Comment id is required' },
                }),
            };
        }

        try {
            await this.commentsCalculations.deleteComment(Number(commentId));
            await this.relationshipsDbAurora.removeRelationships(commentId, 'comment', this.orgId);
            return {
                statusCode: 200,
            };
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in remove Comments',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }

    async patchComment({ body }: APIGatewayProxyEventV2) {
        if (!(this.security.isAdminUser() || this.security.isPowerUser())) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: { message: 'Forbidden' } }),
            };
        }

        const commentInfo = this.parseBody(body!);
        try {
            const comments = await this.commentsCalculations.getComment(
                commentInfo.id,
                commentInfo.context_id,
            );

            const commentItemWasFound = comments.findIndex(
                (commentItem: any) =>
                    commentItem?.id.toString() === commentInfo?.id?.toString(),
            );

            if (commentItemWasFound > -1) {
                const result = await this.commentsCalculations.updateComment(
                    commentInfo,
                );
                return {
                    statusCode: 200,
                    body: JSON.stringify(result),
                };
            } else {
                return {
                    statusCode: 404,
                    body: JSON.stringify({
                        message: 'Comment with id not found.',
                    }),
                };
            }
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: 'Error in patchComment',
                    orgId: this.orgId,
                    errorMessage: (error as Error).message,
                    errorStack: (error as Error).stack,
                }),
            );
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal Server Error' }),
            };
        }
    }
}

export const getAllComments = async (event: APIGatewayProxyEventV2) => {
    return await new Comments(event).getAllComments(event);
};

export const getCommentWithReplies = async (event: APIGatewayProxyEventV2) => {
    return await new Comments(event).getCommentWithReplies(event);
};

export const postComment = async (event: APIGatewayProxyEventV2) => {
    return await new Comments(event).postComment(event);
};

export const removeComment = async (event: APIGatewayProxyEventV2) => {
    return await new Comments(event).removeComment(event);
};

export const patchComment = async (event: APIGatewayProxyEventV2) => {
    return await new Comments(event).patchComment(event);
};
