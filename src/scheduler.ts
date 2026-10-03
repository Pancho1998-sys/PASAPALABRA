import { Scheduler } from './interfaces.js';
import { Process } from './process.js';

export class RoundRobinScheduler implements Scheduler {
  private queue: Process[] = [];
  private running?: Process;
  public constructor(public readonly quantum: number) {
    if (!Number.isInteger(quantum) || quantum <= 0) throw new Error('El quantum debe ser positivo');
  }
  public enqueue(process: Process): void { if (!this.queue.includes(process) && this.running !== process) this.queue.push(process); }
  public readyQueue(): readonly Process[] { return [...this.queue]; }
  public current(): Process | undefined { return this.running; }
  public dispatch(): Process | undefined {
    if (this.running || !this.queue.length) return this.running;
    const p = this.queue.shift()!;
    p.dispatch();
    this.running = p;
    return p;
  }
  public onCpuTick(): void { this.running?.executeCpuUnit(); }
  public shouldRotate(): boolean { return !!this.running && this.running.quantumConsumed >= this.quantum; }
  public rotate(): void {
    if (!this.running) return;
    const p = this.running;
    this.running = undefined;
    p.rotateToReady();
    this.queue.push(p);
  }
  public clearCurrent(): void { this.running = undefined; }
}
