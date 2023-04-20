import Rectangle from "../../logic/datastructure/Rectangle";
import ShapeCommand from "../../logic/datastructure/ShapeCommand";

/**
 * A utility class that takes shapes and convert them to text, forming words (given that the selection include some 'Character' shapes).
 * Words are formed based on the positon and angle of the letters.
 * This class is still relatively basic, if needed, future improvements could include:
 * - Exploiting the already formed "chunks" of letters in the PDF (right now, letters are considered individually).
 * - Properly handling selections with letters using different angles (not sure what 'properly' would mean here).
 * - Using OCR (?) if the letters were 'rendered' as shapes.
 */
export default class TextMerger {
    /**
     * Make sense of shapes and try to form lines and words
     * @param {[ShapeCommand]} shapes 
     */
    static getTextsFromShapes(shapes : ShapeCommand[]) : TextChunk[][] {
        // First, we filter everything that is not text
        let letterShapes : TextChunk[] = [];

        for (let i = 0; i < shapes.length; ++i) {
            if (shapes[i].text !== undefined) {
                const shape = shapes[i];
                letterShapes.push(new TextChunk(shape));
            }
        }

        if (letterShapes.length === 0) {
            // No letters found
            return null;
        }

        // Second, we sort the letters based on their position (using their aligned bounding boxes)
        letterShapes = letterShapes.sort(function(a, b) {
            return a.alignedRect.x - b.alignedRect.x;
        });

        // Third, we seperate the text into lines (if the text is on different lines)
        let lines = [new TextLine(letterShapes[0])]; // Always at least one line
        for (let i = 1; i < letterShapes.length; ++i) {
            const chunk = letterShapes[i];
            // Test if the chunk belongs to any existing line
            let line : TextLine = null;
            for (let j = 0; j < lines.length; ++j) {
                if (lines[j].isOnLine(chunk)) {
                    line = lines[j];
                    break;
                }
            }
            
            if (line === null) {
                // If not, this chunk is forming a new line
                line = new TextLine(chunk);
                lines.push(line);
            } else {
                line.addTextChunk(chunk);
            }
        }

        // Fourth, sort the lines by their y position
        lines = lines.sort(function(a, b) {
            return a.alignedRect.y - b.alignedRect.y;
        });

        // Fourth, form the 2D table of line/words
        const text = [];
        lines.forEach(l => {
            text.push(l.getWords());
        })

        return text;
    }

    /**
     * Make sense of shapes and returns a single string (with spaces between words, and \n between lines)
     * @param shapes 
     */
    static getTextFromShapes(shapes : ShapeCommand[], wordSeparator=" ", lineSeparator="\n") : string {
        const texts = TextMerger.getTextsFromShapes(shapes);

        if (texts === null) {
            return null;
        }

        return texts.map(line => {
            return line.map(chunk => chunk.text).join(wordSeparator)
        }).join(lineSeparator);
    }
}

export class TextChunk {
    text : string;
    rect : Rectangle;
    alignedRect : Rectangle;

    constructor(shape : ShapeCommand) {
        this.text = shape.unicode;
        this.rect = new Rectangle(shape.rect.x, shape.rect.y, shape.rect.width, shape.rect.height);
        this.alignedRect = this.getAlignedBounds(shape);
    }

    /**
     * 
     * @returns The average width of the letter composing the chunk
     */
    getLetterWidth() {
        return this.alignedRect.width / this.text.length;
    }

    /**
     * Exracts the rotation angle from a shape
     * @param {ShapeCommand} shape 
     * @returns {Number} the angle in radians
     */
    extractAngle(shape : ShapeCommand) : number {
        // We apply the transform and then measure the angle
        const p0 = shape.transformPos(0, 0);
        const p1 = shape.transformPos(1, 0);
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        return Math.atan2(dy, dx);
    }
    
    /**
     * Compute the aligned bouding box (i.e. not oriented)
     * @param {ShapeCommand} shape 
     * @returns {Rectangle} 
     */
    getAlignedBounds(shape : ShapeCommand) : Rectangle {
        const bounds = shape.rect;
        const angle = this.extractAngle(shape);
        
		if (angle === 0) {
			return new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height);
        }
        
        let transfo = new DOMMatrix();
        transfo = transfo.rotateSelf(-angle * (180/Math.PI)); // rotateSelf takes degrees
        
		const ptA = new DOMPoint(bounds.x, bounds.y);
		const ptB = new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height);
		
		const ptDestA = ptA.matrixTransform(transfo);
        const ptDestB = ptB.matrixTransform(transfo);
        
		const ox = Math.min(ptDestA.x, ptDestB.x);
		const oy = Math.min(ptDestA.y, ptDestB.y);
		const width = Math.abs(ptDestA.x - ptDestB.x);
		const height = Math.abs(ptDestA.y - ptDestB.y);
		
		return new Rectangle(ox, oy, width, height);
    }

    add(chunk : TextChunk) : void {
        this.text += chunk.text;
        this.alignedRect.add(chunk.alignedRect);
        this.rect.add(chunk.rect);
    }
}

class TextLine {
    textChunks : TextChunk[];
    alignedRect : Rectangle;
    _totalAvgLetterWidth : number;

    constructor(initialChunk : TextChunk) {
        this.textChunks = [initialChunk];
        this.alignedRect = initialChunk.alignedRect.clone();
        this._totalAvgLetterWidth = initialChunk.getLetterWidth();
    }

    addTextChunk(chunk : TextChunk) : void {
        this.textChunks.push(chunk);
        this.alignedRect.add(chunk.alignedRect);
        this._totalAvgLetterWidth += chunk.getLetterWidth();
    }

    /**
     * Test if a TextChunk is on this line
     * @param chunk the chunk that is being tested
     * @returns True if the TextChunk belongs to the line
     */
    isOnLine(chunk : TextChunk) : boolean {
        // Belongs to the line if there is a height overlap
        const a = chunk.alignedRect.top;
        const b = chunk.alignedRect.bottom;
        const c = this.alignedRect.top;
        const d = this.alignedRect.bottom;
        return  Math.max(0, Math.min(b, d) - Math.max(a, c)) !== 0;
    }

    getWords() {
        const avgLetterWidth = this._totalAvgLetterWidth / this.textChunks.length;

        // We split everytime the space between two letter is more than the width of an average letter
        const words = [this.textChunks[0]];

        for (let i = 1; i < this.textChunks.length; ++i) {
            const chunk = this.textChunks[i];
            const lastChunk = words[words.length-1];
            const space = chunk.alignedRect.left - lastChunk.alignedRect.right;
            if (space >= avgLetterWidth) {
                words.push(chunk);
            } else {
                lastChunk.add(chunk);
            }
        }

        return words;
    }
}