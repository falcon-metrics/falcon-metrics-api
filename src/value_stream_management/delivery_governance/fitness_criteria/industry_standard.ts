export type IndustryStandardPercentile = {
    percentileValue: number;
    dataValue: number;
};

export type IndustryStandarCohorts = {
    label: string;
    startValue: number;
    endValue: number;
};
export function getIndustryStandardSLE() {
    const industryStandardPercentileData: IndustryStandardPercentile[] = [
        {
            "percentileValue": 0,
            "dataValue": 1
        },
        {
            "percentileValue": 1,
            "dataValue": 1
        },
        {
            "percentileValue": 2,
            "dataValue": 1
        },
        {
            "percentileValue": 3,
            "dataValue": 1
        },
        {
            "percentileValue": 4,
            "dataValue": 1
        },
        {
            "percentileValue": 5,
            "dataValue": 1
        },
        {
            "percentileValue": 6,
            "dataValue": 1
        },
        {
            "percentileValue": 7,
            "dataValue": 1
        },
        {
            "percentileValue": 8,
            "dataValue": 1
        },
        {
            "percentileValue": 9,
            "dataValue": 1
        },
        {
            "percentileValue": 10,
            "dataValue": 1
        },
        {
            "percentileValue": 11,
            "dataValue": 1
        },
        {
            "percentileValue": 12,
            "dataValue": 1
        },
        {
            "percentileValue": 13,
            "dataValue": 1
        },
        {
            "percentileValue": 14,
            "dataValue": 1
        },
        {
            "percentileValue": 15,
            "dataValue": 1
        },
        {
            "percentileValue": 16,
            "dataValue": 2
        },
        {
            "percentileValue": 17,
            "dataValue": 2
        },
        {
            "percentileValue": 18,
            "dataValue": 2
        },
        {
            "percentileValue": 19,
            "dataValue": 3
        },
        {
            "percentileValue": 20,
            "dataValue": 3
        },
        {
            "percentileValue": 21,
            "dataValue": 3
        },
        {
            "percentileValue": 22,
            "dataValue": 4
        },
        {
            "percentileValue": 23,
            "dataValue": 4
        },
        {
            "percentileValue": 24,
            "dataValue": 4
        },
        {
            "percentileValue": 25,
            "dataValue": 4
        },
        {
            "percentileValue": 26,
            "dataValue": 5
        },
        {
            "percentileValue": 27,
            "dataValue": 5
        },
        {
            "percentileValue": 28,
            "dataValue": 6
        },
        {
            "percentileValue": 29,
            "dataValue": 7
        },
        {
            "percentileValue": 30,
            "dataValue": 8
        },
        {
            "percentileValue": 31,
            "dataValue": 8
        },
        {
            "percentileValue": 32,
            "dataValue": 10
        },
        {
            "percentileValue": 33,
            "dataValue": 10
        },
        {
            "percentileValue": 34,
            "dataValue": 11
        },
        {
            "percentileValue": 35,
            "dataValue": 11
        },
        {
            "percentileValue": 36,
            "dataValue": 12
        },
        {
            "percentileValue": 37,
            "dataValue": 12
        },
        {
            "percentileValue": 38,
            "dataValue": 13
        },
        {
            "percentileValue": 39,
            "dataValue": 14
        },
        {
            "percentileValue": 40,
            "dataValue": 15
        },
        {
            "percentileValue": 41,
            "dataValue": 15
        },
        {
            "percentileValue": 42,
            "dataValue": 15
        },
        {
            "percentileValue": 43,
            "dataValue": 17
        },
        {
            "percentileValue": 44,
            "dataValue": 17
        },
        {
            "percentileValue": 45,
            "dataValue": 18
        },
        {
            "percentileValue": 46,
            "dataValue": 19
        },
        {
            "percentileValue": 47,
            "dataValue": 21
        },
        {
            "percentileValue": 48,
            "dataValue": 22
        },
        {
            "percentileValue": 49,
            "dataValue": 22
        },
        {
            "percentileValue": 50,
            "dataValue": 24
        },
        {
            "percentileValue": 51,
            "dataValue": 24
        },
        {
            "percentileValue": 52,
            "dataValue": 26
        },
        {
            "percentileValue": 53,
            "dataValue": 28
        },
        {
            "percentileValue": 54,
            "dataValue": 29
        },
        {
            "percentileValue": 55,
            "dataValue": 30
        },
        {
            "percentileValue": 56,
            "dataValue": 31
        },
        {
            "percentileValue": 57,
            "dataValue": 35
        },
        {
            "percentileValue": 58,
            "dataValue": 35
        },
        {
            "percentileValue": 59,
            "dataValue": 36
        },
        {
            "percentileValue": 60,
            "dataValue": 37
        },
        {
            "percentileValue": 61,
            "dataValue": 41
        },
        {
            "percentileValue": 62,
            "dataValue": 43
        },
        {
            "percentileValue": 63,
            "dataValue": 44
        },
        {
            "percentileValue": 64,
            "dataValue": 47
        },
        {
            "percentileValue": 65,
            "dataValue": 49
        },
        {
            "percentileValue": 66,
            "dataValue": 51
        },
        {
            "percentileValue": 67,
            "dataValue": 55
        },
        {
            "percentileValue": 68,
            "dataValue": 55
        },
        {
            "percentileValue": 69,
            "dataValue": 59
        },
        {
            "percentileValue": 70,
            "dataValue": 62
        },
        {
            "percentileValue": 71,
            "dataValue": 62
        },
        {
            "percentileValue": 72,
            "dataValue": 64
        },
        {
            "percentileValue": 73,
            "dataValue": 68
        },
        {
            "percentileValue": 74,
            "dataValue": 70
        },
        {
            "percentileValue": 75,
            "dataValue": 71
        },
        {
            "percentileValue": 76,
            "dataValue": 73
        },
        {
            "percentileValue": 77,
            "dataValue": 74
        },
        {
            "percentileValue": 78,
            "dataValue": 78
        },
        {
            "percentileValue": 79,
            "dataValue": 78
        },
        {
            "percentileValue": 80,
            "dataValue": 79
        },
        {
            "percentileValue": 81,
            "dataValue": 80
        },
        {
            "percentileValue": 82,
            "dataValue": 84
        },
        {
            "percentileValue": 83,
            "dataValue": 84
        },
        {
            "percentileValue": 84,
            "dataValue": 86
        },
        {
            "percentileValue": 85,
            "dataValue": 87
        },
        {
            "percentileValue": 86,
            "dataValue": 89
        },
        {
            "percentileValue": 87,
            "dataValue": 89
        },
        {
            "percentileValue": 88,
            "dataValue": 90
        },
        {
            "percentileValue": 89,
            "dataValue": 91
        },
        {
            "percentileValue": 90,
            "dataValue": 93
        },
        {
            "percentileValue": 91,
            "dataValue": 93
        },
        {
            "percentileValue": 92,
            "dataValue": 93
        },
        {
            "percentileValue": 93,
            "dataValue": 94
        },
        {
            "percentileValue": 94,
            "dataValue": 94
        },
        {
            "percentileValue": 95,
            "dataValue": 94
        },
        {
            "percentileValue": 96,
            "dataValue": 95
        },
        {
            "percentileValue": 97,
            "dataValue": 95
        },
        {
            "percentileValue": 98,
            "dataValue": 95
        },
        {
            "percentileValue": 99,
            "dataValue": 95
        },
        {
            "percentileValue": 100,
            "dataValue": 100
        }
    ];
    const industryStandarCohortsData: IndustryStandarCohorts[] = [
        {
            "label": "Low Performers",
            "startValue": 0,
            "endValue": 52
        },
        {
            "label": "Medium Performers",
            "startValue": 53,
            "endValue": 66
        },
        {
            "label": "High Performers",
            "startValue": 67,
            "endValue": 78
        },
        {
            "label": "Elite Performers",
            "startValue": 79,
            "endValue": 999999999999999
        }
    ];

    return {
        industryStandardPercentileData,
        industryStandarCohortsData
    };
}

