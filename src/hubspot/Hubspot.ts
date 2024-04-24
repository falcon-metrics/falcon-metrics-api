import { Logger } from 'log4js';
import axios from 'axios';
import { HubspotError } from './HubspotError';

import { IHubspotSecret } from './HubspotSecret';

export interface IHubspot {
    createInHubspot(organistion: any, contact: any): Promise<boolean>;
}

export class Hubspot implements IHubspot {
    private logger: Logger;
    private hubspotSecret: IHubspotSecret;
    private readonly HUBSPOT_OBJECTS_API =
        'https://api.hubspot.com/crm/v3/objects';
    private readonly HUBSPOT_DEALS_API = 'https://api.hubspot.com/deals/v1';

    constructor(opts: { logger: Logger; hubspotSecret: IHubspotSecret; }) {
        this.logger = opts.logger;
        this.hubspotSecret = opts.hubspotSecret;
    }

    async createInHubspot(organistion: any, contact: any): Promise<boolean> {
        await this.createOrganisation(organistion);
        await this.createContact(contact);
        // const hubSpotDeal = await this.createDeal(
        //     hubspotCompany,
        //     hubSpotContact,
        // );

        return true;
    }

    private async createOrganisation(organisation: any): Promise<any> {
        const API_KEY = await this.hubspotSecret.getApiKey();
        const CREATE_COMPANY_URL = `${this.HUBSPOT_OBJECTS_API}/companies`;

        const company = {
            properties: {
                city: organisation.city,
                domain: organisation.companyDomain,
                industry: '',
                name: organisation.enterprise,
                phone: '',
                state: organisation.state,
            },
        };

        const response = await axios.post(
            CREATE_COMPANY_URL,
            JSON.stringify(company),
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                },
            },
        );

        if (response.status === 201) {
            const hubspotCompany = response.data;
            if (this.logger.isDebugEnabled()) {
                this.logger.debug(
                    '[HUBSPOT] created company: ',
                    hubspotCompany,
                );
            }
            return hubspotCompany;
        } else {
            this.logger.error(
                '[HUBSPOT] failed to create company: ',
                organisation,
            );
            throw new HubspotError('failed to create company');
        }
    }

    private async createContact(contact: any): Promise<boolean> {
        const API_KEY = await this.hubspotSecret.getApiKey();
        const CREATE_CONTACT_URL = `${this.HUBSPOT_OBJECTS_API}/contacts`;

        //you can lookup owner id's here:
        //https://api.hubapi.com/owners/v2/owners?hapikey=
        const DEAL_OWNER_ID = '#######';

        const hubspotContact = {
            properties: {
                company: contact.companyName,
                email: contact.email,
                firstname: contact.firstName,
                lastname: contact.lastName,
                phone: '',
                website: '',
                jobtitle: contact.role,
                access: 'Yes',
                lifecyclestage: 'lead',
                hubspot_owner_id: DEAL_OWNER_ID,
            },
        };

        const response = await axios.post(
            CREATE_CONTACT_URL,
            JSON.stringify(hubspotContact),
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                },
            },
        );

        if (response.status === 201) {
            const hubspotContact = response.data;
            if (this.logger.isDebugEnabled()) {
                this.logger.debug(
                    '[HUBSPOT] created contact: ',
                    hubspotContact,
                );
            }
            return hubspotContact;
        } else {
            this.logger.error('[HUBSPOT] failed to create contact: ', contact);
            throw new HubspotError('failed to create contact');
        }
    }


}
