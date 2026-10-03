import { AllocationPolicy, ProcessState } from './enums.js';
import { Metrics, SimulationSnapshot } from './interfaces.js';
import { ContiguousMemoryManager } from './memory-manager.js';
import { MetricsCalculator } from './metrics.js';
import { Process } from './process.js';
import { RoundRobinScheduler } from './scheduler.js';

export class Simulator {
  private processes = new Map<string, Process>();
  private waiting: Process[] = [];
  private blocked: Process[] = [];
  private terminated: Process[] = [];
  private _tick = 0;
  private busyTicks = 0;
  private contextSwitches = 0;
  private memory!: ContiguousMemoryManager;
  private scheduler!: RoundRobinScheduler;
  private metricsCalculator!: MetricsCalculator;
  private started = false;

  public constructor(private readonly allocationPolicy: AllocationPolicy = AllocationPolicy.FIRST_FIT) {}

  public configure(totalMemory: number, quantum: number): void {
    if (!Number.isInteger(totalMemory) || totalMemory <= 0) throw new Error('La memoria total debe ser positiva');
    if (!Number.isInteger(quantum) || quantum <= 0) throw new Error('El quantum debe ser positivo');
    this.memory = new ContiguousMemoryManager(totalMemory);
    this.scheduler = new RoundRobinScheduler(quantum);
    this.metricsCalculator = new MetricsCalculator(this.memory);
    this.processes.clear(); this.waiting = []; this.blocked = []; this.terminated = [];
    this._tick = 0; this.busyTicks = 0; this.contextSwitches = 0; this.started = true;
  }

  public registerProcess(pid: string, memoryRequired: number, cpuTime: number, ioEvent?: {afterCpuTicks:number; duration:number}): void {
    this.ensureStarted();
    if (this.processes.has(pid)) throw new Error(`PID ${pid} duplicado`);
    if (memoryRequired > this.memory.totalSize) throw new Error('La memoria requerida supera la memoria total');
    const p = new Process(pid, memoryRequired, cpuTime, ioEvent);
    this.processes.set(pid, p);
    if (this.memory.allocate(pid, memoryRequired, this.allocationPolicy)) p.admit();
    else { p.waitForMemory(); this.waiting.push(p); }
    if (p.state === ProcessState.LISTO) this.scheduler.enqueue(p);
  }

  public tick(): void {
    this.ensureStarted();
    this.admitWaitingProcesses();
    this.updateBlockedProcesses();
    this.dispatchIfNeeded();
    const running = this.scheduler.current();
    if (running) {
      this.scheduler.onCpuTick();
      this.busyTicks++;
      if (running.remainingCpu === 0) {
        running.finish();
        this.memory.release(running.pid);
        this.terminated.push(running);
        this.scheduler.clearCurrent();
      } else if (running.shouldBlockForIo()) {
        running.blockForIo();
        this.blocked.push(running);
        this.scheduler.clearCurrent();
        if (this.scheduler.readyQueue().length > 0) this.contextSwitches++;
      } else if (this.scheduler.shouldRotate()) {
        if (this.scheduler.readyQueue().length > 0) {
          this.scheduler.rotate();
          this.contextSwitches++;
        } else {
          running.renewQuantum();
        }
      }
    }
    this._tick++;
  }

  public state(): SimulationSnapshot {
    this.ensureStarted();
    return {
      tick: this._tick,
      cpuProcess: this.scheduler.current()?.pid,
      ready: this.scheduler.readyQueue().map(p=>p.pid),
      waitingForMemory: this.waiting.map(p=>p.pid),
      blocked: this.blocked.map(p=>p.pid),
      terminated: this.terminated.map(p=>p.pid),
      memory: this.memory.blocks().map(b=>({start:b.start,size:b.size,free:b.free,pid:b.pid})),
      metrics: this.metrics()
    };
  }

  public metrics(): Metrics {
    this.ensureStarted();
    return this.metricsCalculator.calculate(this.contextSwitches, this._tick, this.busyTicks);
  }

  public getProcess(pid: string): Readonly<Process> {
    this.ensureStarted();
    const p = this.processes.get(pid);
    if (!p) throw new Error(`No existe el PID ${pid}`);
    return p;
  }

  private admitWaitingProcesses(): void {
    for (let i = 0; i < this.waiting.length;) {
      const p = this.waiting[i];
      if (this.memory.allocate(p.pid, p.memoryRequired, this.allocationPolicy)) {
        p.admit(); this.scheduler.enqueue(p); this.waiting.splice(i,1);
      } else i++;
    }
  }

  private updateBlockedProcesses(): void {
    for (let i = 0; i < this.blocked.length;) {
      const p = this.blocked[i];
      if (p.updateBlocked()) { this.scheduler.enqueue(p); this.blocked.splice(i,1); }
      else i++;
    }
  }

  private dispatchIfNeeded(): void { if (!this.scheduler.current()) this.scheduler.dispatch(); }
  private ensureStarted(): void { if (!this.started) throw new Error('La simulación no fue configurada'); }
}
