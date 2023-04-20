import { makeAutoObservable, observable, observe, toJS } from "mobx";
import { Selection } from "./datastructure/Selection";
import { EChartsOption } from "echarts-for-react";
import chroma from "chroma-js";

export interface CharagraphValue {
    match: Selection; // Corresponding match in text
    color: string;
    visibleInText: boolean;
    visibleInChart: boolean;
    emphasised: boolean;
    isErrorBar: boolean;
    dataIndex: number;
    selected : boolean;
}

export interface ColorPalette {
    weak: string;
    medium: string;
    strong: string;
}

export interface MatchIdentifier {
    start: number;
    end: number;
}

export interface CharagraphBase {
    get x() : number;
    get y() : number;
    get width() : number;
    get height() : number;

    get sorting() : string;

    setPosition(x : number, y : number);
    setSize(width : number, height : number);

    get selection(): Selection;
    get selectedSentence(): Selection;
    get values(): CharagraphValue[];
    get type(): string;
    get name(): string;
    get min(): number;
    get splitRegexp(): string;
    get horizontal(): boolean;
    get anchoredValues() : MatchIdentifier[];
    setSelection(selection : Selection, componentIndex?: number)
    setSplitRegexp(regexp: string): void;
    getMatches(): Selection[];
    setChartType(type: string);
    setSorting(sorting : string);
    echartOptions(): EChartsOption;
    setMatches(matches: Selection[]);
    setErrorBarMatches(matches : Selection[], componentIndex?: number);
    setCurrentPosition(index: number, x: number, y: number);
    setEmphasizedValues(values: MatchIdentifier[]);
    setAnchoredValues(values: MatchIdentifier[]);
    setName(name: string, componentIndex?: number);
    setHorizontal(horizontal: boolean)
    setMinValue(min: number);
    setCategoryValue(index: number, value: string, componentIndex?: number);
}

// Create the color theme
const echarts_colors = [
    "#5470c6",
    "#91cc75",
    "#fac858",
    "#ee6666",
    "#73c0de",
    "#3ba272",
    "#fc8452",
    "#9a60b4",
    "#ea7ccc"
]

const colorThemes: ColorPalette[] = [];

for (const color of echarts_colors) {
    colorThemes.push({ weak: chroma(color).desaturate(2).hex(), medium: color, strong: chroma(color).saturate(2).hex() })
}

let counter = 0;

export class CharagraphModel implements CharagraphBase {
    selection: Selection = null;
    _splitRegexp = observable.box("(?<=[^A-Z].[.?]) +(?=[A-Z])");
    _selectedSentence: Selection = null;
    _matches: Selection[] = [];
    _errorBarMatches : Selection[] = [];
    currentIndex = observable.box(-1);
    previousIndex: number;
    sentences: Selection[];
    values: CharagraphValue[] = [];
    hoveredValuesIds: MatchIdentifier[] = [];
    selectedValuesIds: MatchIdentifier[] = [];
    defaultType = observable.box("bar");
    _type = observable.box("bar");
    colorTheme: ColorPalette;
    _name = observable.box("series"+counter);
    _horizontal = observable.box(false);
    _minVal = observable.box(0);
    _categories: string[] = [];
    _sorting = observable.box("none");

    _x = observable.box(0);
    _y = observable.box(0);
    _width = observable.box(0);
    _height = observable.box(0);

