export default class Rectangle {
    left : number;
    top : number;
    right : number;
    bottom : number;

    constructor(x : number, y : number, width : number, height : number) {
        this.left = x;
        this.top = y;
        this.right = x + width;
        this.bottom = y + height;
    }

    get x() : number {
        return this.left;
    }

    set x(v : number) {
        const width = this.width;
        this.left = v;
        this.right = v+width;
    }

    get y() : number {
        return this.top;
    }

    set y(v : number) {
        const height = this.height;
        this.top = v;
        this.bottom = v+height;
    }

    get width() : number {
        return this.right - this.left;
    }

    get height() : number {
        return this.bottom - this.top;
    }

    intersects(rect : any) : boolean {
        return (this.left < rect.x+rect.width && this.right > rect.x &&
            this.top < rect.y+rect.height && this.bottom > rect.y);
    }

    includes(rect : any) {
        return (this.x < rect.x && this.right > rect.x+rect.width &&
            this.y < rect.y && this.bottom > rect.y+rect.height);
    }

    alignsWith(rect : any) {
        const a = rect.top;
        const b = rect.bottom;
        const c = this.top;
        const d = this.bottom;
        return  Math.max(0, Math.min(b, d) - Math.max(a, c)) !== 0; // Aligns as long as there is a height overlap
    }

    add(rect : {x : number, y : number, width : number, height : number}) : void {
        this.left = Math.min(this.left, rect.x);
        this.top = Math.min(this.top, rect.y);
        this.right = Math.max(this.right, rect.width+rect.x);
        this.bottom = Math.max(this.bottom, rect.height+rect.y);
    }

    clone() : Rectangle {
        return new Rectangle(this.x, this.y, this.width, this.height);
    }
}