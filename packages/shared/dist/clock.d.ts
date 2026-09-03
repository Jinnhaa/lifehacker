export interface Clock {
    now(): Date;
}
export declare class SystemClock implements Clock {
    now(): Date;
}
export declare class FixedClock implements Clock {
    private current;
    constructor(current: Date);
    now(): Date;
    set(value: Date): void;
}
//# sourceMappingURL=clock.d.ts.map