    constructor(selection: Selection = null, x = 0, y = 0, width = 240, height = 200) {
        this.setSelection(selection);
        this.colorTheme = colorThemes[(counter) % colorThemes.length];
        counter++;
        makeAutoObservable(this);

        this._x.set(x);
        this._y.set(y);
        this._width.set(width);
        this._height.set(height);

        observe(this.currentIndex, this.updateSpecification.bind(this, false));
        observe(this._matches, this.updateSpecification.bind(this, true));
        observe(this._errorBarMatches, this.updateSpecification.bind(this, true));
        observe(this.selectedValuesIds, this.updateSpecification.bind(this, true));
        observe(this.hoveredValuesIds, this.updateSpecification.bind(this, true));
        observe(this.defaultType, this.updateSpecification.bind(this, true));
    }
    get sorting(): string {
        return this._sorting.get();
    }
    setSorting(sorting: string) {
        this._sorting.set(sorting);
    }
    get x(): number {
        return this._x.get();
    }
    get y(): number {
        return this._y.get();
    }
    get width(): number {
        return this._width.get();
    }
    get height(): number {
        return this._height.get();
    }
    setPosition(x: number, y: number) {
        this._x.set(x);
        this._y.set(y);
    }
    setSize(width: number, height: number) {
        this._width.set(width);
        this._height.set(height);
    }
    get anchoredValues(): MatchIdentifier[] {
        return this.selectedValuesIds;
    }

    setErrorBarMatches(matches: Selection[], componentIndex?: number) {
        (this._errorBarMatches as any).replace(matches);
    }

    setCategoryValue(index: number, value: string) {
        const order = this.order; // Should consider the specific order
        for (let i = this._categories.length; i < index; ++i) {
            this._categories.push("" + (order[i]+1));
        }
        this._categories[order[index]] = value;
    }

    setMinValue(min: number) {
        this._minVal.set(min);
    }
    get horizontal(): boolean {
        return this._horizontal.get();
    }
    setHorizontal(horizontal: boolean) {
        this._horizontal.set(horizontal);
    }

    get splitRegexp(): string {
        return this._splitRegexp.get();
    }
    setSplitRegexp(regexp: string): void {
        this._splitRegexp.set(regexp);
        this.sentences = this.extractSentences(this.selection);
        this.updateSpecification(true);
    }
    get name(): string {
        return this._name.get();
    }
    setName(name: string) {
        this._name.set(name);
    }

    setSelection(selection: Selection) {
        if (selection !== null) {
            this.selection = selection;
            this.sentences = this.extractSentences(this.selection);
        }
        this.previousIndex = 0;
    }

    setMatches(matches: Selection[]) {
        (this._matches as any).replace(matches);

        // We need to redefine the selection depending on the matches
        let selection = this.selection;
        for (const match of matches) {
            if (selection === null) {
                selection = match;
            } else {
                selection = selection.merge(match)
            }
        }

        this.setSelection(selection);
    }

    getMatches(): Selection[] {
        return toJS(this._matches);
    }

    setEmphasizedValues(matchIdentifiers: MatchIdentifier[]): void {
        if (matchIdentifiers.length !== this.hoveredValuesIds.length ||
                JSON.stringify(matchIdentifiers) !== JSON.stringify(this.hoveredValuesIds)) { // We optimize so that we don't redraw unecessarily
            (this.hoveredValuesIds as any).replace(matchIdentifiers);
        }
    }

    setAnchoredValues(matchIdentifiers: MatchIdentifier[]): void {
        (this.selectedValuesIds as any).replace(matchIdentifiers);
    }

    setChartType(chartType: string): void {
        this.defaultType.set(chartType);
    }

    /**
     * Split the paragraph into sentences
     * This would be better done using some proper NLP librairies. In the mean time, we use a simple (imperfect) regexp
     */
    extractSentences(selection: Selection): Selection[] {
        let matchRegexp;
        try {
            matchRegexp = new RegExp(this._splitRegexp.get(), "g");
        } catch(e) {
            // This might happen with web browsers not supporting complex regexp (e.g., Safari). We use a simpler regexp as back up.
            matchRegexp = new RegExp("\\. ", "g");
        }
        const sentences = [];

        let lastIndex = 0;
        selection.matchRegexp(matchRegexp, (match, absoluteIndex) => {
            sentences.push(selection.subselect(lastIndex, match.index - lastIndex));
            lastIndex = match.index + match[0].length;
        });
        sentences.push(selection.subselect(lastIndex, (selection.text.length + 1) - lastIndex));

        return sentences;
    }

