import React, {useRef } from 'react';
import { observer } from "mobx-react-lite"
import { CharagraphBase, MatchIdentifier } from '../logic/CharagraphModel';
import {autorun } from 'mobx';
import { useEffect } from 'react';
import { InputText } from 'primereact/inputtext';
import { useState } from 'react';
import Rectangle from '../logic/datastructure/Rectangle';
import { ContextMenu } from 'primereact/contextmenu';

/**
 * Show the visualization associated with a Charagraph
 */
export const CharagraphOverlay = observer(({ children, echartRef, charagraph, width, height }: { children : any,  echartRef: React.MutableRefObject<any>, charagraph : CharagraphBase, width: number, height: number }) => {
    // Related to the filter
    const [filterPos, setFilterPos] = useState(0);
    const [filterValue, setFilterValue] = useState(0);
    const [filterVisible, setFilterVisible] = useState(false);
    const [filterAboveCount, setFilterAboveCount] = useState(0);
    const [filterBelowCount, setFilterBelowCount] = useState(0);

    // Related to the comparator
    const [comparatorValueAx, setComparatorValueAx] = useState(0);
    const [comparatorValueAy, setComparatorValueAy] = useState(0);
    const [comparatorValueBx, setComparatorValueBx] = useState(0);
    const [comparatorValueBy, setComparatorValueBy] = useState(0);
    const [comparatorDiff, setComparatorDiff] = useState(0);
    const [comparatorVisible, setComparatorVisible] = useState(false);

    // Related to the summarizer
    const [summarizerPos, setSummarizerPos] = useState(0);
    const [summarizerMean, setSummarizerMean] = useState(0);
    const [summarizerCount, setSummarizerCount] = useState(0);
    const [summarizerVisible, setSummarizerVisible] = useState(false);

    // Related to the editBox
    const editBoxRef = useRef<HTMLInputElement>(null);
    const [editBoxRectangle, setEditBoxRectangle] = useState({x: 0, y: 0, width: 50, height: 20});
    const [editBoxVisible, setEditBoxVisible] = useState(false)
    const [editBoxValue, setEditBoxValue] = useState("");
    const [onEditBoxChanged, setOnEditBoxChanged] = useState({callback: (value) => {return value}});

    // Related to the context menu
    const contextMenu = useRef(null);
    const [contextMenuItems, setContextMenuItems] = useState([{}]);

    function _parseFloat(text : string) : number {
        return parseFloat(text.replace(",", "").replace(" ", "")); // Remove the comma separator sometimes used to separate thousands
    }

    function updateFilter(echart : any, x : number, y : number) {
        const coord = echart.convertFromPixel('grid', [x, y])
        setFilterPos(charagraph.horizontal? x : y);
        setFilterValue(_parseFloat(coord[charagraph.horizontal? 0 : 1].toFixed(3)));
        const charagraphValues = charagraph.values;
        const matchToEmphasize : MatchIdentifier[] = [];
        let total = 0;
        for (const value of charagraphValues) {
            if (!value.isErrorBar) {
                if (_parseFloat(value.match.text) > filterValue) {
                    matchToEmphasize.push({start: value.match.start, end: value.match.end});
                }
                total++;
            }
        }
        setFilterAboveCount(matchToEmphasize.length);
        setFilterBelowCount(total-matchToEmphasize.length)

        charagraph.setEmphasizedValues(matchToEmphasize);
    }

    function onChartReady(echart) {
        // Make sure we remove previously installed callbacks
        echart.off('mouseover');
        echart.off('mouseout');
        echart.off('brushSelected');
        echart.off('dblclick');
        echart.off("mouseup")

        echart.off('mousemove');
        echart.on('mousemove', function (params) {
            if (params.componentType && params.componentType === (charagraph.horizontal ? 'xAxis' : 'yAxis')) {
                if (!filterVisible) {
                    setFilterVisible(true);
                }
            } else {
                if (filterVisible) {
                    charagraph.setEmphasizedValues([]);
                }
                setFilterVisible(false);
            }

        });

        echart.on('dblclick', function (params) {
            if (params.targetType === "axisLabel" && params.componentType === (charagraph.horizontal? "yAxis" : 'xAxis')) {
                let twidth = 50;
                let theight = 20;
                let tx = params.event.offsetX-width/2;
                let ty = params.event.offsetY-height/2;
                const target = params.event.target
                if (target && target._rect && target.transform) {
                    // Seems to be no proper API exposing the bbox of the target element
                    // So we use a hackish way of getting it
                    theight = target._rect.height;
                    twidth = Math.max(target._rect.width, 30);
                    tx = target.transform[4] - twidth/2;
                    ty = target.transform[5];
                }
                setEditBoxRectangle({x: tx, y: ty, width: twidth, height: theight});
                setEditBoxVisible(true);
                setEditBoxValue(params.value);
                setOnEditBoxChanged({callback: (value) => {
                    charagraph.setCategoryValue(params.dataIndex, value, params.componentIndex);
                }})
            }
        });

        echart.on('mouseover', function (params) {
            if (params.data && params.data.charagraphMatchIdentifier !== null) {
                charagraph.setEmphasizedValues([params.data.charagraphMatchIdentifier]);
            }
        });

        echart.on('mouseup', function (params) {
            if (params.event.event.button === 2) {
                const contextMenuOptions = [];

                if (charagraph.sorting !== "ascending") {
                    contextMenuOptions.push({
                        label:'Sort (Ascending)',
                        icon: 'pi pi-sort-numeric-up-alt',
                        command: () => {
                          charagraph.setSorting("ascending");
                        }
                    });
                }

                if (charagraph.sorting !== "descending") {
                    contextMenuOptions.push({
                        label:'Sort (Descending)',
                        icon: 'pi pi-sort-numeric-down-alt',
                        command: () => {
                          charagraph.setSorting("descending");
                        }
                    });
                }

                if (charagraph.sorting !== "none") {
                    contextMenuOptions.push({
                        label:'Sort (Text Order)',
                        icon: 'pi pi pi-sort-alt-slash',
                        command: () => {
                          charagraph.setSorting("none");
                        }
                    });
                }
                if (params.data && params.data.charagraphMatchIdentifier !== null) {
                    const identifier = params.data.charagraphMatchIdentifier;
                    contextMenuOptions.push({separator:true});
                    contextMenuOptions.push(
                        {
                            label:'Remove value',
                            icon: 'pi pi-times',
                            command: () => {
                              charagraph.setMatches(charagraph.getMatches().filter((v) => v.start !== identifier.start || v.end !== identifier.end));
                            }
                        }
                    )
                }
                setContextMenuItems(contextMenuOptions);
                contextMenu.current.show(params.event.event);

            }else if (params.data && params.data.charagraphMatchIdentifier !== null) {
                const identifier = params.data.charagraphMatchIdentifier;
                const anchorValues = charagraph.anchoredValues.concat([]); // Make a copy, we don't want to modify the object directly
                const previousLength = anchorValues.length
                const filteredValues = anchorValues.filter(v => v.start !== identifier.start || v.end !== identifier.end); // De-select if it was already selected
                if (previousLength === filteredValues.length) {
                    // We add the anchored value as it wasnt already selected
                    filteredValues.push(identifier);
                }
                charagraph.setAnchoredValues(filteredValues);
            }
        });


        echart.on('mouseout', function (params) {
            charagraph.setEmphasizedValues([]);
        });
    }

    function validateEditBox() {
        onEditBoxChanged.callback(editBoxRef.current.value)
        setEditBoxVisible(false);
    }

    function cancelEditBox() {
        setEditBoxVisible(false);
    }

    function onEditBoxKeyUp(event) {
        if (event.key === "Enter") {
            validateEditBox();
        }
        if (event.key === "Escape") {
            cancelEditBox();
        }
    }

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


    function getDisplayablesAtPosition(group : any, x : number, y : number) {
        if (group.contain && !group._children) {
            // This element is a displayable without children, we test if it contains the position
            if (group.contain(x, y)) {
                return [group];
            }
        }
        let groups = [];

        if (group._children) {
            for (const element of group._children) {
                groups = groups.concat(getDisplayablesAtPosition(element, x, y));
            }
        }

        return groups;
    }

    function getBoundingBox(group : any) : Rectangle {
        if (group.contain && !group._children) {
            // This element is a displayable without children, we test if it contains the position
            if (group.contain) {
                const bbox = group.getBoundingRect();
                return new Rectangle(bbox.x, bbox.y, bbox.width, bbox.height)
            }
        }
        //let groups = [];
        let rectangle : Rectangle = null;
        if (group._children) {
            for (const element of group._children) {
                const bbox = getBoundingBox(element);
                if (bbox) {
                    if (rectangle === null) {
                        rectangle = bbox;
                    } else {
                        rectangle.add(bbox);
                    }
                }
            }
        }

        return rectangle;
    }


    function getComponentAtPosition(x : number, y : number) {
        const echart = echartRef.current.getEchartsInstance();
        const brect = echart.getDom().getBoundingClientRect();
        x -= brect.x;
        y -= brect.y;
        let components = [];
        if (echart._componentsViews) {
            for (const componentView of echart._componentsViews) {
                if (componentView.group) {
                    components = components.concat(getDisplayablesAtPosition(componentView.group, x, y));
                }
            }
        }
        return components;
    }


    function onChartMouseMoved(event) {
        const echart = echartRef.current.getEchartsInstance();
        const brect = echart.getDom().getBoundingClientRect();
        const mx = event.clientX - brect.x;
        const my = event.clientY - brect.y;

        if (filterVisible) {
            updateFilter(echart, mx, my);
        }
    }

    function resetHoveringOverlays() {
        if (filterVisible) {
            setFilterVisible(false);
            charagraph.setEmphasizedValues([]);
        }
    }



    function onChartDoubleClicked(event) {
        const clickedElements = getComponentAtPosition(event.clientX, event.clientY);

        for (const clickedElement of clickedElements) {
            // Was it on the legend?
            if (clickedElement.parent && clickedElement.parent.__legendDataIndex !== undefined) {
                let twidth = 50;
                let theight = 20;
                let tx = event.offsetX-width/2;
                let ty = event.offsetY-height/2;
                const target = clickedElement.parent;
                if (target.getBoundingRect && target.transform) {
                    theight = target.getBoundingRect().height;
                    twidth = Math.max(target.getBoundingRect().width, 30);
                    tx = target.transform[4];
                    ty = target.transform[5];
                }
                setEditBoxRectangle({x: tx, y: ty, width: twidth, height: theight});
                setEditBoxVisible(true);
                setEditBoxValue("");
                setOnEditBoxChanged({callback: (value) => {
                    if (value.length > 0) {
                        charagraph.setName(value, clickedElement.parent.__legendDataIndex);
                    }
                }})
            }
        }
    }

    useEffect(() => {
        // For some reasons, the onChartReady callback does not get called when the Charagraph is changed (probably because it re-uses an existing echart container)
        // So we force the onChartReady to be called everytime the component gets re-drawn, otherwise the callbacks will have stale references
        if (echartRef.current) {
            onChartReady(echartRef.current.getEchartsInstance());

            autorun(() => {
                const anchors = charagraph.anchoredValues;

                if (echartRef.current) {
                    const echart = echartRef.current.getEchartsInstance();

                    const anchoredValues = charagraph.values
                        .filter(v => !v.isErrorBar && anchors.some(a => a.start === v.match.start && a.end === v.match.end));

                    if (anchoredValues.length === 2) {
                        const [a, b] = anchoredValues;

                        const va = parseFloat(a.match.text);
                        const vb = parseFloat(b.match.text);
                        const [ax, ay] = echart.convertToPixel('grid', charagraph.horizontal? [va, a.dataIndex] : [a.dataIndex, va])
                        const [bx, by] = echart.convertToPixel('grid', charagraph.horizontal? [vb, b.dataIndex] : [b.dataIndex, vb])

                        setComparatorValueAx(a.dataIndex < b.dataIndex ? ax : bx);
                        setComparatorValueAy(a.dataIndex < b.dataIndex ? ay : by);

                        setComparatorValueBx(a.dataIndex < b.dataIndex ? bx : ax);
                        setComparatorValueBy(a.dataIndex < b.dataIndex ? by : ay);

                        setComparatorDiff(parseFloat(Math.abs(va-vb).toFixed(2)))
                        setComparatorVisible(true);
                    } else {
                        setComparatorVisible(false);
                    }

                    if (anchoredValues.length >= 3) {
                        const anchoredNumbers = anchoredValues.map(v => parseFloat(v.match.text));
                        const mean = parseFloat((anchoredNumbers.reduce((a, b) => a + b, 0) / anchoredValues.length).toFixed(2));

                        const coord = echart.convertToPixel('grid', charagraph.horizontal? [mean, 0] : [0, mean])

                        setSummarizerMean(mean);
                        setSummarizerPos(coord[charagraph.horizontal? 0 : 1]);
                        setSummarizerCount(anchoredNumbers.length);
                        setSummarizerVisible(true);
                    } else {
                        setSummarizerVisible(false);
                    }
                }
            })
        }
    })

    return (
        <>
            {charagraph !== null &&
                <div style={{position: "relative"}} onDoubleClick={onChartDoubleClicked} onMouseMove={onChartMouseMoved} onMouseLeave={resetHoveringOverlays} onContextMenu={(e) => e.preventDefault()}>
                    {children}
                    {filterVisible && <div style={{position: 'absolute', left: charagraph.horizontal? filterPos : 0, top: charagraph.horizontal? 0 : filterPos, height: '100%', width: '100%', pointerEvents: 'none'}}>
                        <div style={{width: charagraph.horizontal?  2 : '100%', background: 'black', height: charagraph.horizontal? '100%' : 2}}></div>
                        <div style={{ position: 'absolute', top: 0, transform: charagraph.horizontal? 'translate(0px, 40px) rotate(90deg)' : 'translate(0px, -18px)', left: charagraph.horizontal? 0 : undefined, right: charagraph.horizontal? undefined : 3}}><span style={{background: '#ffffffAA', borderRadius: 3, padding: 2}}>{filterAboveCount}{" above"}</span></div>
                        <div style={{ position: 'absolute', top: 0, transform: charagraph.horizontal? ' translate(-40px, 40px) rotate(90deg)' : 'translate(0px, 3px)', left: charagraph.horizontal? 0 : undefined, right: charagraph.horizontal? undefined : 3}}><span style={{background: '#ffffffAA', borderRadius: 3, padding: 2}}>{filterBelowCount}{" below"}</span></div>
                        <div style={{ position: 'absolute', top: 0, transform: 'translate(-20px, -20px)', left: 3}}><span style={{background: '#ffffffAA', borderRadius: 3, padding: 2}}>{filterValue}</span></div>
                    </div>}


                    {comparatorVisible && !charagraph.horizontal && <div style={{position: 'absolute', left: comparatorValueAx, top: Math.min(comparatorValueAy, comparatorValueBy),
                         width: Math.abs(comparatorValueAx-comparatorValueBx), height: Math.abs(comparatorValueAy-comparatorValueBy), pointerEvents: 'none'}}>
                        <div style={{width: '100%', border: 'dashed 1px #000', height: 2}}></div>
                        <div style={{width: '100%', border: 'dashed 1px #000', height: 2, position: 'absolute', bottom: 0}}></div>
                        <div style={{width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column'}}>
                            <div style={{height: '30%', border: 'solid 1px #000', width: 2}}></div>
                            <span style={{background: '#ffffffAA', borderRadius: 3, padding: 2}}>{comparatorDiff}</span>
                            <div style={{height: '30%', border: 'solid 1px #000', width: 2}}></div>
                        </div>
                    </div>}

                    {comparatorVisible && charagraph.horizontal && <div style={{position: 'absolute', left: Math.min(comparatorValueAx, comparatorValueBx), top: comparatorValueAy,
                         width: Math.abs(comparatorValueAx-comparatorValueBx), height: Math.abs(comparatorValueAy-comparatorValueBy), pointerEvents: 'none'}}>
                        <div style={{height: '100%', border: 'dashed 1px #000', width: 2, top: 0}}></div>
                        <div style={{height: '100%', border: 'dashed 1px #000', width: 2, position: 'absolute', right: 0, top: 0}}></div>
                        <div style={{width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'row'}}>
                            <div style={{width: '30%', border: 'solid 1px #000', height: 2}}></div>
                            <span style={{background: '#ffffffAA', borderRadius: 3, padding: 2}}>{comparatorDiff}</span>
                            <div style={{width: '30%', border: 'solid 1px #000', height: 2}}></div>
                        </div>
                    </div>}


                    {summarizerVisible && !charagraph.horizontal && <div style={{position: 'absolute', left: 0, top: summarizerPos, width: '100%', pointerEvents: 'none'}}>
                        <div style={{width: '100%', background: 'black', height: 2}}></div>
                        <div style={{ position: 'absolute', top: 0, transform: 'translate(0px, -18px)', left: 3}}><span style={{background: '#ffffffAA', borderRadius: 3, padding: 2}}>count: {summarizerCount}</span></div>
                        <div style={{ position: 'absolute', top: 0, transform: 'translate(0px, -18px)', right: 3}}><span style={{background: '#ffffffAA', borderRadius: 3, padding: 2}}>mean: {summarizerMean}</span></div>
                    </div>}

                    {summarizerVisible && charagraph.horizontal && <div style={{position: 'absolute', left: summarizerPos, top: 0, height: '100%', pointerEvents: 'none'}}>
                        <div style={{height: '100%', background: 'black', width: 2}}></div>
                        <div style={{ position: 'absolute', top: 3, transform: 'translate(0px, 0px)', left: 10}}><span style={{background: '#ffffffAA', borderRadius: 3, padding: 2, whiteSpace: 'nowrap'}}>count: {summarizerCount}</span></div>
                        <div style={{ position: 'absolute', bottom: 3, transform: 'translate(0px, 0px)', left: 10}}><span style={{background: '#ffffffAA', borderRadius: 3, padding: 2, whiteSpace: 'nowrap'}}>mean: {summarizerMean}</span></div>
                    </div>}

                    <div style={{position: "absolute", left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none'}}></div>
                    {editBoxVisible && <InputText onBlur={validateEditBox} onKeyUp={onEditBoxKeyUp} ref={editBoxRef as any} autoFocus value={editBoxValue} style={{position: 'absolute', left: editBoxRectangle.x, top: editBoxRectangle.y, width: editBoxRectangle.width, height: editBoxRectangle.height}} onChange={(e) => setEditBoxValue(e.target.value)} />}
                </div>
            }
            <ContextMenu autoZIndex={false} model={contextMenuItems} ref={contextMenu} style={{zIndex: 999999}}></ContextMenu>
        </>
    );
})