export function getIndustryStandardLeadTime() {
    const portfolioIndustryStandardPercentileData: IndustryStandardPercentile[] = [
        {
            "percentileValue": 1,
            "dataValue": 1
        },
        {
            "percentileValue": 2,
            "dataValue": 4
        },
        {
            "percentileValue": 3,
            "dataValue": 11
        },
        {
            "percentileValue": 4,
            "dataValue": 13
        },
        {
            "percentileValue": 5,
            "dataValue": 17
        },
        {
            "percentileValue": 6,
            "dataValue": 20
        },
        {
            "percentileValue": 7,
            "dataValue": 26
        },
        {
            "percentileValue": 8,
            "dataValue": 27
        },
        {
            "percentileValue": 9,
            "dataValue": 34
        },
        {
            "percentileValue": 10,
            "dataValue": 38
        },
        {
            "percentileValue": 11,
            "dataValue": 47
        },
        {
            "percentileValue": 12,
            "dataValue": 49
        },
        {
            "percentileValue": 13,
            "dataValue": 50
        },
        {
            "percentileValue": 14,
            "dataValue": 52
        },
        {
            "percentileValue": 15,
            "dataValue": 54
        },
        {
            "percentileValue": 16,
            "dataValue": 57
        },
        {
            "percentileValue": 17,
            "dataValue": 63
        },
        {
            "percentileValue": 18,
            "dataValue": 65
        },
        {
            "percentileValue": 19,
            "dataValue": 67
        },
        {
            "percentileValue": 20,
            "dataValue": 68
        },
        {
            "percentileValue": 21,
            "dataValue": 68
        },
        {
            "percentileValue": 22,
            "dataValue": 72
        },
        {
            "percentileValue": 23,
            "dataValue": 81
        },
        {
            "percentileValue": 24,
            "dataValue": 83
        },
        {
            "percentileValue": 25,
            "dataValue": 85
        },
        {
            "percentileValue": 26,
            "dataValue": 89
        },
        {
            "percentileValue": 27,
            "dataValue": 96
        },
        {
            "percentileValue": 28,
            "dataValue": 99
        },
        {
            "percentileValue": 29,
            "dataValue": 101
        },
        {
            "percentileValue": 30,
            "dataValue": 103
        },
        {
            "percentileValue": 31,
            "dataValue": 104
        },
        {
            "percentileValue": 32,
            "dataValue": 106
        },
        {
            "percentileValue": 33,
            "dataValue": 110
        },
        {
            "percentileValue": 34,
            "dataValue": 113
        },
        {
            "percentileValue": 35,
            "dataValue": 115
        },
        {
            "percentileValue": 36,
            "dataValue": 115
        },
        {
            "percentileValue": 37,
            "dataValue": 119
        },
        {
            "percentileValue": 38,
            "dataValue": 125
        },
        {
            "percentileValue": 39,
            "dataValue": 129
        },
        {
            "percentileValue": 40,
            "dataValue": 134
        },
        {
            "percentileValue": 41,
            "dataValue": 137
        },
        {
            "percentileValue": 42,
            "dataValue": 140
        },
        {
            "percentileValue": 43,
            "dataValue": 142
        },
        {
            "percentileValue": 44,
            "dataValue": 143
        },
        {
            "percentileValue": 45,
            "dataValue": 145
        },
        {
            "percentileValue": 46,
            "dataValue": 153
        },
        {
            "percentileValue": 47,
            "dataValue": 154
        },
        {
            "percentileValue": 48,
            "dataValue": 156
        },
        {
            "percentileValue": 49,
            "dataValue": 160
        },
        {
            "percentileValue": 50,
            "dataValue": 165
        },
        {
            "percentileValue": 51,
            "dataValue": 176
        },
        {
            "percentileValue": 52,
            "dataValue": 179
        },
        {
            "percentileValue": 53,
            "dataValue": 183
        },
        {
            "percentileValue": 54,
            "dataValue": 194
        },
        {
            "percentileValue": 55,
            "dataValue": 199
        },
        {
            "percentileValue": 56,
            "dataValue": 207
        },
        {
            "percentileValue": 57,
            "dataValue": 209
        },
        {
            "percentileValue": 58,
            "dataValue": 210
        },
        {
            "percentileValue": 59,
            "dataValue": 210
        },
        {
            "percentileValue": 60,
            "dataValue": 211
        },
        {
            "percentileValue": 61,
            "dataValue": 211
        },
        {
            "percentileValue": 62,
            "dataValue": 211
        },
        {
            "percentileValue": 63,
            "dataValue": 217
        },
        {
            "percentileValue": 64,
            "dataValue": 221
        },
        {
            "percentileValue": 65,
            "dataValue": 225
        },
        {
            "percentileValue": 66,
            "dataValue": 227
        },
        {
            "percentileValue": 67,
            "dataValue": 229
        },
        {
            "percentileValue": 68,
            "dataValue": 232
        },
        {
            "percentileValue": 69,
            "dataValue": 235
        },
        {
            "percentileValue": 70,
            "dataValue": 237
        },
        {
            "percentileValue": 71,
            "dataValue": 248
        },
        {
            "percentileValue": 72,
            "dataValue": 267
        },
        {
            "percentileValue": 73,
            "dataValue": 274
        },
        {
            "percentileValue": 74,
            "dataValue": 276
        },
        {
            "percentileValue": 75,
            "dataValue": 285
        },
        {
            "percentileValue": 76,
            "dataValue": 301
        },
        {
            "percentileValue": 77,
            "dataValue": 302
        },
        {
            "percentileValue": 78,
            "dataValue": 306
        },
        {
            "percentileValue": 79,
            "dataValue": 323
        },
        {
            "percentileValue": 80,
            "dataValue": 329
        },
        {
            "percentileValue": 81,
            "dataValue": 346
        },
        {
            "percentileValue": 82,
            "dataValue": 362
        },
        {
            "percentileValue": 83,
            "dataValue": 373
        },
        {
            "percentileValue": 84,
            "dataValue": 378
        },
        {
            "percentileValue": 85,
            "dataValue": 384
        },
        {
            "percentileValue": 86,
            "dataValue": 386
        },
        {
            "percentileValue": 87,
            "dataValue": 392
        },
        {
            "percentileValue": 88,
            "dataValue": 394
        },
        {
            "percentileValue": 89,
            "dataValue": 400
        },
        {
            "percentileValue": 90,
            "dataValue": 416
        },
        {
            "percentileValue": 91,
            "dataValue": 416
        },
        {
            "percentileValue": 92,
            "dataValue": 416
        },
        {
            "percentileValue": 93,
            "dataValue": 429
        },
        {
            "percentileValue": 94,
            "dataValue": 465
        },
        {
            "percentileValue": 95,
            "dataValue": 518
        },
        {
            "percentileValue": 96,
            "dataValue": 555
        },
        {
            "percentileValue": 97,
            "dataValue": 595
        },
        {
            "percentileValue": 98,
            "dataValue": 696
        },
        {
            "percentileValue": 99,
            "dataValue": 718
        },
        {
            "percentileValue": 100,
            "dataValue": 1049
        }
    ];
    const portfolioIndustryStandarCohortsData: IndustryStandarCohorts[] = [
        {
            "label": "Elite Performers",
            "startValue": 1,
            "endValue": 85
        },
        {
            "label": "High Performers",
            "startValue": 86,
            "endValue": 165
        },
        {
            "label": "Medium Performers",
            "startValue": 166,
            "endValue": 285
        },
        {
            "label": "Low Performers",
            "startValue": 286,
            "endValue": 999999999999999
        }
    ];
    const teamIndustryStandardPercetileData: IndustryStandardPercentile[] = [
        {
            "percentileValue": 1,
            "dataValue": 1
        },
        {
            "percentileValue": 2,
            "dataValue": 3
        },
        {
            "percentileValue": 3,
            "dataValue": 4
        },
        {
            "percentileValue": 4,
            "dataValue": 6
        },
        {
            "percentileValue": 5,
            "dataValue": 7
        },
        {
            "percentileValue": 6,
            "dataValue": 8
        },
        {
            "percentileValue": 7,
            "dataValue": 8
        },
        {
            "percentileValue": 8,
            "dataValue": 8
        },
        {
            "percentileValue": 9,
            "dataValue": 9
        },
        {
            "percentileValue": 10,
            "dataValue": 9
        },
        {
            "percentileValue": 11,
            "dataValue": 9
        },
        {
            "percentileValue": 12,
            "dataValue": 9
        },
        {
            "percentileValue": 13,
            "dataValue": 9
        },
        {
            "percentileValue": 14,
            "dataValue": 9
        },
        {
            "percentileValue": 15,
            "dataValue": 10
        },
        {
            "percentileValue": 16,
            "dataValue": 11
        },
        {
            "percentileValue": 17,
            "dataValue": 11
        },
        {
            "percentileValue": 18,
            "dataValue": 11
        },
        {
            "percentileValue": 19,
            "dataValue": 11
        },
        {
            "percentileValue": 20,
            "dataValue": 12
        },
        {
            "percentileValue": 21,
            "dataValue": 12
        },
        {
            "percentileValue": 22,
            "dataValue": 12
        },
        {
            "percentileValue": 23,
            "dataValue": 12
        },
        {
            "percentileValue": 24,
            "dataValue": 13
        },
        {
            "percentileValue": 25,
            "dataValue": 13
        },
        {
            "percentileValue": 26,
            "dataValue": 13
        },
        {
            "percentileValue": 27,
            "dataValue": 13
        },
        {
            "percentileValue": 28,
            "dataValue": 14
        },
        {
            "percentileValue": 29,
            "dataValue": 14
        },
        {
            "percentileValue": 30,
            "dataValue": 14
        },
        {
            "percentileValue": 31,
            "dataValue": 14
        },
        {
            "percentileValue": 32,
            "dataValue": 14
        },
        {
            "percentileValue": 33,
            "dataValue": 15
        },
        {
            "percentileValue": 34,
            "dataValue": 15
        },
        {
            "percentileValue": 35,
            "dataValue": 15
        },
        {
            "percentileValue": 36,
            "dataValue": 15
        },
        {
            "percentileValue": 37,
            "dataValue": 15
        },
        {
            "percentileValue": 38,
            "dataValue": 16
        },
        {
            "percentileValue": 39,
            "dataValue": 17
        },
        {
            "percentileValue": 40,
            "dataValue": 17
        },
        {
            "percentileValue": 41,
            "dataValue": 17
        },
        {
            "percentileValue": 42,
            "dataValue": 18
        },
        {
            "percentileValue": 43,
            "dataValue": 18
        },
        {
            "percentileValue": 44,
            "dataValue": 19
        },
        {
            "percentileValue": 45,
            "dataValue": 20
        },
        {
            "percentileValue": 46,
            "dataValue": 21
        },
        {
            "percentileValue": 47,
            "dataValue": 21
        },
        {
            "percentileValue": 48,
            "dataValue": 21
        },
        {
            "percentileValue": 49,
            "dataValue": 22
        },
        {
            "percentileValue": 50,
            "dataValue": 22
        },
        {
            "percentileValue": 51,
            "dataValue": 22
        },
        {
            "percentileValue": 52,
            "dataValue": 25
        },
        {
            "percentileValue": 53,
            "dataValue": 26
        },
        {
            "percentileValue": 54,
            "dataValue": 27
        },
        {
            "percentileValue": 55,
            "dataValue": 28
        },
        {
            "percentileValue": 56,
            "dataValue": 31
        },
        {
            "percentileValue": 57,
            "dataValue": 32
        },
        {
            "percentileValue": 58,
            "dataValue": 33
        },
        {
            "percentileValue": 59,
            "dataValue": 33
        },
        {
            "percentileValue": 60,
            "dataValue": 36
        },
        {
            "percentileValue": 61,
            "dataValue": 36
        },
        {
            "percentileValue": 62,
            "dataValue": 37
        },
        {
            "percentileValue": 63,
            "dataValue": 39
        },
        {
            "percentileValue": 64,
            "dataValue": 39
        },
        {
            "percentileValue": 65,
            "dataValue": 40
        },
        {
            "percentileValue": 66,
            "dataValue": 42
        },
        {
            "percentileValue": 67,
            "dataValue": 42
        },
        {
            "percentileValue": 68,
            "dataValue": 44
        },
        {
            "percentileValue": 69,
            "dataValue": 45
        },
        {
            "percentileValue": 70,
            "dataValue": 47
        },
        {
            "percentileValue": 71,
            "dataValue": 50
        },
        {
            "percentileValue": 72,
            "dataValue": 51
        },
        {
            "percentileValue": 73,
            "dataValue": 52
        },
        {
            "percentileValue": 74,
            "dataValue": 54
        },
        {
            "percentileValue": 75,
            "dataValue": 56
        },
        {
            "percentileValue": 76,
            "dataValue": 56
        },
        {
            "percentileValue": 77,
            "dataValue": 57
        },
        {
            "percentileValue": 78,
            "dataValue": 59
        },
        {
            "percentileValue": 79,
            "dataValue": 63
        },
        {
            "percentileValue": 80,
            "dataValue": 68
        },
        {
            "percentileValue": 81,
            "dataValue": 70
        },
        {
            "percentileValue": 82,
            "dataValue": 74
        },
        {
            "percentileValue": 83,
            "dataValue": 85
        },
        {
            "percentileValue": 84,
            "dataValue": 88
        },
        {
            "percentileValue": 85,
            "dataValue": 95
        },
        {
            "percentileValue": 86,
            "dataValue": 98
        },
        {
            "percentileValue": 87,
            "dataValue": 105
        },
        {
            "percentileValue": 88,
            "dataValue": 116
        },
        {
            "percentileValue": 89,
            "dataValue": 118
        },
        {
            "percentileValue": 90,
            "dataValue": 126
        },
        {
            "percentileValue": 91,
            "dataValue": 130
        },
        {
            "percentileValue": 92,
            "dataValue": 132
        },
        {
            "percentileValue": 93,
            "dataValue": 153
        },
        {
            "percentileValue": 94,
            "dataValue": 169
        },
        {
            "percentileValue": 95,
            "dataValue": 196
        },
        {
            "percentileValue": 96,
            "dataValue": 234
        },
        {
            "percentileValue": 97,
            "dataValue": 351
        },
        {
            "percentileValue": 98,
            "dataValue": 425
        },
        {
            "percentileValue": 99,
            "dataValue": 712
        },
        {
            "percentileValue": 100,
            "dataValue": 1198
        }
    ];
    const teamIndustryStandardCohortsData: IndustryStandarCohorts[] = [
        {
            "label": "Elite Performers",
            "startValue": 1,
            "endValue": 13
        },
        {
            "label": "High Performers",
            "startValue": 14,
            "endValue": 22
        },
        {
            "label": "Medium Performers",
            "startValue": 23,
            "endValue": 56
        },
        {
            "label": "Low Performers",
            "startValue": 57,
            "endValue": 999999999999999
        }
    ];
    return {
        portfolioIndustryStandardPercentileData,
        portfolioIndustryStandarCohortsData,
        teamIndustryStandardPercetileData,
        teamIndustryStandardCohortsData,
    };
}

