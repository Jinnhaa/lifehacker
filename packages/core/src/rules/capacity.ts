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

export const calculateCapacity = (input: CapacityInput): CapacityResult => {
  const remainingCapacity =
    input.availableMinutes - input.plannedTaskMinutes - input.protectedRoutineMinutes - input.bufferMinutes;
  return {
    remainingCapacity,
    overCapacity: remainingCapacity < 0,
    overloadMinutes: Math.max(-remainingCapacity, 0)
  };
};
