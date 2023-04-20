
import { makeAutoObservable, observable } from "mobx";

export enum DragItemType {
    NONE,
    CHARAGRAPH
}

export class DragnDropModel {
    draggedItem : any;
    draggedItemType = observable.box(DragItemType.NONE);

    constructor() {
        this.draggedItem = null;
        makeAutoObservable(this);
    }

    setDraggedItem(item : any, itemType : DragItemType) {
        this.draggedItem = item;
        this.draggedItemType.set(itemType);
    }

    resetDraggedItem() {
        this.draggedItem = null;
        this.draggedItemType.set(DragItemType.NONE);
    }

    isDragged(itemType : DragItemType) {
        return this.draggedItemType.get() === itemType;
    }
}

export const dragndropModel = new DragnDropModel();