    getSentenceAtIndex(index: number): Selection {
        for (const sentence of this.sentences) {
            if (sentence.contains(index)) {
                return sentence;
            }
        }

        return null;
    }

    setCurrentPosition(index: number, x = -1, y = -1) {
        const rectangle = this.selection.rect;
        const contained = x > rectangle.x && x < rectangle.x + rectangle.width &&
            y > rectangle.y && y < rectangle.y + rectangle.height;

        if (!contained) {
            this.currentIndex.set(-1);
        } else if (index >= 0) {
            this.currentIndex.set(index);
        }
    }

    getDistanceFromMatches(index: number, matches: Selection[]): { match: Selection, distance: number }[] {
        const distances = [];

        for (const match of matches) {
            const distance = match.end < index ? match.end - index : match.start - index;
            distances.push({ match: match, distance: distance });
        }

        return distances;
    }

    get type() {
        return this._type.get();
    }

    isMatchContained(matchIdsList: MatchIdentifier[], match: Selection): boolean {
        return matchIdsList.some(v => { return v.start === match.start && v.end === match.end });
    }

    /**
     * Update thee specification of the Charagraph depending on the current index in the text
     * A Charagraph's specification evolves with the index. Thus, different index will give different results (based on the numbers already seen and the current sentence's context)
     * @param currentPosition 
     */
    updateSpecification(force = false): void {
        const index = this.currentIndex.get();
        if (this.selection !== null && (force || index !== this.previousIndex)) {
            this.previousIndex = index;
            const values: CharagraphValue[] = [];

            const sentence = this.getSentenceAtIndex(index);
            const insideSelection = this.currentIndex.get() !== -1 && sentence;
            const matches = this.getMatches().concat(this._errorBarMatches).sort((a, b) => a.start - b.start);
            const ranks = this.getDistanceFromMatches(index, matches).sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance)).map(v => v.match);

            this._selectedSentence = null;
            let localSentence = sentence;
            const selectedValues = this.hoveredValuesIds.concat(this.selectedValuesIds);

            if (insideSelection) {
                // We highlight the whole selection that has been read so far and that is used to render the charagraph
                this._selectedSentence = this.selection.createSelection(this.selection.page, this.selection.start, sentence.end - this.selection.start);
            } else {
                // The selected sentence is the sentence currently hovered if outside of the paragraph
               // localSentence = this._selectedSentence = selectedValues.length > 0 ? this.getSentenceAtIndex(selectedValues[0].start) : null;
               localSentence = null;
                for (const selectedValue of selectedValues) {
                    const sentence = this.getSentenceAtIndex(selectedValue.start);
                    if (localSentence === null) {
                        localSentence = sentence
                    } else if (sentence !== null) {
                        localSentence = localSentence.merge(sentence);
                    }
                }
                this._selectedSentence = localSentence;
            }
            let dataIndex = 0;
            for (let idx = 0; idx < matches.length; ++idx) {
                const match = matches[idx];
                const isInHighlightedChunk = (this._selectedSentence && this._selectedSentence.contains(match.start)) || selectedValues.length > 0;
                const isInLocalSentence = localSentence && localSentence.contains(match.start);
                const isEmphasised = (insideSelection && isInLocalSentence && ranks.indexOf(match) === 0) || this.isMatchContained(selectedValues, match); // Emphasised if it is both in the local sentence + closest to cursor

                let color = this.colorTheme.medium; // By default the value is normal. "Static chart" mode
                if (isInHighlightedChunk) color = this.colorTheme.weak; // we de-emphasis if the value is not part of the current sentence
                if (isInLocalSentence) color = this.colorTheme.medium; // we de-emphasis if the value is not part of the current sentence
                if (isEmphasised) color = this.colorTheme.strong;

                const charagraphValue: CharagraphValue = {
                    match: match,
                    color: color,
                    emphasised: isEmphasised,
                    isErrorBar: this._errorBarMatches.includes(match),
                    visibleInText: !insideSelection || match.end <= sentence.end,
                    visibleInChart: !insideSelection || match.end <= sentence.end, // Only values already read or in the current sentence should be visible
                    dataIndex: dataIndex,
                    selected: this.isMatchContained(this.selectedValuesIds, match)
                };

                if (!this._errorBarMatches.includes(match)) {
                    ++dataIndex;
                }

                values.push(charagraphValue);
            }

