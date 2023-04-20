import React from 'react';
import { useEffect } from 'react';
import './libs/viewer.js'
import './FancyPDF.css'
import { loadViewer } from './libs/viewer.js';
import { model } from '../../logic/Model';
import ShapeCommand from '../../logic/datastructure/ShapeCommand.jsx';
import { observer } from 'mobx-react-lite';
import { TextSelection } from './TextSelection';
import Rectangle from '../../logic/datastructure/Rectangle';

export const FancyPDF = observer(({children, height = undefined, onCharagraphCreated = undefined} : {children? : any, height? : number, onCharagraphCreated? : (CharagraphBase) => void}) => {
  function toShapeCoords(pageIdx: number, rect: Rectangle): Rectangle {
    const PDFViewerApplication = window['PDFViewerApplication'];
    const canvas = PDFViewerApplication.pdfViewer.getPageView(pageIdx).canvas;
    const bounds = canvas.getBoundingClientRect();
    const x = (rect.x - bounds.left) * 2;
    const y = (rect.y - bounds.top) * 2;
    const width = rect.width * 2;
    const height = rect.height * 2;

    return new Rectangle(x, y, width, height);
  }

  if (!onCharagraphCreated) {
    onCharagraphCreated = (charagraph) => {
      // By default we just add the charagraph to the model
      model.addCharagraph(charagraph);
    }
  }

  function getShapeCommandsIdxInRect(pageIdx: number, rect: Rectangle, shapes : ShapeCommand[]) {
    // Find shape commands in rect
    const selectRect = toShapeCoords(pageIdx, rect);

    const selectedTextCmd : number[] = [];
    for (let i = 0; i < shapes.length; ++i) {
      const shapeCmd = shapes[i];
      if (shapeCmd.unicode !== null && selectRect.intersects(shapeCmd.bbox)) {
        selectedTextCmd.push(i);
      }
    }

    return selectedTextCmd;
  }

  function mapTextItemToShape(textItem : any, shapes : ShapeCommand[], pageIdx : number) : any {
    const indexToShape = {};
    const PDFViewerApplication = window['PDFViewerApplication']
    const viewport = PDFViewerApplication.pdfViewer.getPageView(pageIdx).viewport;
    const canvas = PDFViewerApplication.pdfViewer.getPageView(pageIdx).canvas;
    if (canvas === undefined) {
      return {};
    }
    const bounds = canvas.getBoundingClientRect();

     // Compute the rectangle reprenseting the text item
    const matrix = window['pdfjsLib'].Util.transform(
        window['pdfjsLib'].Util.transform(viewport.transform, textItem.transform),
        [1, 0, 0, -1, 0, 0]
      );
      const itemWidth = textItem.width * viewport.scale;
      const itemHeight = textItem.height * viewport.scale;
      const itemX = matrix[4];
      const itemY = matrix[5] - itemHeight; // Set the origin at the top left corner
      const textItemRect = new Rectangle(itemX + bounds.left, itemY + bounds.top, itemWidth, itemHeight);

      let shapeIdx = [];
      if (shapes) {
        shapeIdx = getShapeCommandsIdxInRect(pageIdx, textItemRect, shapes);
      }

      shapeIdx = shapeIdx.filter((x) => { return shapes[x].unicode !== null }); // Only keep letters
      // Sort shapes by their x position
      shapeIdx = shapeIdx.sort(function (a, b) {
        return shapes[a].bbox.x - shapes[b].bbox.x;
      });

      const textStr = textItem.str;

      // Loop through all the letters and find the corresponding shape
      let lastShapeIdx = -1;
      for (let i = 0; i < textStr.length; ++i) {
        const char = textStr.charAt(i);
  
        if (char === " ") {
          continue; // Spaces are not represented with shapes
        }
  
        // Find the corresponding shape
        let found = false;
        for (let j = 0; j < shapeIdx.length; ++j) {
          const shape = shapes[shapeIdx[j]]


          if (shape.unicode === char) {
            const index = i;
            indexToShape[index] = shapeIdx[j];
            lastShapeIdx = shapeIdx[j];

            // Everything that is before should not be used anymore, so we remove it
            shapeIdx = shapeIdx.slice(j);
            found = true;
            break;
          }
        }
        if (!found && lastShapeIdx >= 0) {
          // Try to salvage the situation by relying on the shapes
          // most likely the following shape corresponds to the following character

          const shape = shapes[lastShapeIdx+1]
          if (shape.unicode === char) {
            // Success!
            const index = i;
            indexToShape[index] = lastShapeIdx+1;
            lastShapeIdx += 1;
          }
          //TODO: Something smart? Maybe just approximate the index based on the width and length (and estimating the size of a character)
          console.log("Could not find shape corresponding starting after '", textStr.substring(0, i) + "'");
        }
      }

      return indexToShape;
  }

  function mapShapeToIndex(pageIdx : number, textItems : any[]) : any {
    const indexToShape = {};
    //const shapeToIndex = {};

    // Recover the mapping between shape <=> index in the text
    const PDFViewerApplication = window['PDFViewerApplication']
    let currentText = "";

    const shapes = PDFViewerApplication.pageShapeCommands[pageIdx];
    if (!shapes) {
      return {indexToShape : indexToShape, fullText: ""};
    }
    
    const letterShapes = shapes.filter((x) => { return x !== undefined &&  x.unicode !== undefined && x.unicode !== " "}); // Only keep letters

    let shapeIdx = 0;
    for (const textItem of textItems) {
      // The shape ordering should be the same as the textItem. We rely on this to do the mapping

      const itemString = textItem.str;
      for (let i = 0; i < itemString.length; ++i) {
        const currentIndex = currentText.length + i;

        const char = itemString.charAt(i);

        if (char === " ") {
          continue; // Space do not have matching shapes
        }

        if (shapeIdx >= letterShapes.length) {
          break;
        }

        const shapeUnicode = letterShapes[shapeIdx].unicode

        if (shapeUnicode === char) {
          indexToShape[currentIndex] = letterShapes[shapeIdx]
          shapeIdx++;
        } else {
          if (['ﬁ', 'ﬂ', 'ﬀ'].includes(letterShapes[shapeIdx].unicode)) {
            // TODO: Should use NormalizedUnicode (what getTextContent is using, see pdfjsWorker) to handle these. Function is not reachable though
            indexToShape[currentIndex] = letterShapes[shapeIdx]
            indexToShape[currentIndex+1] = letterShapes[shapeIdx]
            i++;
            shapeIdx++;
          } else if (shapeUnicode.length >= 2) {
            indexToShape[currentIndex] = letterShapes[shapeIdx]
            for (let j = 1; j < shapeUnicode.length; ++j) {
              indexToShape[currentIndex+j] = letterShapes[shapeIdx]
              i++;
            }
            shapeIdx++;
          } else {
            //console.log("@", char, letterShapes[shapeIdx].unicode.split(""), letterShapes[shapeIdx].unicode.length);

              // Fallback solution, we do the mapping by bounding box. All shapes intersected by the textItem are considered
              const mapping = mapTextItemToShape(textItem, letterShapes, pageIdx);
              let maxShapeIndex = 0;
              for (const [index, mappedShapeIdx] of Object.entries(mapping)) {
                indexToShape[currentText.length+index] = letterShapes[mappedShapeIdx]
                maxShapeIndex = Math.max(maxShapeIndex, mappedShapeIdx as number);
              }
              // Re-align the index and hope this will be fine for the remaining characters
              shapeIdx = maxShapeIndex+1;
              break;
          }
        }
      }

      currentText += itemString;
    }

    return {indexToShape : indexToShape, fullText: currentText};
  }

  function calculatePageMapping(pageIdx : number, force = false) : void {      
    const PDFViewerApplication = window['PDFViewerApplication'];
    if (PDFViewerApplication.findController._textContent && (force || model.pageContent.length === 0 || model.pageContent[pageIdx] === undefined || model.pageContent[pageIdx].indexToShape === undefined)) {
      const extractShapeText = mapShapeToIndex(pageIdx, PDFViewerApplication.findController._textContent[pageIdx].items)
      model.setPageText(pageIdx, extractShapeText.fullText, extractShapeText.indexToShape);
    }
  }

  function extractText() : Promise<void> {
    return new Promise((resolve, reject) => {
      const PDFViewerApplication = window['PDFViewerApplication'];
      PDFViewerApplication.initializedPromise.then(function () {
        if (PDFViewerApplication.findController._pageContents.length === 0) {
          PDFViewerApplication.findController._firstPageCapability.promise.then(function () {
            PDFViewerApplication.findController._extractText();
            const promises = PDFViewerApplication.findController._extractTextPromises;
            PDFViewerApplication.pageAnnotations = [];
            for (let pageIdx = 0; pageIdx < promises.length; ++pageIdx) {
              PDFViewerApplication.pageAnnotations.push([]);
              const promise = promises[pageIdx];
              const pageIdxCst = pageIdx;
              promise.then(function () {
                if (pageIdxCst === promises.length-1) {
                  resolve();
                }
              })
            }
          });
        }
      });
    });
  }

  useEffect(() => {
    if (window["pdfViewerLoaded"] === undefined) {
      window["pdfViewerLoaded"] = true;
      loadViewer();

      // Install a hook to detect whenever a page is loaded/reloaded so that we can guarantee that the mapping tex <=> index stays consistent
      window['PDFViewerApplication'].onPageReloaded = function(pageIdx : number) {
        window['PDFViewerApplication'].findController._pageContents = []; // Invalidate previous extracted text
        extractText().then( v => { // Re-extract text just in case
          calculatePageMapping(pageIdx, true);
        });
      }
    }
  })


  return <>
  <div id="outerContainer">
    <div id="sidebarContainer">
      <div id="toolbarSidebar">
        <div id="toolbarSidebarLeft">
          <div
            id="sidebarViewButtons"
            className="splitToolbarButton toggled"
            role="radiogroup"
          >
            <button
              id="viewThumbnail"
              className="toolbarButton toggled"
              title="Show Thumbnails"
              tabIndex={2}
              data-l10n-id="thumbs"
              role="radio"
              aria-checked="true"
              aria-controls="thumbnailView"
            >
              <span data-l10n-id="thumbs_label">Thumbnails</span>
            </button>
            <button
              id="viewOutline"
              className="toolbarButton"
              title="Show Document Outline (double-click to expand/collapse all items)"
              tabIndex={3}
              data-l10n-id="document_outline"
              role="radio"
              aria-checked="false"
              aria-controls="outlineView"
            >
              <span data-l10n-id="document_outline_label">
                Document Outline
              </span>
            </button>
            <button
              id="viewAttachments"
              className="toolbarButton"
              title="Show Attachments"
              tabIndex={4}
              data-l10n-id="attachments"
              role="radio"
              aria-checked="false"
              aria-controls="attachmentsView"
            >
              <span data-l10n-id="attachments_label">Attachments</span>
            </button>
            <button
              id="viewLayers"
              className="toolbarButton"
              title="Show Layers (double-click to reset all layers to the default state)"
              tabIndex={5}
              data-l10n-id="layers"
              role="radio"
              aria-checked="false"
              aria-controls="layersView"
            >
              <span data-l10n-id="layers_label">Layers</span>
            </button>
          </div>
        </div>
        <div id="toolbarSidebarRight">
          <div id="outlineOptionsContainer" className="hidden">
            <div className="verticalToolbarSeparator" />
            <button
              id="currentOutlineItem"
              className="toolbarButton"
              disabled={true}
              title="Find Current Outline Item"
              tabIndex={6}
              data-l10n-id="current_outline_item"
            >
              <span data-l10n-id="current_outline_item_label">
                Current Outline Item
              </span>
            </button>
          </div>
        </div>
      </div>
      <div id="sidebarContent">
        <div id="thumbnailView"></div>
        <div id="outlineView" className="hidden"></div>
        <div id="attachmentsView" className="hidden"></div>
        <div id="layersView" className="hidden"></div>
      </div>
      <div id="sidebarResizer" />
    </div>{" "}
    {/* sidebarContainer */}
    <div id="mainContainer">
      <div className="findbar hidden doorHanger" id="findbar">
        <div id="findbarInputContainer">
          <input
            id="findInput"
            className="toolbarField"
            title="Find"
            placeholder="Find in document…"
            tabIndex={91}
            data-l10n-id="find_input"
            aria-invalid="false"
          />
          <div className="splitToolbarButton">
            <button
              id="findPrevious"
              className="toolbarButton"
              title="Find the previous occurrence of the phrase"
              tabIndex={92}
              data-l10n-id="find_previous"
            >
              <span data-l10n-id="find_previous_label">Previous</span>
            </button>
            <div className="splitToolbarButtonSeparator" />
            <button
              id="findNext"
              className="toolbarButton"
              title="Find the next occurrence of the phrase"
              tabIndex={93}
              data-l10n-id="find_next"
            >
              <span data-l10n-id="find_next_label">Next</span>
            </button>
          </div>
        </div>
        <div id="findbarOptionsOneContainer">
          <input
            type="checkbox"
            id="findHighlightAll"
            className="toolbarField"
            tabIndex={94}
          />
          <label
            htmlFor="findHighlightAll"
            className="toolbarLabel"
            data-l10n-id="find_highlight"
          >
            Highlight All
          </label>
          <input
            type="checkbox"
            id="findMatchCase"
            className="toolbarField"
            tabIndex={95}
          />
          <label
            htmlFor="findMatchCase"
            className="toolbarLabel"
            data-l10n-id="find_match_case_label"
          >
            Match Case
          </label>
        </div>
        <div id="findbarOptionsTwoContainer">
          <input
            type="checkbox"
            id="findMatchDiacritics"
            className="toolbarField"
            tabIndex={96}
          />
          <label
            htmlFor="findMatchDiacritics"
            className="toolbarLabel"
            data-l10n-id="find_match_diacritics_label"
          >
            Match Diacritics
          </label>
          <input
            type="checkbox"
            id="findEntireWord"
            className="toolbarField"
            tabIndex={97}
          />
          <label
            htmlFor="findEntireWord"
            className="toolbarLabel"
            data-l10n-id="find_entire_word_label"
          >
            Whole Words
          </label>
        </div>
        <div id="findbarMessageContainer" aria-live="polite">
          <span id="findResultsCount" className="toolbarLabel" />
          <span id="findMsg" className="toolbarLabel" />
        </div>
      </div>{" "}
      {/* findbar */}
      <div
        className="editorParamsToolbar hidden doorHangerRight"
        id="editorFreeTextParamsToolbar"
      >
        <div className="editorParamsToolbarContainer">
          <div className="editorParamsSetter">
            <label
              htmlFor="editorFreeTextColor"
              className="editorParamsLabel"
              data-l10n-id="editor_free_text_color"
            >
              Color
            </label>
            <input
              type="color"
              id="editorFreeTextColor"
              className="editorParamsColor"
              tabIndex={100}
            />
          </div>
          <div className="editorParamsSetter">
            <label
              htmlFor="editorFreeTextFontSize"
              className="editorParamsLabel"
              data-l10n-id="editor_free_text_size"
            >
              Size
            </label>
            <input
              type="range"
              id="editorFreeTextFontSize"
              className="editorParamsSlider"
              defaultValue={10}
              min={5}
              max={100}
              step={1}
              tabIndex={101}
            />
          </div>
        </div>
      </div>
      <div
        className="editorParamsToolbar hidden doorHangerRight"
        id="editorInkParamsToolbar"
      >
        <div className="editorParamsToolbarContainer">
          <div className="editorParamsSetter">
            <label
              htmlFor="editorInkColor"
              className="editorParamsLabel"
              data-l10n-id="editor_ink_color"
            >
              Color
            </label>
            <input
              type="color"
              id="editorInkColor"
              className="editorParamsColor"
              tabIndex={102}
            />
          </div>
          <div className="editorParamsSetter">
            <label
              htmlFor="editorInkThickness"
              className="editorParamsLabel"
              data-l10n-id="editor_ink_thickness"
            >
              Thickness
            </label>
            <input
              type="range"
              id="editorInkThickness"
              className="editorParamsSlider"
              defaultValue={1}
              min={1}
              max={20}
              step={1}
              tabIndex={103}
            />
          </div>
          <div className="editorParamsSetter">
            <label
              htmlFor="editorInkOpacity"
              className="editorParamsLabel"
              data-l10n-id="editor_ink_opacity"
            >
              Opacity
            </label>
            <input
              type="range"
              id="editorInkOpacity"
              className="editorParamsSlider"
              defaultValue={100}
              min={1}
              max={100}
              step={1}
              tabIndex={104}
            />
          </div>
        </div>
      </div>
      <div
        id="secondaryToolbar"
        className="secondaryToolbar hidden doorHangerRight"
      >
        <div id="secondaryToolbarButtonContainer">
          <button
            id="secondaryPresentationMode"
            className="secondaryToolbarButton visibleLargeView"
            title="Switch to Presentation Mode"
            tabIndex={51}
            data-l10n-id="presentation_mode"
          >
            <span data-l10n-id="presentation_mode_label">
              Presentation Mode
            </span>
          </button>
          <button
            id="secondaryOpenFile"
            className="secondaryToolbarButton visibleLargeView"
            title="Open File"
            tabIndex={52}
            data-l10n-id="open_file"
          >
            <span data-l10n-id="open_file_label">Open</span>
          </button>
          <button
            id="secondaryPrint"
            className="secondaryToolbarButton visibleMediumView"
            title="Print"
            tabIndex={53}
            data-l10n-id="print"
          >
            <span data-l10n-id="print_label">Print</span>
          </button>
          <button
            id="secondaryDownload"
            className="secondaryToolbarButton visibleMediumView"
            title="Download"
            tabIndex={54}
            data-l10n-id="download"
          >
            <span data-l10n-id="download_label">Download</span>
          </button>
          <a
            href="#"
            id="secondaryViewBookmark"
            className="secondaryToolbarButton visibleSmallView"
            title="Current view (copy or open in new window)"
            tabIndex={55}
            data-l10n-id="bookmark"
          >
            <span data-l10n-id="bookmark_label">Current View</span>
          </a>
          <div className="horizontalToolbarSeparator visibleLargeView" />
          <button
            id="firstPage"
            className="secondaryToolbarButton"
            title="Go to First Page"
            tabIndex={56}
            data-l10n-id="first_page"
          >
            <span data-l10n-id="first_page_label">Go to First Page</span>
          </button>
          <button
            id="lastPage"
            className="secondaryToolbarButton"
            title="Go to Last Page"
            tabIndex={57}
            data-l10n-id="last_page"
          >
            <span data-l10n-id="last_page_label">Go to Last Page</span>
          </button>
          <div className="horizontalToolbarSeparator" />
          <button
            id="pageRotateCw"
            className="secondaryToolbarButton"
            title="Rotate Clockwise"
            tabIndex={58}
            data-l10n-id="page_rotate_cw"
          >
            <span data-l10n-id="page_rotate_cw_label">Rotate Clockwise</span>
          </button>
          <button
            id="pageRotateCcw"
            className="secondaryToolbarButton"
            title="Rotate Counterclockwise"
            tabIndex={59}
            data-l10n-id="page_rotate_ccw"
          >
            <span data-l10n-id="page_rotate_ccw_label">
              Rotate Counterclockwise
            </span>
          </button>
          <div className="horizontalToolbarSeparator" />
          <div id="cursorToolButtons" role="radiogroup">
            <button
              id="cursorSelectTool"
              className="secondaryToolbarButton toggled"
              title="Enable Text Selection Tool"
              tabIndex={60}
              data-l10n-id="cursor_text_select_tool"
              role="radio"
              aria-checked="true"
            >
              <span data-l10n-id="cursor_text_select_tool_label">
                Text Selection Tool
              </span>
            </button>
            <button
              id="cursorHandTool"
              className="secondaryToolbarButton"
              title="Enable Hand Tool"
              tabIndex={61}
              data-l10n-id="cursor_hand_tool"
              role="radio"
              aria-checked="false"
            >
              <span data-l10n-id="cursor_hand_tool_label">Hand Tool</span>
            </button>
          </div>
          <div className="horizontalToolbarSeparator" />
          <div id="scrollModeButtons" role="radiogroup">
            <button
              id="scrollPage"
              className="secondaryToolbarButton"
              title="Use Page Scrolling"
              tabIndex={62}
              data-l10n-id="scroll_page"
              role="radio"
              aria-checked="false"
            >
              <span data-l10n-id="scroll_page_label">Page Scrolling</span>
            </button>
            <button
              id="scrollVertical"
              className="secondaryToolbarButton toggled"
              title="Use Vertical Scrolling"
              tabIndex={63}
              data-l10n-id="scroll_vertical"
              role="radio"
              aria-checked="true"
            >
              <span data-l10n-id="scroll_vertical_label">
                Vertical Scrolling
              </span>
            </button>
            <button
              id="scrollHorizontal"
              className="secondaryToolbarButton"
              title="Use Horizontal Scrolling"
              tabIndex={64}
              data-l10n-id="scroll_horizontal"
              role="radio"
              aria-checked="false"
            >
              <span data-l10n-id="scroll_horizontal_label">
                Horizontal Scrolling
              </span>
            </button>
            <button
              id="scrollWrapped"
              className="secondaryToolbarButton"
              title="Use Wrapped Scrolling"
              tabIndex={65}
              data-l10n-id="scroll_wrapped"
              role="radio"
              aria-checked="false"
            >
              <span data-l10n-id="scroll_wrapped_label">Wrapped Scrolling</span>
            </button>
          </div>
          <div className="horizontalToolbarSeparator" />
          <div id="spreadModeButtons" role="radiogroup">
            <button
              id="spreadNone"
              className="secondaryToolbarButton toggled"
              title="Do not join page spreads"
              tabIndex={66}
              data-l10n-id="spread_none"
              role="radio"
              aria-checked="true"
            >
              <span data-l10n-id="spread_none_label">No Spreads</span>
            </button>
            <button
              id="spreadOdd"
              className="secondaryToolbarButton"
              title="Join page spreads starting with odd-numbered pages"
              tabIndex={67}
              data-l10n-id="spread_odd"
              role="radio"
              aria-checked="false"
            >
              <span data-l10n-id="spread_odd_label">Odd Spreads</span>
            </button>
            <button
              id="spreadEven"
              className="secondaryToolbarButton"
              title="Join page spreads starting with even-numbered pages"
              tabIndex={68}
              data-l10n-id="spread_even"
              role="radio"
              aria-checked="false"
            >
              <span data-l10n-id="spread_even_label">Even Spreads</span>
            </button>
          </div>
          <div className="horizontalToolbarSeparator" />
          <button
            id="documentProperties"
            className="secondaryToolbarButton"
            title="Document Properties…"
            tabIndex={69}
            data-l10n-id="document_properties"
            aria-controls="documentPropertiesDialog"
          >
            <span data-l10n-id="document_properties_label">
              Document Properties…
            </span>
          </button>
        </div>
      </div>{" "}
      {/* secondaryToolbar */}
      <div className="toolbar">
        <div id="toolbarContainer">
          <div id="toolbarViewer">
            <div id="toolbarViewerLeft">
              <button
                id="sidebarToggle"
                className="toolbarButton"
                title="Toggle Sidebar"
                tabIndex={11}
                data-l10n-id="toggle_sidebar"
                aria-expanded="false"
                aria-controls="sidebarContainer"
              >
                <span data-l10n-id="toggle_sidebar_label">Toggle Sidebar</span>
              </button>
              <div className="toolbarButtonSpacer" />
              <button
                id="viewFind"
                className="toolbarButton"
                title="Find in Document"
                tabIndex={12}
                data-l10n-id="findbar"
                aria-expanded="false"
                aria-controls="findbar"
              >
                <span data-l10n-id="findbar_label">Find</span>
              </button>
              <div className="splitToolbarButton hiddenSmallView">
                <button
                  className="toolbarButton"
                  title="Previous Page"
                  id="previous"
                  tabIndex={13}
                  data-l10n-id="previous"
                >
                  <span data-l10n-id="previous_label">Previous</span>
                </button>
                <div className="splitToolbarButtonSeparator" />
                <button
                  className="toolbarButton"
                  title="Next Page"
                  id="next"
                  tabIndex={14}
                  data-l10n-id="next"
                >
                  <span data-l10n-id="next_label">Next</span>
                </button>
              </div>
              <input
                type="number"
                id="pageNumber"
                className="toolbarField"
                title="Page"
                defaultValue={1}
                size={4}
                min={1}
                tabIndex={15}
                data-l10n-id="page"
                autoComplete="off"
              />
              <span id="numPages" className="toolbarLabel" />
            </div>
            <div id="toolbarViewerRight">
              <button
                id="presentationMode"
                className="toolbarButton hiddenLargeView"
                title="Switch to Presentation Mode"
                tabIndex={31}
                data-l10n-id="presentation_mode"
              >
                <span data-l10n-id="presentation_mode_label">
                  Presentation Mode
                </span>
              </button>
              <button
                id="openFile"
                className="toolbarButton hiddenLargeView"
                title="Open File"
                tabIndex={32}
                data-l10n-id="open_file"
              >
                <span data-l10n-id="open_file_label">Open</span>
              </button>
              <button
                id="print"
                className="toolbarButton hiddenMediumView"
                title="Print"
                tabIndex={33}
                data-l10n-id="print"
              >
                <span data-l10n-id="print_label">Print</span>
              </button>
              <button
                id="download"
                className="toolbarButton hiddenMediumView"
                title="Download"
                tabIndex={34}
                data-l10n-id="download"
              >
                <span data-l10n-id="download_label">Download</span>
              </button>
              <a
                href="#"
                id="viewBookmark"
                className="toolbarButton hiddenSmallView"
                title="Current view (copy or open in new window)"
                tabIndex={35}
                data-l10n-id="bookmark"
              >
                <span data-l10n-id="bookmark_label">Current View</span>
              </a>
              <div className="verticalToolbarSeparator hiddenSmallView" />
              <div
                id="editorModeButtons"
                className="splitToolbarButton toggled hidden"
                role="radiogroup"
              >
                <button
                  id="editorFreeText"
                  className="toolbarButton"
                  disabled={true}
                  title="Add FreeText Annotation"
                  role="radio"
                  aria-checked="false"
                  tabIndex={36}
                  data-l10n-id="editor_free_text"
                >
                  <span data-l10n-id="editor_free_text_label">
                    FreeText Annotation
                  </span>
                </button>
                <button
                  id="editorInk"
                  className="toolbarButton"
                  disabled={true}
                  title="Add Ink Annotation"
                  role="radio"
                  aria-checked="false"
                  tabIndex={37}
                  data-l10n-id="editor_ink"
                >
                  <span data-l10n-id="editor_ink_label">Ink Annotation</span>
                </button>
              </div>
              {/* Should be visible when the "editorModeButtons" are visible. */}
              <div
                id="editorModeSeparator"
                className="verticalToolbarSeparator hidden"
              />
              <button
                id="secondaryToolbarToggle"
                className="toolbarButton"
                title="Tools"
                tabIndex={48}
                data-l10n-id="tools"
                aria-expanded="false"
                aria-controls="secondaryToolbar"
              >
                <span data-l10n-id="tools_label">Tools</span>
              </button>
            </div>
            <div id="toolbarViewerMiddle">
              <div className="splitToolbarButton">
                <button
                  id="zoomOut"
                  className="toolbarButton"
                  title="Zoom Out"
                  tabIndex={21}
                  data-l10n-id="zoom_out"
                >
                  <span data-l10n-id="zoom_out_label">Zoom Out</span>
                </button>
                <div className="splitToolbarButtonSeparator" />
                <button
                  id="zoomIn"
                  className="toolbarButton"
                  title="Zoom In"
                  tabIndex={22}
                  data-l10n-id="zoom_in"
                >
                  <span data-l10n-id="zoom_in_label">Zoom In</span>
                </button>
              </div>
              <span id="scaleSelectContainer" className="dropdownToolbarButton">
                <select
                  id="scaleSelect"
                  title="Zoom"
                  tabIndex={23}
                  defaultValue="pageAutoOption"
                  data-l10n-id="zoom"
                >
                  <option
                    id="pageAutoOption"
                    title=""
                    value="auto"
                    data-l10n-id="page_scale_auto"
                  >
                    Automatic Zoom
                  </option>
                  <option
                    id="pageActualOption"
                    title=""
                    value="page-actual"
                    data-l10n-id="page_scale_actual"
                  >
                    Actual Size
                  </option>
                  <option
                    id="pageFitOption"
                    title=""
                    value="page-fit"
                    data-l10n-id="page_scale_fit"
                  >
                    Page Fit
                  </option>
                  <option
                    id="pageWidthOption"
                    title=""
                    value="page-width"
                    data-l10n-id="page_scale_width"
                  >
                    Page Width
                  </option>
                  <option
                    id="customScaleOption"
                    title=""
                    value="custom"
                    disabled={true}
                    hidden={true}
                  />
                  <option
                    title=""
                    value="0.5"
                    data-l10n-id="page_scale_percent"
                    data-l10n-args='{ "scale": 50 }'
                  >
                    50%
                  </option>
                  <option
                    title=""
                    value="0.75"
                    data-l10n-id="page_scale_percent"
                    data-l10n-args='{ "scale": 75 }'
                  >
                    75%
                  </option>
                  <option
                    title=""
                    value={1}
                    data-l10n-id="page_scale_percent"
                    data-l10n-args='{ "scale": 100 }'
                  >
                    100%
                  </option>
                  <option
                    title=""
                    value="1.25"
                    data-l10n-id="page_scale_percent"
                    data-l10n-args='{ "scale": 125 }'
                  >
                    125%
                  </option>
                  <option
                    title=""
                    value="1.5"
                    data-l10n-id="page_scale_percent"
                    data-l10n-args='{ "scale": 150 }'
                  >
                    150%
                  </option>
                  <option
                    title=""
                    value={2}
                    data-l10n-id="page_scale_percent"
                    data-l10n-args='{ "scale": 200 }'
                  >
                    200%
                  </option>
                  <option
                    title=""
                    value={3}
                    data-l10n-id="page_scale_percent"
                    data-l10n-args='{ "scale": 300 }'
                  >
                    300%
                  </option>
                  <option
                    title=""
                    value={4}
                    data-l10n-id="page_scale_percent"
                    data-l10n-args='{ "scale": 400 }'
                  >
                    400%
                  </option>
                </select>
              </span>
            </div>
          </div>
          <div id="loadingBar">
            <div className="progress">
              <div className="glimmer"></div>
            </div>
          </div>
        </div>
      </div>
      <div id="viewerContainer" tabIndex={0} /*onContextMenu={(event) => {event.preventDefault()}}*/>
          <TextSelection onCharagraphCreated={onCharagraphCreated} /*onTextSelected={(selection) => {model.addCharagraph(new CharagraphModel(selection));}}*/>
            <div id="viewer" className="pdfViewer" />
          </TextSelection>
          {children}
      </div>
      <div id="errorWrapper" hidden={true}>
        <div id="errorMessageLeft">
          <span id="errorMessage" />
          <button id="errorShowMore" data-l10n-id="error_more_info">
            More Information
          </button>
          <button
            id="errorShowLess"
            data-l10n-id="error_less_info"
            hidden={true}
          >
            Less Information
          </button>
        </div>
        <div id="errorMessageRight">
          <button id="errorClose" data-l10n-id="error_close">
            Close
          </button>
        </div>
        <div id="errorSpacer" />
        <textarea
          id="errorMoreInfo"
          hidden={true}
          readOnly={true}
          defaultValue={""}
        />
      </div>
    </div>{" "}
    {/* mainContainer */}
    <div id="dialogContainer">
      <dialog id="passwordDialog">
        <div className="row">
          <label
            htmlFor="password"
            id="passwordText"
            data-l10n-id="password_label"
          >
            Enter the password to open this PDF file:
          </label>
        </div>
        <div className="row">
          <input type="password" id="password" className="toolbarField" />
        </div>
        <div className="buttonRow">
          <button id="passwordCancel" className="dialogButton">
            <span data-l10n-id="password_cancel">Cancel</span>
          </button>
          <button id="passwordSubmit" className="dialogButton">
            <span data-l10n-id="password_ok">OK</span>
          </button>
        </div>
      </dialog>
      <dialog id="documentPropertiesDialog">
        <div className="row">
          <span id="fileNameLabel" data-l10n-id="document_properties_file_name">
            File name:
          </span>
          <p id="fileNameField" aria-labelledby="fileNameLabel">
            -
          </p>
        </div>
        <div className="row">
          <span id="fileSizeLabel" data-l10n-id="document_properties_file_size">
            File size:
          </span>
          <p id="fileSizeField" aria-labelledby="fileSizeLabel">
            -
          </p>
        </div>
        <div className="separator" />
        <div className="row">
          <span id="titleLabel" data-l10n-id="document_properties_title">
            Title:
          </span>
          <p id="titleField" aria-labelledby="titleLabel">
            -
          </p>
        </div>
        <div className="row">
          <span id="authorLabel" data-l10n-id="document_properties_author">
            Author:
          </span>
          <p id="authorField" aria-labelledby="authorLabel">
            -
          </p>
        </div>
        <div className="row">
          <span id="subjectLabel" data-l10n-id="document_properties_subject">
            Subject:
          </span>
          <p id="subjectField" aria-labelledby="subjectLabel">
            -
          </p>
        </div>
        <div className="row">
          <span id="keywordsLabel" data-l10n-id="document_properties_keywords">
            Keywords:
          </span>
          <p id="keywordsField" aria-labelledby="keywordsLabel">
            -
          </p>
        </div>
        <div className="row">
          <span
            id="creationDateLabel"
            data-l10n-id="document_properties_creation_date"
          >
            Creation Date:
          </span>
          <p id="creationDateField" aria-labelledby="creationDateLabel">
            -
          </p>
        </div>
        <div className="row">
          <span
            id="modificationDateLabel"
            data-l10n-id="document_properties_modification_date"
          >
            Modification Date:
          </span>
          <p id="modificationDateField" aria-labelledby="modificationDateLabel">
            -
          </p>
        </div>
        <div className="row">
          <span id="creatorLabel" data-l10n-id="document_properties_creator">
            Creator:
          </span>
          <p id="creatorField" aria-labelledby="creatorLabel">
            -
          </p>
        </div>
        <div className="separator" />
        <div className="row">
          <span id="producerLabel" data-l10n-id="document_properties_producer">
            PDF Producer:
          </span>
          <p id="producerField" aria-labelledby="producerLabel">
            -
          </p>
        </div>
        <div className="row">
          <span id="versionLabel" data-l10n-id="document_properties_version">
            PDF Version:
          </span>
          <p id="versionField" aria-labelledby="versionLabel">
            -
          </p>
        </div>
        <div className="row">
          <span
            id="pageCountLabel"
            data-l10n-id="document_properties_page_count"
          >
            Page Count:
          </span>
          <p id="pageCountField" aria-labelledby="pageCountLabel">
            -
          </p>
        </div>
        <div className="row">
          <span id="pageSizeLabel" data-l10n-id="document_properties_page_size">
            Page Size:
          </span>
          <p id="pageSizeField" aria-labelledby="pageSizeLabel">
            -
          </p>
        </div>
        <div className="separator" />
        <div className="row">
          <span
            id="linearizedLabel"
            data-l10n-id="document_properties_linearized"
          >
            Fast Web View:
          </span>
          <p id="linearizedField" aria-labelledby="linearizedLabel">
            -
          </p>
        </div>
        <div className="buttonRow">
          <button id="documentPropertiesClose" className="dialogButton">
            <span data-l10n-id="document_properties_close">Close</span>
          </button>
        </div>
      </dialog>
      <dialog id="printServiceDialog" style={{ minWidth: 200 }}>
        <div className="row">
          <span data-l10n-id="print_progress_message">
            Preparing document for printing…
          </span>
        </div>
        <div className="row">
          <progress value={0} max={100} />
          <span
            data-l10n-id="print_progress_percent"
            data-l10n-args='{ "progress": 0 }'
            className="relative-progress"
          >
            0%
          </span>
        </div>
        <div className="buttonRow">
          <button id="printCancel" className="dialogButton">
            <span data-l10n-id="print_progress_close">Cancel</span>
          </button>
        </div>
      </dialog>
    </div>{" "}
    {/* dialogContainer */}
  </div>{" "}
  {/* outerContainer */}
  <div id="printContainer" />
  <input type="file" id="fileInput" className="hidden" />
</>

});