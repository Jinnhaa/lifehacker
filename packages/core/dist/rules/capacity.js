export const calculateCapacity = (input) => {
    const remainingCapacity = input.availableMinutes - input.plannedTaskMinutes - input.protectedRoutineMinutes - input.bufferMinutes;
    return {
        remainingCapacity,
        overCapacity: remainingCapacity < 0,
        overloadMinutes: Math.max(-remainingCapacity, 0)
    };
};
//# sourceMappingURL=capacity.js.map