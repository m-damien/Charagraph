import { makeAutoObservable, observable } from "mobx"
import { CharagraphBase } from "./CharagraphModel";
import { Selection } from "./datastructure/Selection";
import { ValueExtractor } from "./ValueExtractor";

export class PageContent {
    id : number;
    text : string;
    indexToShape : any;

    constructor(id, text, indexToShape) {
        this.id = id;
        this.text = text;
        this.indexToShape = indexToShape;
    }
}

export class MatchGroup {
    matches : Set<Selection>;
    suffix : string;
    prefix : string;

    constructor(matches : Set<Selection>, prefix : string, suffix : string) {
        this.matches = matches;
        this.prefix = prefix;
        this.suffix = suffix;
    }

    isEqual(group : MatchGroup) : boolean {
        return this.matches.size === group.matches.size && Array.from(this.matches).every(element => {return group.matches.has(element);});
    }

    merge(group : MatchGroup) : MatchGroup {
        const suffix = group.suffix.length > this.suffix.length ? group.suffix : this.suffix;
        const prefix = group.prefix.length > this.prefix.length ? group.prefix : this.prefix;

        return new MatchGroup(new Set([...this.matches, ...group.matches]), prefix, suffix);
    }
}

export class Model {
    pageContent : PageContent[];
    charagraphs : CharagraphBase[];
    currentIndex = observable.box(-1);
    currentPageId = observable.box(-1);
    isCharagraphEnabled = observable.box(true);

    constructor() {
        this.pageContent = [];
        this.charagraphs = [];
        makeAutoObservable(this);
    }

    setPageText(pageIdx : number, text : string, indexToShapeMapping : any) : void {
        while (this.pageContent.length <= pageIdx) {
            this.pageContent.push(new PageContent(undefined, undefined, undefined));
        }

        this.pageContent[pageIdx] = new PageContent(pageIdx, text, indexToShapeMapping);
    }

    addCharagraph(charagraph : CharagraphBase) : void {
        this.charagraphs.push(charagraph);
    }

    removeCharagraph(charagraph : CharagraphBase) : void {
        const idx = this.charagraphs.indexOf(charagraph);
        this.charagraphs.splice(idx, 1);
    }

    addRelatedSelection(page : number, mainSelection : Selection, start : number, end : number) {
        // Not implemented for Charagraph
    }

    clearCharagraphs() {
        (this.charagraphs as any).replace([]);
    }

    /**
     * Set the position in text of what is currently being read
     * Will update the Charagraphs accordingly
     * @param index 
     */
    setCurrentReadingPosition(index : number, pageId : number, x : number, y : number) : void {
        this.currentIndex.set(index);
        this.currentPageId.set(pageId);
        for (const charagraph of this.charagraphs) {
            charagraph.setCurrentPosition(index, x, y);
        }
    }

    getCurrentExcerpt(startStopperRegex : RegExp, endStopperRegex : RegExp) : {start: number, end: number, text: string} {
        if (this.currentIndex.get() >= 0 && this.currentPageId.get() >= 0) {
            const text = this.pageContent[this.currentPageId.get()].text;
            const index = this.currentIndex.get();

            let match = null
            const startIndexes = [[0, 0]];
            const startText = text.slice(0, index);
            while ((match = startStopperRegex.exec(startText)))
                startIndexes.push([match.index, match.index+match[0].length])

            const endIndexes = [];
            const endText = text.slice(index, text.length);
            while ((match = endStopperRegex.exec(endText))) {
                endIndexes.push([match.index+index, match.index+match[0].length+index]);
                break;
            }
            endIndexes.push([text.length, text.length]);

            const startIdx = startIndexes[startIndexes.length-1][1];
            const endIdx = endIndexes[0][1];

            return {start: startIdx, end: endIdx, text: text.slice(startIdx, endIdx)};
        }

        return null;
    }

    getCurrentWordValue() : {start: number, end: number, text: string} {
        if (this.currentIndex.get() >= 0 && this.currentPageId.get() >= 0) {
            const text = this.pageContent[this.currentPageId.get()].text;
            const index = this.currentIndex.get();
            let match = null;
            while ((match = ValueExtractor.regexp.exec(text))) {
                if (index >= match.index && index <= match.index+match[0].length) {
                    return  {start: match.index, end: match.index+match[0].length, text: text.slice(match.index, match.index+match[0].length)}
                }
            }
        }

        return null;
    }

    getCurrentMatch() : {match: Selection, charagraph: CharagraphBase} {
        if (this.currentIndex.get() >= 0 && this.currentPageId.get() >= 0) {
            for (const charagraph of this.charagraphs) {
                for (const match of charagraph.getMatches()) {
                    if (match.start <= this.currentIndex.get() && this.currentIndex.get() <= match.end) {
                        return {match: match, charagraph: charagraph};
                    }
                }
            }
        }

        return null;
    }

    getCurrentWord() : {start: number, end: number, text: string} {
        return this.getCurrentExcerpt(new RegExp(/[^\w]/, 'g'), new RegExp(/[^\w]/, 'g'));
    }

    getCurrentSentence() : {start: number, end: number, text: string} {
        return this.getCurrentExcerpt(new RegExp(/[^\d]\.[^\d]/, 'g'), new RegExp(/[^\d]\.[^\d]/, 'g'));
    }
}

export const model = new Model();