export function getIndustryStandardCustomerValue() {
    const industryStandardPercentileData: IndustryStandardPercentile[] = [
        {
            "percentileValue": 0,
            "dataValue": 13
        },
        {
            "percentileValue": 1,
            "dataValue": 13
        },
        {
            "percentileValue": 2,
            "dataValue": 13
        },
        {
            "percentileValue": 3,
            "dataValue": 13
        },
        {
            "percentileValue": 4,
            "dataValue": 13
        },
        {
            "percentileValue": 5,
            "dataValue": 13
        },
        {
            "percentileValue": 6,
            "dataValue": 13
        },
        {
            "percentileValue": 7,
            "dataValue": 13
        },
        {
            "percentileValue": 8,
            "dataValue": 13
        },
        {
            "percentileValue": 9,
            "dataValue": 13
        },
        {
            "percentileValue": 10,
            "dataValue": 16
        },
        {
            "percentileValue": 11,
            "dataValue": 16
        },
        {
            "percentileValue": 12,
            "dataValue": 16
        },
        {
            "percentileValue": 13,
            "dataValue": 16
        },
        {
            "percentileValue": 14,
            "dataValue": 16
        },
        {
            "percentileValue": 15,
            "dataValue": 16
        },
        {
            "percentileValue": 16,
            "dataValue": 16
        },
        {
            "percentileValue": 17,
            "dataValue": 16
        },
        {
            "percentileValue": 18,
            "dataValue": 16
        },
        {
            "percentileValue": 19,
            "dataValue": 16
        },
        {
            "percentileValue": 20,
            "dataValue": 18
        },
        {
            "percentileValue": 21,
            "dataValue": 18
        },
        {
            "percentileValue": 22,
            "dataValue": 18
        },
        {
            "percentileValue": 23,
            "dataValue": 18
        },
        {
            "percentileValue": 24,
            "dataValue": 18
        },
        {
            "percentileValue": 25,
            "dataValue": 18
        },
        {
            "percentileValue": 26,
            "dataValue": 18
        },
        {
            "percentileValue": 27,
            "dataValue": 18
        },
        {
            "percentileValue": 28,
            "dataValue": 18
        },
        {
            "percentileValue": 29,
            "dataValue": 18
        },
        {
            "percentileValue": 30,
            "dataValue": 24
        },
        {
            "percentileValue": 31,
            "dataValue": 24
        },
        {
            "percentileValue": 32,
            "dataValue": 24
        },
        {
            "percentileValue": 33,
            "dataValue": 24
        },
        {
            "percentileValue": 34,
            "dataValue": 24
        },
        {
            "percentileValue": 35,
            "dataValue": 24
        },
        {
            "percentileValue": 36,
            "dataValue": 24
        },
        {
            "percentileValue": 37,
            "dataValue": 24
        },
        {
            "percentileValue": 38,
            "dataValue": 24
        },
        {
            "percentileValue": 39,
            "dataValue": 24
        },
        {
            "percentileValue": 40,
            "dataValue": 34
        },
        {
            "percentileValue": 41,
            "dataValue": 34
        },
        {
            "percentileValue": 42,
            "dataValue": 34
        },
        {
            "percentileValue": 43,
            "dataValue": 34
        },
        {
            "percentileValue": 44,
            "dataValue": 34
        },
        {
            "percentileValue": 45,
            "dataValue": 34
        },
        {
            "percentileValue": 46,
            "dataValue": 34
        },
        {
            "percentileValue": 47,
            "dataValue": 34
        },
        {
            "percentileValue": 48,
            "dataValue": 34
        },
        {
            "percentileValue": 49,
            "dataValue": 34
        },
        {
            "percentileValue": 50,
            "dataValue": 42
        },
        {
            "percentileValue": 51,
            "dataValue": 42
        },
        {
            "percentileValue": 52,
            "dataValue": 42
        },
        {
            "percentileValue": 53,
            "dataValue": 42
        },
        {
            "percentileValue": 54,
            "dataValue": 42
        },
        {
            "percentileValue": 55,
            "dataValue": 42
        },
        {
            "percentileValue": 56,
            "dataValue": 42
        },
        {
            "percentileValue": 57,
            "dataValue": 42
        },
        {
            "percentileValue": 58,
            "dataValue": 42
        },
        {
            "percentileValue": 59,
            "dataValue": 42
        },
        {
            "percentileValue": 60,
            "dataValue": 53
        },
        {
            "percentileValue": 61,
            "dataValue": 53
        },
        {
            "percentileValue": 62,
            "dataValue": 53
        },
        {
            "percentileValue": 63,
            "dataValue": 53
        },
        {
            "percentileValue": 64,
            "dataValue": 53
        },
        {
            "percentileValue": 65,
            "dataValue": 53
        },
        {
            "percentileValue": 66,
            "dataValue": 53
        },
        {
            "percentileValue": 67,
            "dataValue": 53
        },
        {
            "percentileValue": 68,
            "dataValue": 53
        },
        {
            "percentileValue": 69,
            "dataValue": 53
        },
        {
            "percentileValue": 70,
            "dataValue": 63
        },
        {
            "percentileValue": 71,
            "dataValue": 63
        },
        {
            "percentileValue": 72,
            "dataValue": 63
        },
        {
            "percentileValue": 73,
            "dataValue": 63
        },
        {
            "percentileValue": 74,
            "dataValue": 63
        },
        {
            "percentileValue": 75,
            "dataValue": 63
        },
        {
            "percentileValue": 76,
            "dataValue": 63
        },
        {
            "percentileValue": 77,
            "dataValue": 63
        },
        {
            "percentileValue": 78,
            "dataValue": 63
        },
        {
            "percentileValue": 79,
            "dataValue": 63
        },
        {
            "percentileValue": 80,
            "dataValue": 77
        },
        {
            "percentileValue": 81,
            "dataValue": 77
        },
        {
            "percentileValue": 82,
            "dataValue": 77
        },
        {
            "percentileValue": 83,
            "dataValue": 77
        },
        {
            "percentileValue": 84,
            "dataValue": 77
        },
        {
            "percentileValue": 85,
            "dataValue": 77
        },
        {
            "percentileValue": 86,
            "dataValue": 77
        },
        {
            "percentileValue": 87,
            "dataValue": 77
        },
        {
            "percentileValue": 88,
            "dataValue": 77
        },
        {
            "percentileValue": 89,
            "dataValue": 77
        },
        {
            "percentileValue": 90,
            "dataValue": 89
        },
        {
            "percentileValue": 91,
            "dataValue": 89
        },
        {
            "percentileValue": 92,
            "dataValue": 89
        },
        {
            "percentileValue": 93,
            "dataValue": 89
        },
        {
            "percentileValue": 94,
            "dataValue": 89
        },
        {
            "percentileValue": 95,
            "dataValue": 89
        },
        {
            "percentileValue": 96,
            "dataValue": 89
        },
        {
            "percentileValue": 97,
            "dataValue": 89
        },
        {
            "percentileValue": 98,
            "dataValue": 89
        },
        {
            "percentileValue": 99,
            "dataValue": 89
        },
        {
            "percentileValue": 100,
            "dataValue": 100
        }
    ];
    const industryStandarCohortsData: IndustryStandarCohorts[] = [
        {
            "label": "Low Performers",
            "startValue": 0,
            "endValue": 36
        },
        {
            "label": "Medium Performers",
            "startValue": 37,
            "endValue": 63
        },
        {
            "label": "High Performers",
            "startValue": 64,
            "endValue": 83
        },
        {
            "label": "Elite Performers",
            "startValue": 84,
            "endValue": 999999999999999
        }
    ];

    return {
        industryStandardPercentileData,
        industryStandarCohortsData
    };
}

