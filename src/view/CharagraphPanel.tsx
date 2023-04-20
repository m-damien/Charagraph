import React from 'react';
import { observer } from "mobx-react-lite"
import { MatchGroup, model } from '../logic/Model';
import { Button } from 'primereact/button';
import { SelectButton } from 'primereact/selectbutton';
import { CharagraphBase } from '../logic/CharagraphModel';
import { toJS } from 'mobx';
import { CharagraphTextAnnotations } from './CharagraphTextAnnotations';
import { DragItemType, dragndropModel } from './DragnDropModel';
import { CompoundCharagraphModel } from '../logic/CompoundCharagraphModel';
import { CharagraphVisualization } from './CharagraphVisualization';
import { useMemo } from 'react';
import { ValueExtractor } from '../logic/ValueExtractor';
import { useState } from 'react';
import { CharagraphTextDimmer } from './CharagraphTextDimmer';
import { useRef } from 'react';
import { Rnd } from 'react-rnd';

/**
 * Defines a charagraph in its own window and that can be dragged and customized
 * 
 * Not that Charagraphs are overlaid and can technically be moved anywhere within their container.
 */
export const CharagraphPanel = observer(({ charagraph }: { charagraph: CharagraphBase }) => {
    model.pageContent as any; // This is a fake call. It's just to force mobx to re-render the component if the pageContent is changed
    const [className, setClassName] = useState("charagraph");

    // ## Get the different values that can be extracted from the current selection

    // Generate the different group of values that can be selected
    const matchOptions = [];
    const matchGroups = useMemo<MatchGroup[]>(() => { // Potentially slow, so we memoize it
        return ValueExtractor.extractMatchGroups(charagraph.selection)
    }, [charagraph.selection]);

    for (let index = 0; index < matchGroups.length; ++index) {
        const matchGroup = matchGroups[index];
        matchOptions.push({ label: matchGroup.prefix + "[...]" + matchGroup.suffix, index: index });
    }

    const visualization = useRef();

    function onClose(): void {
        // Remove the Charagraph completely
        model.removeCharagraph(charagraph);
    }

    // Retrieve the textual annotation that should be highlighted, as per the charagraph
    const textAnnotations = charagraph.values.filter(v => v.visibleInText);

    const chartTypes = [
        { icon: "pi pi-chart-bar", value: 'horizontalbar' },
        { icon: "pi pi-chart-bar", value: 'bar' },
        { icon: "pi pi-chart-line", value: 'line' },
        { icon: "pi pi-chart-pie", value: 'pie' }
    ]

    const chartTypeTemplate = (option) => {
        return <i style={{transform: option.value.includes("horizontal")? 'rotate(90deg) scale(-1, 1)' : ''}} className={option.icon}></i>;
    }

    function onDragStarted() {
        setClassName("charagraph draggedCharagraph")
        dragndropModel.setDraggedItem(charagraph, DragItemType.CHARAGRAPH);
    }

    function onDragStopped(event : any) {
        setClassName("charagraph")
        const elementDroppedOn = document.elementFromPoint(event.clientX, event.clientY);
        if (!elementDroppedOn || !elementDroppedOn.className.includes("dropZone")) {
            // Wasn't dropped in a dropzone, we just reset the dragged item
            dragndropModel.resetDraggedItem();
        }
    }

    function onCharagraphDropped(event, isErrorBar = false) {
        const charagraphs_a = (charagraph as any).charagraphs ? (charagraph as any).charagraphs : [charagraph];
        const charagraphs_b = dragndropModel.draggedItem.charagraphs ? dragndropModel.draggedItem.charagraphs : [dragndropModel.draggedItem];

        if (isErrorBar) {
            model.removeCharagraph(dragndropModel.draggedItem);
            // TODO: Check that it has the same size and all

            let componentIndex = 0;
            if (charagraphs_a.length > 1) {
                // If it is a compound chart, we use the element that was dropped on as the index
                const elementTargeted = (visualization.current as any).getElementAtPosition(event.clientX, event.clientY);
                if (elementTargeted && elementTargeted.parent.__ecComponentInfo) {
                    componentIndex = elementTargeted.parent.__ecComponentInfo.index/2; // divided by 2 to take into account that each series always have an error bar associated
                }
            }
            charagraph.setErrorBarMatches(dragndropModel.draggedItem.getMatches(), componentIndex);
            // We should also merge the selection of the error bar and the charagraph (just in case the error bar is outside the existing selection)
            charagraph.setSelection(charagraph.selection.merge(dragndropModel.draggedItem.selection), componentIndex);

        } else {
            // Merge the two charagraphs by removing them and adding a CompoundCharagraph
            model.removeCharagraph(dragndropModel.draggedItem);
            model.removeCharagraph(charagraph);

            // Make sure the dragged charts match if the other chart is horizontal
            dragndropModel.draggedItem.setHorizontal(charagraph.horizontal);


            model.addCharagraph(new CompoundCharagraphModel(charagraphs_a.concat(charagraphs_b)))         
        }

        dragndropModel.resetDraggedItem();

    }

    let scale = 1;
    const PDFViewerApplication = window['PDFViewerApplication'];
    if (PDFViewerApplication && PDFViewerApplication.pdfViewer) {
        scale = PDFViewerApplication.pdfViewer._currentScale;
    }

    const titleHeight = 28;
    return (
        <>
            <CharagraphTextAnnotations annotations={textAnnotations}></CharagraphTextAnnotations>
            <CharagraphTextDimmer selection={toJS(charagraph.selectedSentence)}></CharagraphTextDimmer>
            <Rnd
                size={{width: charagraph.width, height: charagraph.height}}
                dragHandleClassName="charagraphTitle"
                enableResizing={{bottomRight: true}}
                position={{ x: charagraph.x*scale, y: charagraph.y*scale}}
                minWidth={240}
                minHeight={200}
                onDragStop={(e, d) => { charagraph.setPosition(d.x/scale, d.y/scale); onDragStopped(e) }}
                onResizeStop={(e, direction, ref, delta, position) => {
                    charagraph.setPosition(position.x/scale, position.y/scale);
                    charagraph.setSize(parseInt(ref.style.width), parseInt(ref.style.height));
                }}
                className={className}
                onDragStart={onDragStarted}
                style={{fontSize: 12, borderRadius: 3, fontWeight: 600, background: 'white', border: '1px solid #dee2e6', zIndex: 9999}}>
                <div className="animate__animated animate__fadeIn animate__fast" style={{position: 'relative'}}>
                    <div className="charagraphTitleContainer" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #dee2e6', background: '#f8f9fa', borderRadius: 3, color: '#495057', padding: 5, height: titleHeight }}>
                        <Button icon="pi pi-times" className="p-button-rounded p-button-danger p-button-sm" aria-label="Cancel" onClick={onClose} style={{ width: 0, height: 0, padding: 5, marginRight: 5 }} /> 
                        <span className="charagraphTitle" style={{flexGrow: 1, textAlign: 'center'}}>Charagraph</span>
                        {charagraph.type !== "compound" && <SelectButton unselectable={false} value={(charagraph.horizontal? "horizontal" : "") + toJS(charagraph.type)} itemTemplate={chartTypeTemplate} optionLabel="value" options={chartTypes} onChange={(e) => {charagraph.setChartType(e.value.replace('horizontal', '')); charagraph.setHorizontal(e.value.includes("horizontal"))}}></SelectButton>}
                    </div>
                    {charagraph !== null && <CharagraphVisualization ref={visualization} charagraph={charagraph} width={charagraph.width-3} height={charagraph.height-titleHeight-3}/>}
                    { (dragndropModel.isDragged(DragItemType.CHARAGRAPH) && dragndropModel.draggedItem !== charagraph) &&
                        <div style={{width: '100%', height: '100%', position: 'absolute', left: 0, top: 0,}}>
                            <div onMouseUp={e => onCharagraphDropped(e, false)} className='dropZone animate__animated animate__pulse' 
                                style={{width: '100%', height: '80%', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                                    <i className="pi pi-plus-circle" style={{pointerEvents: 'none', fontSize: 24, color: "#444"}}></i><span style={{pointerEvents: 'none', marginLeft: 5, fontSize: 24, color: "#444"}}>Add Series</span>
                            </div>
                            <div onMouseUp={e => onCharagraphDropped(e, true)} className='dropZone animate__animated animate__pulse' 
                                style={{width: '100%', height: '20%', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                                    <i className="pi pi-sliders-v" style={{pointerEvents: 'none', fontSize: 24, color: "#444"}}></i><span style={{pointerEvents: 'none', marginLeft: 5, fontSize: 24, color: "#444"}}>Add Error Bars</span>
                            </div>
                        </div>

                    }
                </div>
            </Rnd>

        </>
    );
})