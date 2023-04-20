import Rectangle from "./Rectangle";

interface Chunk {
    page : number,
    start : number,
    end : number
}

export abstract class Selection {
    chunks : Chunk[];

    constructor(page : number, index : number, length : number) {
        this.chunks = [];
        this.addChunk(page, index, length);
    }

    addChunk(page : number, index : number, length : number) {
        this.chunks.push({page: page, start: index, end: index+length});
    }

    get _firstChunk() : Chunk {
        return this.chunks[0];
    }

    get _lastChunk() : Chunk {
        return this.chunks[this.chunks.length-1];
    }

    get start() : number {
        return this._firstChunk.start;
    }

    get end() : number {
        return this._lastChunk.end;
    }

    get page() : number {
        return this.chunks[0].page; //TODO: What if selection across pages?
    }

    contains(index : number) : boolean {
        return this.chunks.some(v => index >= v.start && index <= v.end);
    }

    getWordAtAbsoluteIndex(index : number) : string {
        for (const chunk of this.chunks) {
            if (index >= chunk.start && index <= chunk.end) {
                const text = this.chunkToText(chunk);
                const wordStopper = [" ", ".", ",", ":", ";", "(", ")", "\"", "?", "!"]
        
                let start = index-chunk.start;
                let end = index-chunk.start;

                for (let i = 0; i < 20; ++i) {if (wordStopper.includes(text.charAt(start--))) break};
                for (let i = 0; i < 20; ++i) {if (wordStopper.includes(text.charAt(end++))) break};
                return this.text.substring(start+2, end-1);
            }
        }

        return null;
    }

    abstract sourceText(page : number) : string;

    chunkToText(chunk) : string {
        return this.sourceText(chunk.page).substring(chunk.start, chunk.end);
    }

    get text() : string {
        return this.chunks.map(v => this.chunkToText(v)).join(" ");
    }

    abstract createSelection(page : number, index : number, length : number) : Selection;

    merge(selection : Selection) {
        const min = Math.min(this.start, selection.start);
        const max = Math.max(this.end, selection.end);
        //TODO: Proper merge if there is multiple chunks
        return this.createSelection(this.page, min, max-min);
    }

    /**
     * Create a subselection using relative indexing
     * @param start 
     * @param length 
     */
    subselect(start : number, length : number) : Selection {
        let index = 0;
        let selection : Selection = null;
        for (const chunk of this.chunks) {
            if (start+length >= index && chunk.end-chunk.start+index >= start) {
                // The selection intersect with this chunk. We add the (cropped if necessary) chunk to the subselection
                const croppedChunkStart = chunk.start+Math.max(0, start-index);
                const croppedChunkEnd = chunk.end-Math.max(0, ((chunk.end-chunk.start)+index)-(start+length));
                if (selection === null) {
                    selection = this.createSelection(chunk.page, croppedChunkStart, croppedChunkEnd-croppedChunkStart);
                } else {
                    selection.addChunk(chunk.page, croppedChunkStart, croppedChunkEnd-croppedChunkStart);
                }
            }
            index += chunk.end-chunk.start+1; // +1 to take into account space added when joining the chunks
        }
        return selection;
    }

    /**
     * Returns all the rectangles of all the letters in the selection
     */
    abstract get rects() : Rectangle[];

    /**
     * Returns the rectangle englobing the selection
     */
    get rect() : Rectangle {
        const rects = this.rects;
        if (rects.length === 0) {
            return new Rectangle(0, 0, 0, 0);
        }

        const rect = rects[0];
        for (let i = 1; i < rects.length; ++i) {
            rect.add(rects[i]);
        }

        return rect;
    }

    /**
     * Returns the bounding rectangle of each line composing the selection
     */
    get lineRects() : Rectangle[] {
        const rects = this.rects;
        const mergedLines = [];

        for (let i = 0; i < rects.length; ++i) {
            const rectangle = new Rectangle(rects[i].x, rects[i].y, rects[i].width, rects[i].height);

            // Try to merge the rectangle with one of the existing lines
            let found = false;
            for (const mergedLine of mergedLines) {
                if (mergedLine.alignsWith(rectangle)) {
                    mergedLine.add(rectangle)
                    found = true;
                    break;
                }
            }

            if (!found) {
                // Does not align with any existing line, we form a new line
                mergedLines.push(rectangle);
            }
        }

        return mergedLines;
    }


    /**
     * Calculates the rectangle of the source selection
     */
    get sourceRect() : Rectangle {
        const fullSelection = this.createSelection(this.page, 0, this.sourceText(this.page).length);
        
        return fullSelection.rect;
    }

    matchRegexp(regexp : RegExp, onMatch : (match: RegExpExecArray, absoluteIndex : number) => void) {
        let match : RegExpExecArray = null;
        let index = 0;
        for (const chunk of this.chunks) {
            const text = this.chunkToText(chunk);
            while ((match = regexp.exec(text)) != null) {
                const matchIndex = match.index;
                match.index += index;
                onMatch(match, chunk.start+matchIndex);
                match.index = matchIndex;
            }
            index += text.length+1; // Add 1 to take into account the space used when joining
        }
    }

    _ignoreSpaces(str : string, enabled = true) : string {
        return (enabled ? str.replace(/\s/g, "") : str);
    }

    isSuffixed(suffix : string, ignoreSpaces = false) : boolean {
        return this._ignoreSpaces(this.getSuffix(suffix.length), ignoreSpaces).startsWith(this._ignoreSpaces(suffix, ignoreSpaces));
    }

    isPrefixed(prefix : string, ignoreSpaces = false) : boolean {
        return  this._ignoreSpaces(this.getPrefix(prefix.length), ignoreSpaces).endsWith(this._ignoreSpaces(prefix, ignoreSpaces));
    }

    getPrefix(length : number) : string {
        return this.sourceText(this._firstChunk.page).substring(this.start-length, this.start);
    }

    getSuffix(length : number) : string {
        return this.sourceText(this._lastChunk.page).substring(this.end, this.end+length);
    }
}