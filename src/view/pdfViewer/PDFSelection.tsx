import Rectangle from "../../logic/datastructure/Rectangle";
import { Selection } from "../../logic/datastructure/Selection";
import { model } from "../../logic/Model";
import { PosUtils } from "../utils/PosUtils";


export class PDFSelection extends Selection {
    prevRects : Rectangle[];
    prevNbChunks = 0;

    get rects(): Rectangle[] {
        /*if (this.chunks.length === this.prevNbChunks) {
            return this.prevRects;
        }*/

        const shapeRectangles = [];
        const pageRect = PosUtils.getPageViewerRect(this.page);
        for (const chunk of this.chunks) {
            for (let index = chunk.start; index < chunk.end; ++index) {
                if (model.pageContent.length > chunk.page && model.pageContent[chunk.page] && model.pageContent[chunk.page].indexToShape) {
                    const shape = model.pageContent[chunk.page].indexToShape[index+""];
                    if (shape !== undefined) {
                        shapeRectangles.push(PosUtils.shapeToViewerCoord(chunk.page, shape.bbox.x, shape.bbox.y, shape.bbox.width, shape.bbox.height, pageRect));
                    }
                }
            }
        }

        this.prevNbChunks = this.chunks.length;
        this.prevRects = shapeRectangles;
        return shapeRectangles;
    }

    createSelection(page: number, index: number, length: number): Selection {
        return new PDFSelection(page, index, length);
    }

    sourceText(page : number) : string {
        return model.pageContent[page].text;
    }
}