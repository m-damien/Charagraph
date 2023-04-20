import React from 'react';
import { observer } from "mobx-react-lite"
import { Selection } from '../logic/datastructure/Selection';


/**
 * Draws a rectangle above the text not being part of the selection so that it appears dimmer than the selection.
 */
export const CharagraphTextDimmer = observer(({selection} : { selection : Selection})  => {
    const sourceRect = selection? selection.sourceRect : null;
    const sentenceRects = [];

    if (selection) {
        for (const lineRect of selection.lineRects) {
            sentenceRects.push(<rect key={lineRect.x+""+lineRect.y} x={lineRect.x-sourceRect.x} y={lineRect.y-sourceRect.y-1} width={lineRect.width} height={lineRect.height} fill={'black'}></rect>)
        }
    }

    return (
        <>
        { sourceRect && <svg  className="animate__animated animate__fadeIn animate__faster" id="textDimmer" style={{position: 'absolute', top: sourceRect.y, width: sourceRect.width, height: sourceRect.height, left: sourceRect.x, zIndex: 9999, pointerEvents: 'none'}}>
            <rect x={0} y={0} width={sourceRect.width} height={sourceRect.height} fill={'rgba(255, 255, 255, 0.6)'} mask='url(#textSelection)'/>
            <mask id="textSelection">
                <rect x={0} y={0} width={sourceRect.width} height={sourceRect.height} fill={'white'}></rect>
                {sentenceRects}
            </mask>
        </svg>}
        </>
    );
})