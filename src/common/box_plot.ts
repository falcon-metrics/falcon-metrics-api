export type IBoxPlot = {
    median: number;
    quartile1st: number;
    quartile3rd: number;
    interQuartileRange: number;
    lowerWhisker: number;
    upperWhisker: number;
    lowerOutliers: Array<number>;
    upperOutliers: Array<number>;
};
