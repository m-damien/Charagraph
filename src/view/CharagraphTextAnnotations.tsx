import React from 'react';
import { observer } from "mobx-react-lite"
import { CharagraphValue } from '../logic/CharagraphModel';
import Rectangle from '../logic/datastructure/Rectangle';


/**
 * Defines a bunch of text annotations that will overlay the text
 */
export const CharagraphTextAnnotations = observer(({annotations, verticalPadding = 2, horizontalPadding = 2, style = {}, onClick = null} : { annotations: CharagraphValue[], horizontalPadding? : number, verticalPadding? : number, style? : React.CSSProperties, onClick? : (CharagraphValue) => void })  => {

    const annotationDivs = [];

    // Calculate the rectangles forming each annotations by retrieving their corresponding shapes
    let currentIdx = 0;
    for (const annotation of annotations) {
        let rectangle : Rectangle = null;
        for (let i = annotation.match.start; i < annotation.match.end; ++i) {
            if (rectangle === null) {
                rectangle = annotation.match.rect;
            } else {
                rectangle.add(annotation.match.rect);
            }
        }

        // Convert the rectangle to an annotation div
        if (rectangle) {
            annotationDivs.push(<div onClick={() => {if (onClick) onClick(annotation)}} className="animate__animated animate__fadeIn animate__faster" key={annotation.match.start+"."+currentIdx} 
            style={{ background: annotation.emphasised ? annotation.color + "50" : "none", position: 'absolute',
             borderBottom: 'solid 2px ' + annotation.color,
             borderTop: annotation.selected ? "solid 2px " + annotation.color : undefined, 
             borderLeft: annotation.selected ? "solid 2px " + annotation.color : undefined, 
             borderRight: annotation.selected ? "solid 2px " + annotation.color : undefined, 
             left: rectangle.x-horizontalPadding, top: rectangle.y-verticalPadding, width: rectangle.width+horizontalPadding*2, height: rectangle.height+verticalPadding*2, ...style,
             pointerEvents: onClick? "initial" : "none"
            }}></div>)
            ++currentIdx;
        }
    }


    return (
        <>
        {annotationDivs}
        </>
    );
})