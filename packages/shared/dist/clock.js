export class SystemClock {
    now() {
        return new Date();
    }
}
export class FixedClock {
    current;
    constructor(current) {
        this.current = current;
    }
    now() {
        return new Date(this.current.getTime());
    }
    set(value) {
        this.current = value;
    }
}
//# sourceMappingURL=clock.js.map