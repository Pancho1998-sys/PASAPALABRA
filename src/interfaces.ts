import { AllocationPolicy, ProcessState } from './enums.js';
import { Process } from './process.js';
import { MemoryBlock } from './memory-block.js';

export interface IoEvent {
  afterCpuTicks: number;
  duration: number;
}

export interface MemoryView {
  start: number;
  size: number;
  free: boolean;
  pid?: string;
}

export interface Metrics {
  memoryOccupancy: number;
  cpuUtilization: number;
  contextSwitches: number;
  totalFreeMemory: number;
  largestFreeBlock: number;
  externalFragmentation: number;
}

export interface MemoryManager {
  readonly totalSize: number;
  allocate(pid: string, size: number, policy: AllocationPolicy): boolean;
  release(pid: string): void;
  blocks(): readonly MemoryBlock[];
  freeMemory(): number;
  largestFreeBlock(): number;
}

export interface Scheduler {
  readonly quantum: number;
  enqueue(process: Process): void;
  readyQueue(): readonly Process[];
  current(): Process | undefined;
  dispatch(): Process | undefined;
  onCpuTick(): void;
  shouldRotate(): boolean;
  rotate(): void;
  clearCurrent(): void;
}

export interface SimulationSnapshot {
  tick: number;
  cpuProcess?: string;
  ready: string[];
  waitingForMemory: string[];
  blocked: string[];
  terminated: string[];
  memory: MemoryView[];
  metrics: Metrics;
}
