import { Selection } from "./datastructure/Selection";
import { CharagraphBase, MatchIdentifier } from "./CharagraphModel";
import { makeAutoObservable, observable } from "mobx";


export class CompoundCharagraphModel implements CharagraphBase {
    charagraphs : CharagraphBase[]
    _merge = observable.box(true); // By default, charagraphs are all merged into the same visualization

    constructor(charagraphs : CharagraphBase[], merged = true) {
        this.charagraphs = charagraphs;
        this._merge.set(merged);
        makeAutoObservable(this);
    }
    get sorting(): string {
        return this.charagraphs[0].sorting;
    }
    setSorting(sorting: string) {
        //throw new Error("Method not implemented.");
    }
    get x(): number {
        return this.charagraphs[0].x;
    }
    get y(): number {
        return this.charagraphs[0].y;
    }
    get width(): number {
        return this.charagraphs[0].width;
    }
    get height(): number {
        return this.charagraphs[0].height;
    }
    setPosition(x: number, y: number) {
        return this.charagraphs[0].setPosition(x, y);
    }
    setSize(width: number, height: number) {
        return this.charagraphs[0].setSize(width, height);
    }
    get anchoredValues(): MatchIdentifier[] {
        return this.charagraphs.map(c => c.anchoredValues).flat();
    }

    setSelection(selection: Selection, componentIndex?: number) {
        this.charagraphs[componentIndex].setSelection(selection);
    }

    setErrorBarMatches(matches: Selection[], componentIndex?: number) {
        this.charagraphs[componentIndex].setErrorBarMatches(matches);
    }

    setCategoryValue(index: number, value: string, componentIndex = 0) {
        if (this._merge) {
            // The chart is stacked, then the edit should be for all charts...
            for (const charagraph of this.charagraphs) {
                charagraph.setCategoryValue(index, value);
            }
        } else {
            this.charagraphs[componentIndex].setCategoryValue(index, value);
        }
    }

    setMinValue(min: number) {
        throw new Error("Method not implemented.");
    }

    get min() : number {
        return 0;
    }

    get horizontal(): boolean {
        return this.charagraphs[0].horizontal;
    }
    setHorizontal(horizontal: boolean) {
        for (const charagraph of this.charagraphs) { charagraph.setHorizontal(horizontal) }
    }
    get splitRegexp(): string {
        throw new Error("Method not implemented.");
    }

    get isMerged() {
        return this._merge.get()
    }

    setIsMerged(merged : boolean) {
        this._merge.set(merged);
    }

    setSplitRegexp(regexp: string): void {
        throw new Error("Method not implemented.");
    }
    get selectedSentence(): Selection {
        // TODO: Merge the sentence from all the charagraphs
        for (const charagraph of this.charagraphs) {
            if (charagraph.selectedSentence) {
                return charagraph.selectedSentence;
            }
        }
        return null;
    }

    get subCharagraphs() : CharagraphBase[] {
        return this.charagraphs;
    }

    setSubCharagraphs(charagraphs : CharagraphBase[]) {
        (this.charagraphs as any).replace(charagraphs);
    }

    // Most of those do nothing simply because they do not mean anything for a CompoundCharagraph
    get name(): string {
        return "";
    }
    setName(name: string, componentIndex?: number) {
        this.charagraphs[componentIndex].setName(name);
    }

    getMatches(): Selection[] {
        return this.charagraphs.map(c => c.getMatches()).flat();
    }
    setMatches(matches: Selection[]) {
    }
    get type(): string {
        return "compound";
    }
    setChartType(type: string) {
    }
    
    setEmphasizedValues(values: MatchIdentifier[]) {
        for (const charagraph of this.charagraphs) { charagraph.setEmphasizedValues(values) };
    }
    setAnchoredValues(values: MatchIdentifier[]) {
        for (const charagraph of this.charagraphs) { charagraph.setAnchoredValues(values) };
    }

    get selection() : Selection {
        return this.charagraphs[0].selection;
    }

    get values() {
        return this.charagraphs.map(v => {return v.values}).flat();
    }

    setCurrentPosition(index: number, x = -1, y = -1) {
        for (const charagraph of this.charagraphs) {
            charagraph.setCurrentPosition(index, x, y);
        }
    }

