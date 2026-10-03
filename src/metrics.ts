import { Metrics } from './interfaces.js';
import { ContiguousMemoryManager } from './memory-manager.js';

export class MetricsCalculator {
  public constructor(private readonly memory: ContiguousMemoryManager) {}
  public calculate(contextSwitches: number, ticksElapsed: number, busyTicks: number): Metrics {
    const free = this.memory.freeMemory();
    const largest = this.memory.largestFreeBlock();
    return {
      memoryOccupancy: 100 * (1 - free / this.memory.totalSize),
      cpuUtilization: ticksElapsed === 0 ? 0 : 100 * busyTicks / ticksElapsed,
      contextSwitches,
      totalFreeMemory: free,
      largestFreeBlock: largest,
      externalFragmentation: free === 0 ? 0 : 100 * (1 - largest / free)
    };
  }
}
