import { Sequelize } from 'sequelize';
import { SecurityContext } from '../../../common/security';
import { DeliveryRatePrecision } from '../types/types';
import { IForecastingSettingsDB } from './forecastingSettings_db';
import {
    ForecastingSettingsData,
    TeamPerformanceLevels,
    WorkItemLevelNameMap,
    workExpansionLevels,
    Assumptions,
    ForecastingSettingValue,
} from './types';


export const DefaultForecastingSettings: ForecastingSettingValue = {
    teamPerformancePercentage: 100,
    workExpansionPercentage: 150,
    forecastIndividualContributor: false,
    forecastPortfolio: false,
    forecastTeam: true,
    predictiveAnalysisPrecision: DeliveryRatePrecision.DAY
} as any;

export interface IForecastingSettings {
    getForecastingSettingsData(
        roomId: string,
    ): Promise<ForecastingSettingsData>;
    getAssumptions(data: ForecastingSettingsData): Assumptions;
}

export class ForecastingSettings implements IForecastingSettings {
    readonly orgId: string;
    readonly forecastingSettingDb: IForecastingSettingsDB;
    constructor(opts: {
        security: SecurityContext;
        forecastingSettingsDb: IForecastingSettingsDB;
        auroraWriter: Sequelize;
    }) {
        if (!opts?.security?.organisation) throw Error('Cannot find orgId');
        this.orgId = opts?.security?.organisation;
        this.forecastingSettingDb = opts.forecastingSettingsDb;
    }
    async getForecastingSettingsData(
        roomId: string,
    ): Promise<ForecastingSettingsData> {
        let forecastingSettingsItem = await this.forecastingSettingDb.getForecastingSettings(
            this.orgId,
            roomId,
        );
        if (!forecastingSettingsItem) {
            forecastingSettingsItem = {
                orgId: this.orgId,
                roomId,
                ...DefaultForecastingSettings
            };
        }
        const contextCapacity = await this.forecastingSettingDb.getAllForecastingSettingContextCapacity(
            this.orgId,
            roomId,
        );
        return {
            ...forecastingSettingsItem,
            contextCapacity,
        };
    }
    async createOrUpdateSettingsData(
        newSettingsData: ForecastingSettingsData,
    ): Promise<ForecastingSettingsData> {
        return await this.forecastingSettingDb.createOrUpdateForecastingSettingsData(
            this.orgId,
            newSettingsData,
        );
    }
    public getAssumptions(data: ForecastingSettingsData): Assumptions {
        const teamPerformanceDisplay = (data: ForecastingSettingsData) => {
            const teamPerformanceValue = data.teamPerformancePercentage;
            if (
                (teamPerformanceValue && teamPerformanceValue === 100) ||
                !teamPerformanceValue //so return default
            )
                return 'Team performance remains at the current rate';
            const teamPerformanceText = TeamPerformanceLevels.find(
                (level) => level.value === teamPerformanceValue,
            )?.text;

            return `Team performance is 
            ${teamPerformanceText && teamPerformanceValue ?
                    `${teamPerformanceText?.toLowerCase()} (${teamPerformanceValue}%)`
                    : 'unchanged'
                }`;
        };

        const workItemLevelDisplay = (data: ForecastingSettingsData) => {
            let {
                forecastTeam,
                forecastPortfolio,
                forecastIndividualContributor,
            } = data;
            ////When settings is never set up
            if (
                forecastTeam === undefined &&
                forecastPortfolio === undefined &&
                forecastIndividualContributor === undefined
            ) {
                forecastTeam = true;
                forecastPortfolio = true;
                forecastIndividualContributor = true;
            }
            const levelChecks = {
                portfolio: {
                    included: forecastPortfolio,
                },
                team: {
                    included: forecastTeam,
                },
                individualContributor: {
                    included: forecastIndividualContributor,
                },
            };
            const displayText = ['Accounting for items at the'];
            let includedLevelCount = 0;
            Object.keys(levelChecks).forEach((level) => {
                if (
                    levelChecks[
                        level as 'portfolio' | 'team' | 'individualContributor'
                    ]?.included === true
                ) {
                    if (includedLevelCount >= 1) {
                        const length = displayText.length;
                        displayText[length - 1] = displayText[length - 1] + ',';
                    }
                    includedLevelCount += 1;
                    displayText.push(WorkItemLevelNameMap[level]?.display);
                }
            });
            displayText.push(includedLevelCount > 1 ? 'levels' : 'level only');

            return displayText.join(' ');
        };
        const workExpansionDisplay = (
            data: ForecastingSettingsData,
        ): string => {
            const workExpansionLevel = workExpansionLevels.find(
                (level) => level.value === data.workExpansionPercentage,
            );
            const defaultText = workExpansionLevels[0].display;
            const displayText: string[] = [
                `The scope is ${workExpansionLevel?.display.toLowerCase() ?? defaultText}`,
            ];

            return displayText.join(' ');
        };
        const checkFullFocus = (data: ForecastingSettingsData) => {
            const fullFocus: boolean = data.contextCapacity.every(
                (context) => context.capacityPercentage >= 100,
            );
            if (!fullFocus)
                return 'Some of the participant teams are not fully focused on this initiative';
            else if (
                data.contextCapacity.some(
                    (context) => context.capacityPercentage >= 100,
                )
            )
                return 'Some teams are not fully dedicated to this initiative';
            else return 'No teams are fully dedicated to this initiative.';
        };
        const precision = (data: ForecastingSettingValue) => {
            let precisionLevel = 'Daily';
            if (data.predictiveAnalysisPrecision === DeliveryRatePrecision.WEEK) {
                precisionLevel = 'Weekly';
            }
            return `The precision is set to ${precisionLevel}`;
        };
        return {
            teamPerformance: teamPerformanceDisplay(data),
            workExpansion: workExpansionDisplay(data),
            workItemLevel: workItemLevelDisplay(data),
            fullFocus: checkFullFocus(data),
            precision: precision(data),
        };
    }
}
