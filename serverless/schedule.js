module.exports = serverless => {

    const rate = process.env.WARM_UP_RATE || 5;
    let schedule =
        rate === 1 ? `rate(${rate} minute)` : `rate(${rate} minutes)`;

    let event = {
        name: 'lambdaWarmUp',
        description: 'Warm up lambda to avoid cold start',
    };

    let scheduleEvent = {
        eventBridge: {
            ...event,
            schedule: schedule,
        },
    };

    if (serverless.processedInput.commands[0] === 'offline') {
        scheduleEvent = {
            schedule: {
                ...event,
                rate: schedule,
            },
        };
    }


    return scheduleEvent;
}
