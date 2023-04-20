import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { observer } from "mobx-react-lite"
import ReactECharts from 'echarts-for-react';
import { CharagraphBase } from '../logic/CharagraphModel';
import { CharagraphOverlay } from './CharagraphOverlay';

/**
 * Show the visualization associated with a Charagraph
 */
// eslint-disable-next-line react/display-name
export const CharagraphVisualization = observer(forwardRef(({ charagraph, width, height} : { charagraph: CharagraphBase, width: number, height : number}, ref) => {
    const echartRef = useRef(null);

    function getElementAtPosition(x : number, y : number) {
        const echart = echartRef.current.getEchartsInstance();
        const brect = echart.getDom().getBoundingClientRect();
        x -= brect.x;
        y -= brect.y;
        if (echart._chartsViews) {
            for (const chartView of echart._chartsViews) {
                if (chartView.group && chartView.group._children) {
                    for (const child of chartView.group._children) {
                        if (child.contain) {
                            if (child.contain(x, y)) {
                                return child;
                            }
                        }
                    }
                }
            }
        }
        return null;
    }



    useImperativeHandle(ref, () => ({
        /**
         * Returns the element at the specific pixel coordinate (screen coordinate)
         * Uses undocumented APIs, might break with new versions of echarts
         * @param x 
         * @param y 
         * @returns 
         */
        getElementAtPosition
    }));

    const echartOptions = charagraph.echartOptions();

    return (
        <>
            {charagraph !== null && 
                <CharagraphOverlay echartRef={echartRef} charagraph={charagraph} width={width} height={height}>
                    <ReactECharts notMerge={true} ref={echartRef} style={{ width: width, height: height }} option={echartOptions}/>
                </CharagraphOverlay>
            }
        </>
    );
}))