export interface CapacityInput {
    readonly availableMinutes: number;
    readonly plannedTaskMinutes: number;
    readonly protectedRoutineMinutes: number;
    readonly bufferMinutes: number;
}
export interface CapacityResult {
    readonly remainingCapacity: number;
    readonly overCapacity: boolean;
    readonly overloadMinutes: number;
}
export declare const calculateCapacity: (input: CapacityInput) => CapacityResult;
//# sourceMappingURL=capacity.d.ts.map