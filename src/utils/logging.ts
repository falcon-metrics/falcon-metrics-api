export const apiErrorMessage = (
    tier: 'DB' | 'Calculation' | 'Handler',
    name: string,
    error: any,
) => {
    return `[TIER:${tier}]: error in ${name}: ${error}`;
};
export const logErrorInHandler = (error: any) => {
    const message = error.message;
    if (message?.startsWith('[TIER')) {
        console.error(message);
    } else {
        console.error(message | error);
    }
};
