import React, { useEffect, useState } from 'react';

import { observer } from "mobx-react-lite"
import { model } from '../../logic/Model';
import ShapeCommand from '../../logic/datastructure/ShapeCommand';
import Rectangle from '../../logic/datastructure/Rectangle';
import { PosUtils } from '../utils/PosUtils';
import { Selection } from '../../logic/datastructure/Selection';
import { PDFSelection } from './PDFSelection';
import { SelectionMenu } from './SelectionMenu';
import { ValueExtractor } from '../../logic/ValueExtractor';
import { CharagraphBase, CharagraphModel } from '../../logic/CharagraphModel';
import { ContextMenu } from 'primereact/contextmenu';
import { useRef } from 'react';
import { observe } from 'mobx';

export const TextSelection = observer(({ children, onTextSelected = undefined, onTextDeselected = undefined, onCharagraphCreated = undefined }: {children: any, onTextSelected? : (Selection) => void, onTextDeselected? : () => void, onCharagraphCreated? : (CharagraphBase) => void}) => {
  const [selection, setSelection] = useState<Selection>(null);
  const [isSelecting, setIsSelecting] = useState(false)
  const [startPos, setStartPos] = useState({ x: 0, y: 0, page: 0, onText: false});
  const [endPos, setEndPos] = useState({ x: 0, y: 0 });
  const [previewedMatches, setPreviewedMatches] = useState([]);
  const [targetedValue, setTargetedValue] = useState<Selection>(null);
  const [targetedMatch, setTargetedMatch] = useState<Selection>(null);
  const [targetedCharagraph, setTargetedCharagraph] = useState<CharagraphBase>(null);

  function resetSelection() {
    setSelection(null);
    setStartPos({ x: 0, y: 0, page: 0, onText: false});
    setEndPos({ x: 0, y: 0 });
    setIsSelecting(false);
    setPreviewedMatches([]);
  }

  useEffect(() => {
    const dispose = observe(model.pageContent, () => {
      resetSelection(); // Reset the selection whenever the page has changed
    })

    return () => {
      dispose();
    }
  })


  function getPageFromMouseEvent(mouseEvent) {
    let pageDiv = mouseEvent.target;
    while (pageDiv !== null) {
      if (pageDiv.className === "page") {
        return pageDiv;
      }

      pageDiv = pageDiv.parentElement;
    }

    return null;
  }

  function onMouseDownPage(event) {
    if (event.target.tagName === "BUTTON") {
      // Those should not be considered as to not break exisiting mechanisms
      return;
    }
    if (event.buttons === 1) { // Click on the page
      if (selection) {
        resetSelection() // Reset selection if there was one
        if (onTextDeselected) {
          onTextDeselected();
        }
      }

      const pageDiv = getPageFromMouseEvent(event);
      if (pageDiv !== null) {
        setIsSelecting(true);
        const pageRect = PosUtils.getPageViewerRect(pageDiv.dataset.pageNumber-1);
        const vy = event.clientY - pageDiv.getBoundingClientRect().top-9+pageRect.y;
        const vx = event.clientX - pageDiv.getBoundingClientRect().left-9+pageRect.x;
        const startPos = { x: vx, y: vy, page: pageDiv.dataset.pageNumber-1, onText: event.target.tagName === "SPAN" };
        const endPos = { x: vx, y: vy}
        setEndPos(endPos);
        setStartPos(startPos);
        updateSelectionRectangle(startPos, endPos);
      }
    }
  }

  function onMouseMovePage(event) {
    const pageDiv = getPageFromMouseEvent(event);
    if (event.buttons === 1 && isSelecting) {
      const pageRect = PosUtils.getPageViewerRect(startPos.page);
      const PDFViewerApplication = window['PDFViewerApplication'];
      const pageDiv = PDFViewerApplication.pdfViewer.getPageView(startPos.page).div

      const vy = event.clientY - pageDiv.getBoundingClientRect().top-9+pageRect.y;
      const vx = event.clientX - pageDiv.getBoundingClientRect().left-9+pageRect.x;
      const endPos = { x: vx, y: vy};
      setEndPos(endPos);
      updateSelectionRectangle(startPos, endPos);
    }

    if (pageDiv !== null) {
      const pageRect = PosUtils.getPageViewerRect(pageDiv.dataset.pageNumber-1);
      const vy = event.clientY - pageDiv.getBoundingClientRect().top-9+pageRect.y;
      const vx = event.clientX - pageDiv.getBoundingClientRect().left-9+pageRect.x;

      const index = getIndexAtPosition(pageDiv.dataset.pageNumber-1, vx, vy);
      model.setCurrentReadingPosition(index, pageDiv.dataset.pageNumber-1, vx, vy);

    } else {
      model.setCurrentReadingPosition(-1, -1, 0, 0);
    }
  }

  //let lastSelection = null;
  function onMouseUpPage(event) {
    if (event.button === 0) {
      setIsSelecting(false);
      if (event.detail === 2) {
        const selectedWord = model.getCurrentWord();
        if (selectedWord) {
          const selection = new PDFSelection(model.currentPageId.get(), selectedWord.start, selectedWord.end-selectedWord.start);
          setSelection(selection);
        }
      } else if (event.detail === 3) {
        const selectedSentence = model.getCurrentSentence();
        if (selectedSentence) {
          const selection = new PDFSelection(model.currentPageId.get(), selectedSentence.start, selectedSentence.end-selectedSentence.start);
          setSelection(selection);
        }
      } else {
        if (selection && selection.text.length > 0 && !isNaN(selection.end)) { // We force the selection to be relatively big to be considered
          if (onTextSelected) {
            onTextSelected(selection);
          }

        } else {
          const match = model.getCurrentMatch();
          if (match) {
            const filteredAnchoredValues = match.charagraph.anchoredValues.filter(m => m.start !== match.match.start || m.end !== match.match.end); // De-select if already selected
            if (filteredAnchoredValues.length === match.charagraph.anchoredValues.length) {
              // Select
              filteredAnchoredValues.push({start: match.match.start, end: match.match.end});
            }
            match.charagraph.setAnchoredValues(filteredAnchoredValues);
          } else {
            // Deselect everything
            for (const charagraph of model.charagraphs) {
              if (charagraph.anchoredValues.length > 0) {
                charagraph.setAnchoredValues([]);
              }
            }

          }
        }
      }
    }
  }


  function getIndexAtPosition(pageIdx : number, viewx : number, viewy : number) {
    const pageContent = model.pageContent[pageIdx];
    if (pageContent !== undefined) {
      const selectRect = PosUtils.viewerToShapeCoord(pageIdx, viewx, viewy, 1, 1);
      let closestIndex = -1;
      let closestDist = 99999;

      for (const [index, shape] of Object.entries(pageContent.indexToShape)) {
        const bbox = (shape as ShapeCommand).bbox;

        const dx = Math.max(bbox.x - selectRect.x, 0, selectRect.x - bbox.x+bbox.width);
        const dy = Math.max(bbox.y - selectRect.y, 0, selectRect.y - bbox.y+bbox.height);
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < closestDist) {
          closestDist = dist;
          closestIndex = parseInt(index);
        }
  
        if (bbox.x < selectRect.x && bbox.y < selectRect.y && selectRect.x < bbox.x+bbox.width && selectRect.y < bbox.y+bbox.height) {
          return parseInt(index);
        }
      }

      // We are a bit lenient if we are close to a shape
      if (closestDist < 35) {
        return closestIndex;
      }
    }

    return -1;
  }

  /**
   * Retrieve the current selection
   * @param lineSelection If true, the selection will follow the text/paragraph (like a regular text selection). Otherwise, the selection is purely rectangular and disconnected from the text.
   * @returns 
   */
  function getSelection(lineSelection = false, startPos : {x : number, y : number, page : number}, endPos : {x : number, y : number}) : {selection : Selection, selectionRectangle : Rectangle} {
    const pageIdx = startPos.page;
    const pageContent = model.pageContent[pageIdx];
    const selectionRectangle = new Rectangle(Math.min(startPos.x, endPos.x), Math.min(startPos.y, endPos.y), Math.abs(endPos.x - startPos.x), Math.abs(endPos.y - startPos.y));
    const selectRect = PosUtils.viewerToShapeCoord(pageIdx, Math.min(startPos.x, endPos.x), Math.min(startPos.y, endPos.y), Math.abs(endPos.x - startPos.x), Math.abs(endPos.y - startPos.y));
    let indices = [];
    let selection : Selection = null;

    for (const [index, shape] of Object.entries(pageContent.indexToShape)) {
      const shapeRect = (shape as ShapeCommand).bbox;
      if (selectRect.intersects(shapeRect)) {
        indices.push(parseInt(index));
      }
    }

    if (lineSelection) {
      // Calculate the rectangle of the selected lines
      let minIndex = Math.min(...indices);
      let maxIndex = Math.max(...indices);
      const shapeSelectionRect = selectRect.clone();
      for (let i = minIndex; i <= maxIndex; ++i) {
        if (i+"" in pageContent.indexToShape) {
          shapeSelectionRect.add(pageContent.indexToShape[i+""].bbox)
        }
      }

      // Recalculate the indices with the newly computed rectangle
      indices = [];
      for (const [index, shape] of Object.entries(pageContent.indexToShape)) {
        const shapeRect = (shape as ShapeCommand).bbox;
        if (shapeSelectionRect.intersects(shapeRect)) {
          indices.push(parseInt(index));
        }
      }

      

      minIndex = Math.min(...indices);
      maxIndex = Math.max(...indices);

      // Crop the indices by taking the first one after the selection's starting position
      let startPosViewer = PosUtils.viewerToShapeCoord(pageIdx, startPos.x, startPos.y, startPos.x, startPos.y);
      let endPosViewer = PosUtils.viewerToShapeCoord(pageIdx, endPos.x, endPos.y, endPos.x, endPos.y);
      if ((Math.abs(startPosViewer.y - endPosViewer.y) < 3 && endPosViewer.x < startPosViewer.x) || startPosViewer.y > endPosViewer.y) {
        const tmp = startPosViewer;
        startPosViewer = endPosViewer;
        endPosViewer = tmp;
      }

      for (; minIndex < maxIndex; minIndex++) {
        const shape = pageContent.indexToShape[minIndex+""]
        if (shape && shape.bbox.x+shape.bbox.width > startPosViewer.x) {
          break;
        }
      }

      for (; maxIndex >= minIndex; maxIndex--) {
        const shape = pageContent.indexToShape[maxIndex+""]
        if (shape && shape.bbox.x < endPosViewer.x) {
          break;
        }
      }

      selection = new PDFSelection(pageIdx, minIndex, maxIndex-minIndex+1);
    } else {
      // The list of indices is scattered across the document, so we group the indices in ranges
      indices.sort((a,b)=>a-b); // Weird JS behavior that sorts lexicographically if the comparison function is not passed
      let run = []
      
      for (let i = 0; i < indices.length; i++) {
        run.push(indices[i]);
    
        if (i + 1 >= indices.length || indices[i+1] - indices[i] > 2) { // We are lenient up to 2 characters. This is to account that some indexes might be skipped because the mapping shape<>index is imperfect
          const start = run[0];
          const end = run.pop();
          if (selection === null) {
            selection = new PDFSelection(pageIdx, start, end-start+1);
          } else {
            selection.addChunk(pageIdx, start, end-start+1);
          }
          run = [];
        }
      }
    }

    return {selection: selection, selectionRectangle: selectionRectangle};
  }

  function updateSelectionRectangle(startPos  : {x : number, y : number, page : number, onText : boolean}, endPos : {x : number, y : number}) {
    if (Math.abs(endPos.x-startPos.x) > 4 || Math.abs(endPos.y-startPos.y) > 4) {
      const currentSelection = getSelection(startPos.onText, startPos, endPos);
      setSelection(currentSelection.selection);
    }
  }


  const selectedLines = [];
  const menuOptions = [];

  if (selection) {
    const matchGroups = ValueExtractor.extractMatchGroups(selection);

    if (model.isCharagraphEnabled.get()) {
      // Extract the values using prefix/suffix
      // TODO: useMemo to optimize

      for (const matchGroup of matchGroups) {
        if (matchGroup.matches.size > 0) {
          menuOptions.push({label: matchGroup.prefix + "▢" + matchGroup.suffix, matchGroup: matchGroup})
        }
      }
    }

    const highlights = [];
    
    highlights.push({color: "#3990C060", rectangles: previewedMatches.length > 0 ? previewedMatches.map(v => {return v.lineRects}).flat() : selection.lineRects});;
    // Add elements to de-emphasize to show the values that will NOT be included
    if (previewedMatches.length > 0) {
      const deselectedMatches = new Array(...matchGroups[0].matches).filter(v => {return !previewedMatches.some(b => {return b.start === v.start && b.end === v.end})});
      highlights.push({color: "#ffffff50", rectangles: deselectedMatches.map(v => {return v.lineRects}).flat()});
    }

    for (const highlight of highlights) {
      for (const lineRect of highlight.rectangles) {
        selectedLines.push(
          <div key={lineRect.x+" "+lineRect.y} style={{position: 'absolute', pointerEvents: 'none', zIndex: 9999, left:lineRect.x-1, top:lineRect.y-1, width:lineRect.width+1, height:lineRect.height+1, background:highlight.color}}></div>
        )
      }
    }
  }

  function onOptionClicked(option) {
    if (onCharagraphCreated) {

      // Create the charagraph and decide its position & size
      // ## Get the coordinates of the paragraph in viewer coords
      const paragraphRect = selection.rect;
      const defaultWidth = Math.min(Math.max(paragraphRect.width, 240), 300);
      const defaultHeight = Math.min(Math.max(paragraphRect.height, 200), 1000);
  
      // Compute the Charagraph position

      const margin = 5; // Margin from the page
      const pageRect = PosUtils.getPageViewerRect(selection.page);

      // We alternate between left and right margin to show the charagraph
      // TODO: Something smarter by finding a position that is not used already
      const centeredY = paragraphRect.y + (paragraphRect.height - defaultHeight)/2; //paragraphRect.y + (Math.random() * 120 - 25)
      const defaultPosition = [
          [pageRect.right + margin, centeredY], // Right margin
          [pageRect.left - defaultWidth - margin, centeredY], // Left margin
      ]
      // center with text selection
      const [defaultx, defaulty] = defaultPosition[model.charagraphs.length%defaultPosition.length]

      let scale = 1;
      const PDFViewerApplication = window['PDFViewerApplication'];
      if (PDFViewerApplication && PDFViewerApplication.pdfViewer) {
          scale = PDFViewerApplication.pdfViewer._currentScale;
      }


      const charagraph = new CharagraphModel(selection, defaultx/scale, defaulty/scale, defaultWidth, defaultHeight);
      charagraph.setMatches(new Array(...option.matchGroup.matches));
      onCharagraphCreated(charagraph);
    }

    resetSelection();
  }

  function onOptionHovered(option) {
    setPreviewedMatches(new Array(...option.matchGroup.matches));
  }

  function onContextMenu(event) {
    if (model.charagraphs.length > 0) {
    
      const targetedMatch = model.getCurrentMatch();
      if (targetedMatch) {
        setTargetedMatch(targetedMatch.match);
        setTargetedCharagraph(targetedMatch.charagraph);
        setTargetedValue(null);
        contextMenu.current.show(event);
      } else {
        // Check what is being targeted by the context menu
        const targetedValue = model.getCurrentWordValue();
        const targetedValueSelection = targetedValue ? new PDFSelection(model.currentPageId.get(), targetedValue.start, targetedValue.end-targetedValue.start) : null;
        setTargetedValue(targetedValueSelection);
        setTargetedCharagraph(model.charagraphs[model.charagraphs.length-1])
        setTargetedMatch(null);
        if (targetedValueSelection) {
          contextMenu.current.show(event);
        }
      }
    }
  }

  const contextMenu = useRef(null);
  const contextMenuItems = [];

  if (targetedValue || targetedMatch) {
    contextMenuItems.push({
      label: targetedValue ? targetedValue.text : targetedMatch.text,
      disabled: true
    });

    contextMenuItems.push({
      separator: true
    });

    if (targetedValue) {
      contextMenuItems.push({
        label:'Add value',
        icon: 'pi pi-check',
        command: () => {
          targetedCharagraph.setMatches(targetedCharagraph.getMatches().concat([targetedValue]));
        }
      });
    }

    if (targetedMatch) {
      contextMenuItems.push({
        label:'Remove value',
        icon: 'pi pi-times',
        command: () => {
          targetedCharagraph.setMatches(targetedCharagraph.getMatches().filter((v) => v !== targetedMatch));
        }
      });
    }
  }


  return (<>
  <ContextMenu autoZIndex={false} model={contextMenuItems} ref={contextMenu} style={{zIndex: 999999}}></ContextMenu>
  <div onMouseDown={onMouseDownPage} onMouseUp={onMouseUpPage} onMouseMove={onMouseMovePage} onContextMenu={onContextMenu}>
    { !isSelecting && selection && menuOptions.length > 0 &&
      <div onMouseLeave={() => {setPreviewedMatches([])}}>
        <SelectionMenu onOptionHovered={onOptionHovered} onOptionClicked={onOptionClicked} options={menuOptions} style={{position: 'absolute', top: selection.rect.bottom+5, left: selection.rect.left+selection.rect.width/2, zIndex: 999999}}></SelectionMenu>
      </div>
    }
    { isSelecting && !startPos.onText && <div id="rectangularSelection" 
      style={{ pointerEvents: 'none',
      left: Math.min(startPos.x, endPos.x), top: Math.min(startPos.y, endPos.y), border: 'dashed 2px #666', width: Math.abs(startPos.x-endPos.x), height: Math.abs(startPos.y-endPos.y), 
      position: 'absolute', zIndex: 9999 }} />}
    {selectedLines}
    {children}
  </div></>);
})