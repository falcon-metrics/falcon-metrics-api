export class HubspotError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'Hubspot integration error';
    }
}