    mergeAxes(axis1 : any, axis2 : any) : any {
        // We only try to merge the data. Rest is just copied as is from the axis1
        if (axis1.type === "value") {
            return {...axis1, min: Math.min(axis1.min, axis2.min), max: Math.max(axis1.max, axis2.max)};
        }

        if (axis1.data.length >= axis2.data.length) {
            return axis1;
        }

        // Actually do the merge
        const mergedData = new Array(...(new Set(axis1.data.concat(axis2.data)))); // Put it in a set to remove duplicates
        (mergedData as number[]).sort((a, b) => a - b);

        return {...axis1, data: mergedData};
    }

    echartOptions() {
        /*let visibleCharagraphs = this.charagraphs.filter(c => {return c.selectedSentence !== null});
        if (visibleCharagraphs.length === 0) visibleCharagraphs = this.charagraphs;*/
        const visibleCharagraphs = this.charagraphs;
        const ngrids = this._merge.get() ? 1 : visibleCharagraphs.length;

        const layouts = [
            // 1 element
            [{ top: 20, right: 1, bottom: 0, left: 0, containLabel: true }],

            // 2 elements
            [{ left: 0, right: 1, top: 8, height: '48%', containLabel: true },
            { left: 0, right: 1, bottom: 0, height: '48%', containLabel: true }],

            // 3 elements
            [{ left: 0, top: 8, width: '48%', height: '48%', containLabel: true },
            { right: 1, top: 8, width: '48%', height: '48%', containLabel: true },
            { left: 0, bottom: 0, width: '48%', height: '48%', containLabel: true }],

            // 4 elements
            [{ left: 0, top: 8, width: '48%', height: '48%', containLabel: true },
            { right: 1, top: 8, width: '48%', height: '48%', containLabel: true },
            { left: 0, bottom: 0, width: '48%', height: '48%', containLabel: true },
            { right: 1, bottom: 0, width: '48%', height: '48%', containLabel: true }]
        ];


        const series = [];
        const xAxis = [];
        const yAxis = [];
        const colors = [];
        for (let i = 0; i < visibleCharagraphs.length; ++i) {
            const charagraphOptions = visibleCharagraphs[i].echartOptions();
            const charagraphSeries = charagraphOptions.series;
            
            for (const cseries of charagraphSeries) {
                series.push({...cseries, xAxisIndex: Math.min(i, ngrids-1), yAxisIndex: Math.min(i, ngrids-1)})
                colors.push(charagraphOptions.color? charagraphOptions.color : charagraphOptions.legend.itemStyle.color);
            }

            // Merge the different axes if necessary, otherwise just concatenate them
            if (this._merge.get()) {
                if (xAxis.length === 0) {
                    xAxis.push({...charagraphOptions.xAxis[0], gridIndex: 0});
                    yAxis.push({...charagraphOptions.yAxis[0], gridIndex: 0});
                } else {
                    // Do the merge of the values
                    if (xAxis[0].type === charagraphOptions.xAxis[0].type) {
                        xAxis[0] = this.mergeAxes(xAxis[0], charagraphOptions.xAxis[0]);
                    } else {
                        console.log("Unable to merge axis, the two axis are incompatible");
                    }

                    if (yAxis[0].type === charagraphOptions.yAxis[0].type) {
                        yAxis[0] = this.mergeAxes(yAxis[0], charagraphOptions.yAxis[0]);
                    } else {
                        console.log("Unable to merge axis, the two axis are incompatible");
                    }
                }
            } else {
                xAxis.push({...charagraphOptions.xAxis[0], gridIndex: Math.min(i, ngrids-1)});
                yAxis.push({...charagraphOptions.yAxis[0], gridIndex: Math.min(i, ngrids-1)});
            }
        }

        // TODO: Support for different layouts
        return {
            animationDurationUpdate: 200,
            grid:layouts[ngrids-1],
            yAxis: yAxis,
            xAxis: xAxis, // We make sure Y axis stays always the same by using the max value
            tooltip: { 
                trigger: 'item',
                axisPointer: {type: "shadow"}
         },
            series: series,
            legend: {show: true, selectedMode: false},
            color: colors
        };
    }
}