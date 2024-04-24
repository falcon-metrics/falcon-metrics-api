export class FQLError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FQLError';
    }
}