export function getIndustryStandardFlowEfficiency() {
    const industryStandardPercentileData: IndustryStandardPercentile[] = [
        {
            "percentileValue": 0,
            "dataValue": 17
        },
        {
            "percentileValue": 1,
            "dataValue": 20
        },
        {
            "percentileValue": 2,
            "dataValue": 21
        },
        {
            "percentileValue": 3,
            "dataValue": 21
        },
        {
            "percentileValue": 4,
            "dataValue": 21
        },
        {
            "percentileValue": 5,
            "dataValue": 26
        },
        {
            "percentileValue": 6,
            "dataValue": 27
        },
        {
            "percentileValue": 7,
            "dataValue": 27
        },
        {
            "percentileValue": 8,
            "dataValue": 28
        },
        {
            "percentileValue": 9,
            "dataValue": 29
        },
        {
            "percentileValue": 10,
            "dataValue": 30
        },
        {
            "percentileValue": 11,
            "dataValue": 30
        },
        {
            "percentileValue": 12,
            "dataValue": 33
        },
        {
            "percentileValue": 13,
            "dataValue": 33
        },
        {
            "percentileValue": 14,
            "dataValue": 34
        },
        {
            "percentileValue": 15,
            "dataValue": 34
        },
        {
            "percentileValue": 16,
            "dataValue": 34
        },
        {
            "percentileValue": 17,
            "dataValue": 35
        },
        {
            "percentileValue": 18,
            "dataValue": 36
        },
        {
            "percentileValue": 19,
            "dataValue": 37
        },
        {
            "percentileValue": 20,
            "dataValue": 38
        },
        {
            "percentileValue": 21,
            "dataValue": 39
        },
        {
            "percentileValue": 22,
            "dataValue": 43
        },
        {
            "percentileValue": 23,
            "dataValue": 46
        },
        {
            "percentileValue": 24,
            "dataValue": 49
        },
        {
            "percentileValue": 25,
            "dataValue": 51
        },
        {
            "percentileValue": 26,
            "dataValue": 53
        },
        {
            "percentileValue": 27,
            "dataValue": 55
        },
        {
            "percentileValue": 28,
            "dataValue": 56
        },
        {
            "percentileValue": 29,
            "dataValue": 57
        },
        {
            "percentileValue": 30,
            "dataValue": 58
        },
        {
            "percentileValue": 31,
            "dataValue": 63
        },
        {
            "percentileValue": 32,
            "dataValue": 64
        },
        {
            "percentileValue": 33,
            "dataValue": 66
        },
        {
            "percentileValue": 34,
            "dataValue": 67
        },
        {
            "percentileValue": 35,
            "dataValue": 68
        },
        {
            "percentileValue": 36,
            "dataValue": 68
        },
        {
            "percentileValue": 37,
            "dataValue": 69
        },
        {
            "percentileValue": 38,
            "dataValue": 72
        },
        {
            "percentileValue": 39,
            "dataValue": 73
        },
        {
            "percentileValue": 40,
            "dataValue": 74
        },
        {
            "percentileValue": 41,
            "dataValue": 74
        },
        {
            "percentileValue": 42,
            "dataValue": 75
        },
        {
            "percentileValue": 43,
            "dataValue": 75
        },
        {
            "percentileValue": 44,
            "dataValue": 76
        },
        {
            "percentileValue": 45,
            "dataValue": 76
        },
        {
            "percentileValue": 46,
            "dataValue": 77
        },
        {
            "percentileValue": 47,
            "dataValue": 78
        },
        {
            "percentileValue": 48,
            "dataValue": 82
        },
        {
            "percentileValue": 49,
            "dataValue": 83
        },
        {
            "percentileValue": 50,
            "dataValue": 83
        },
        {
            "percentileValue": 51,
            "dataValue": 85
        },
        {
            "percentileValue": 52,
            "dataValue": 85
        },
        {
            "percentileValue": 53,
            "dataValue": 85
        },
        {
            "percentileValue": 54,
            "dataValue": 88
        },
        {
            "percentileValue": 55,
            "dataValue": 88
        },
        {
            "percentileValue": 56,
            "dataValue": 89
        },
        {
            "percentileValue": 57,
            "dataValue": 89
        },
        {
            "percentileValue": 58,
            "dataValue": 90
        },
        {
            "percentileValue": 59,
            "dataValue": 91
        },
        {
            "percentileValue": 60,
            "dataValue": 92
        },
        {
            "percentileValue": 61,
            "dataValue": 93
        },
        {
            "percentileValue": 62,
            "dataValue": 93
        },
        {
            "percentileValue": 63,
            "dataValue": 93
        },
        {
            "percentileValue": 64,
            "dataValue": 93
        },
        {
            "percentileValue": 65,
            "dataValue": 93
        },
        {
            "percentileValue": 66,
            "dataValue": 94
        },
        {
            "percentileValue": 67,
            "dataValue": 94
        },
        {
            "percentileValue": 68,
            "dataValue": 94
        },
        {
            "percentileValue": 69,
            "dataValue": 94
        },
        {
            "percentileValue": 70,
            "dataValue": 94
        },
        {
            "percentileValue": 71,
            "dataValue": 94
        },
        {
            "percentileValue": 72,
            "dataValue": 94
        },
        {
            "percentileValue": 73,
            "dataValue": 94
        },
        {
            "percentileValue": 74,
            "dataValue": 96
        },
        {
            "percentileValue": 75,
            "dataValue": 96
        },
        {
            "percentileValue": 76,
            "dataValue": 97
        },
        {
            "percentileValue": 77,
            "dataValue": 97
        },
        {
            "percentileValue": 78,
            "dataValue": 98
        },
        {
            "percentileValue": 79,
            "dataValue": 98
        },
        {
            "percentileValue": 80,
            "dataValue": 98
        },
        {
            "percentileValue": 81,
            "dataValue": 98
        },
        {
            "percentileValue": 82,
            "dataValue": 98
        },
        {
            "percentileValue": 83,
            "dataValue": 98
        },
        {
            "percentileValue": 84,
            "dataValue": 98
        },
        {
            "percentileValue": 85,
            "dataValue": 98
        },
        {
            "percentileValue": 86,
            "dataValue": 98
        },
        {
            "percentileValue": 87,
            "dataValue": 98
        },
        {
            "percentileValue": 88,
            "dataValue": 98
        },
        {
            "percentileValue": 89,
            "dataValue": 98
        },
        {
            "percentileValue": 90,
            "dataValue": 98
        },
        {
            "percentileValue": 91,
            "dataValue": 98
        },
        {
            "percentileValue": 92,
            "dataValue": 98
        },
        {
            "percentileValue": 93,
            "dataValue": 99
        },
        {
            "percentileValue": 94,
            "dataValue": 99
        },
        {
            "percentileValue": 95,
            "dataValue": 99
        },
        {
            "percentileValue": 96,
            "dataValue": 99
        },
        {
            "percentileValue": 97,
            "dataValue": 99
        },
        {
            "percentileValue": 98,
            "dataValue": 99
        },
        {
            "percentileValue": 99,
            "dataValue": 100
        },
        {
            "percentileValue": 100,
            "dataValue": 100
        }
    ];
    const industryStandarCohortsData: IndustryStandarCohorts[] = [
        {
            "label": "Low Performers",
            "startValue": 0,
            "endValue": 5
        },
        {
            "label": "Medium Performers",
            "startValue": 6,
            "endValue": 25
        },
        {
            "label": "High Performers",
            "startValue": 26,
            "endValue": 43
        },
        {
            "label": "Elite Performers",
            "startValue": 44,
            "endValue": 999999999999999
        }
    ];

    return {
        industryStandardPercentileData,
        industryStandarCohortsData
    };
}