            this._type.set(this.defaultType.get());

            (this.values as any).replace(values);
        }
    }

    get selectedSentence(): Selection {
        return this._selectedSentence;
    }

    parseFloat(text : string) : number {
        return parseFloat(text.replace(",", "").replace(" ", "")); // Remove the comma/space separator sometimes used to separate thousands
    }

    get order() : number[] {
        const values = this.values.filter(v => !v.isErrorBar);
        const indices = new Array(values.length);
        for (let i = 0; i < values.length; ++i) indices[i] = i;

        if (this.sorting === "ascending") {
            indices.sort((a, b) => {return this.parseFloat(values[a].match.text) - this.parseFloat(values[b].match.text)});
        } else if (this.sorting === "descending") {
            indices.sort((a, b) => {return this.parseFloat(values[b].match.text) - this.parseFloat(values[a].match.text)});
        }

        return indices;
    }

    echartSeries() {
        const data = this.values.filter(v => !v.isErrorBar).map((v, idx) => {
            return {
                value: this.parseFloat(this.parseFloat(v.match.text).toFixed(3)),
                name: (idx)+"", // This is required for some transitions (e.g., with pie charts)
                itemStyle: {
                    color: v.emphasised ? v.color : chroma(v.color).alpha(v.visibleInChart ? 0.7 : 0).hex(),
                    borderWidth: 2,
                    borderColor: v.selected? "#222222" : v.color
                },
                charagraphMatchIdentifier: { start: v.match.start, end: v.match.end }
            }
        });
        const order = this.order;

        return {
            data: order.map(i => data[i]),
            lineStyle: {color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 1,
                y2: 0,
                colorStops: this.values.map((v, idx) => {return {offset: idx/this.values.length, color: v.color};}),
                global: false // default is false
              }},
            type: this._type.get(),
            symbolKeepAspect: true,
            universalTransition: true,
            emphasis: { disabled: true },
            name: this._name.get(),
            barGap: '0%',
            barCategoryGap: '20%',
            label: {
                show: true,
                formatter: '{c}',
                rotate: (!this._horizontal.get() && this.type === "bar") ? 90 : 0

            }
        };
    }

    errorBarData() {
        return this._errorBarMatches.slice(0, this._matches.length).map((v, idx) => { 
            const referenceValue = this.parseFloat(this._matches[idx].text);
            const errorValue =  this.parseFloat(v.text);
            //TODO: Support for asymetrical error bars
            return {value: [idx,  this.parseFloat((referenceValue - errorValue).toFixed(3)),  this.parseFloat((referenceValue + errorValue).toFixed(3))],
                charagraphMatchIdentifier: { start: v.start, end: v.end }};
        });
    }

    echartErrorBarSeries() {
        const self = this;
        const errorBarData = this.errorBarData();
        const order = this.order.filter(v => v < errorBarData.length);

        return {
            type: 'custom',
            tooltip: {
                trigger: 'item'
            },
            itemStyle: {
                borderWidth: 1.5
            },
            renderItem: function (params, api) {
                const associatedSeriesId = (params.seriesIndex - 1) / 2; // TODO: Find a more robust way to link
                const currentSeriesIndices = api.currentSeriesIndices();

                if (!currentSeriesIndices.includes(associatedSeriesId)) { // Only draw error bars if the associated series is currently visible
                    return { type: 'group', children: [], data: [] };
                }

                const barLayout = api.barLayout({
                    barGap: '0%',
                    barCategoryGap: '20%',
                    count: currentSeriesIndices.length / 2
                });

                const xValue = params.dataIndex;
                const highPoint = api.coord(self.horizontal ? [api.value(1), xValue] : [xValue, api.value(1)]);
                const lowPoint = api.coord(self.horizontal ? [api.value(2), xValue] : [xValue, api.value(2)]);
                const wiskerSize = barLayout[associatedSeriesId].width * 0.25
                const halfWidth = self.horizontal ? 0 : wiskerSize;
                const halfHeight = self.horizontal ? wiskerSize : 0;
                const offset = barLayout[associatedSeriesId].offsetCenter
                const offsetx = self.horizontal ? 0 : offset;
                const offsety = self.horizontal ? offset : 0;

                const topWiskerShape = {
                    x1: highPoint[0] + offsetx - halfWidth, y1: highPoint[1] + offsety - halfHeight,
                    x2: highPoint[0] + offsetx + halfWidth, y2: highPoint[1] + offsety + halfHeight
                }

                const botWiskerShape = {
                    x1: lowPoint[0] + offsetx - halfWidth, y1: lowPoint[1] + offsety - halfHeight,
                    x2: lowPoint[0] + offsetx + halfWidth, y2: lowPoint[1] + offsety + halfHeight
                }

                const barShape = {
                    x1: highPoint[0] + offsetx, y1: highPoint[1] + offsety,
                    x2: lowPoint[0] + offsetx, y2: lowPoint[1] + offsety
                }

                const style = api.style({
                    stroke: '#333333',
                    fill: undefined
                });
                return {
                    type: 'group',
                    children: [
                        {
                            type: 'line',
                            transition: ['shape', 'style', 'x', 'y'],
                            shape: topWiskerShape,
                            style: style,
                            enterFrom: { style: { opacity: 0 } }
                        },
                        {
                            type: 'line',
                            transition: ['shape', 'style', 'x', 'y'],
                            shape: barShape,
                            style: style,
                            enterFrom: { shape: { x2: (barShape as any).x1, y1: (barShape as any).y2 } }
                        },
                        {
                            type: 'line',
                            transition: ['shape', 'style', 'x', 'y'],
                            shape: botWiskerShape,
                            style: style,
                            enterFrom: { style: { opacity: 0 } }
                        }
                    ]
                };
            },
            data: order.map(i => errorBarData[i]),
            z: 100,
            encode: {
                tooltip: [1, 2]
            }
        }
    }

    get min() {
        return this._minVal.get();
    }

    get max() {
        const values = this.errorBarData().map((v) => {return Math.max(v.value[1], v.value[2])}).concat(this.values.map(v =>  this.parseFloat(this.parseFloat(v.match.text).toFixed(3))))
        return Math.max(...values);
    }

    get categories() {
        return this.order.map(i => this.values.filter(v => !v.isErrorBar).map((v, idx) => {
            if (idx < this._categories.length) {
                return this._categories[idx]
            }
            return idx+1;
        })[i]);
    }

    echartxAxis() {
        return this._horizontal.get() ? { type: 'value', min: this.min, max: this.max } : { type: 'category', data: this.categories };
    }

    echartyAxis() {
        return !this._horizontal.get() ? { type: 'value', min: this.min, max: this.max } : { type: 'category', data: this.categories, inverse: true };
    }

    echartOptions() {
        const color = this.values.length > 0 ? this.values[0].color : "";
        return {
            animationDurationUpdate: 200,
            grid: { top: 20, right: 1, bottom: 0, left: 0, containLabel: true },
            yAxis: [{ ...this.echartyAxis(), triggerEvent: true, axisLabel: { hideOverlap: false } }],
            xAxis: [{ ...this.echartxAxis(), triggerEvent: true, axisTick: { interval: 0 }, axisLabel: { hideOverlap: false, interval: 0 } }], // We make sure Y axis stays always the same by using the max value
            tooltip: { trigger: 'item' },
            series: [toJS(this.echartSeries()), toJS(this.echartErrorBarSeries())],
            legend: {show: this.type !== "pie", selectedMode: false, itemStyle: {color: color}, lineStyle: {color: color}}
        };
    }
}