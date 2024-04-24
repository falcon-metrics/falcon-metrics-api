type ConfigType = {
    [key: string]: () => Promise<any>;
};

export const handleQuery = async function (config: ConfigType, query: string[]) {
    const response: any = {};
    const promises = query.map(async (q: any) => {
        if (Object.keys(config).includes(q)) {
            response[q] = await config[q];
        } else {
            throw new Error("Unhandled query value.");
        }
    });
    const results = await Promise.all(promises);
    return response;
};