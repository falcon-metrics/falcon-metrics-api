import { WhereOptions } from "sequelize";

export interface IDBOp {
    get(identifier: string, orgIdFilter: WhereOptions): Promise<any>;
    save(payload: any, identifier: string): Promise<any>;
}
