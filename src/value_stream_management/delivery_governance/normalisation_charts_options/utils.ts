import sequelize from 'sequelize';

export default async function getNormalisationCategoryList(aurora: sequelize.Sequelize, orgId: string) {
    const rows: any[] = await aurora.query(
        'SELECT tags FROM "filters" WHERE "orgId" = :orgId AND "deletedAt" IS NULL AND "tags" LIKE \'normalisation, %\'',
        {
            replacements: { orgId: orgId },
            type: sequelize.QueryTypes.SELECT,
            raw: true,
        }
    );
    
    const normalisationKeyList = rows.map(row => row.tags.split(',')[1].trim());

    const predefinedTags: Record<string, string> = {
      'demand': 'Demand',
      'value-area': 'Value Area',
      'quality': 'Class of Value',
      'planned-unplanned': 'Planned/Unplanned',
      'refutable-irrefutable': 'Refutable/Irrefutable',
      'delayable-non-delayable': 'Delayable/Non-Delayable',
      'class-of-service': 'Class of Service',
    };

    const options: {id: string, displayName: string}[] = [];
    for (let key of normalisationKeyList) {
        // Skip duplicated keys
        if (options.find(option => option.id === key)) {
            continue;
        }
        if (predefinedTags[key]) {
            // Add fixed normalisation
            options.push({
                id: key,
                displayName: predefinedTags[key]
            });
        } else {
            // Add custom normalisation
            options.push({
                id: key,
                displayName: key.split('-').join(' ')
            });
        }
    }

    return options;
}