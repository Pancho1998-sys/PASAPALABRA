import { IoEvent } from './interfaces.js';
import { ProcessState } from './enums.js';

export class Process {
  private _state = ProcessState.NUEVO;
  private _remainingCpu: number;
  private _quantumConsumed = 0;
  private _blockedRemaining = 0;
  private _cpuTicksExecuted = 0;
  private _ioEvent?: IoEvent;
  private _ioTriggered = false;

  public constructor(
    public readonly pid: string,
    public readonly memoryRequired: number,
    public readonly totalCpuTime: number,
    ioEvent?: IoEvent
  ) {
    if (!pid.trim()) throw new Error('PID inválido');
    if (!Number.isInteger(memoryRequired) || memoryRequired <= 0) throw new Error('La memoria requerida debe ser positiva');
    if (!Number.isInteger(totalCpuTime) || totalCpuTime <= 0) throw new Error('El tiempo de CPU debe ser positivo');
    if (ioEvent) {
      if (!Number.isInteger(ioEvent.afterCpuTicks) || ioEvent.afterCpuTicks <= 0) throw new Error('afterCpuTicks debe ser positivo');
      if (!Number.isInteger(ioEvent.duration) || ioEvent.duration <= 0) throw new Error('La duración de E/S debe ser positiva');
      if (ioEvent.afterCpuTicks >= totalCpuTime) throw new Error('El evento de E/S debe ocurrir antes de finalizar');
    }
    this._remainingCpu = totalCpuTime;
    this._ioEvent = ioEvent;
  }

  public get state(): ProcessState { return this._state; }
  public get remainingCpu(): number { return this._remainingCpu; }
  public get quantumConsumed(): number { return this._quantumConsumed; }
  public get blockedRemaining(): number { return this._blockedRemaining; }
  public get cpuTicksExecuted(): number { return this._cpuTicksExecuted; }

  public admit(): void { this.transition([ProcessState.NUEVO, ProcessState.ESPERANDO_MEMORIA], ProcessState.LISTO); }
  public waitForMemory(): void { this.transition([ProcessState.NUEVO, ProcessState.LISTO], ProcessState.ESPERANDO_MEMORIA); }
  public dispatch(): void { this.transition([ProcessState.LISTO], ProcessState.EJECUTANDO); this._quantumConsumed = 0; }
  public executeCpuUnit(): void {
    if (this._state !== ProcessState.EJECUTANDO) throw new Error('Solo el proceso ejecutando puede consumir CPU');
    this._remainingCpu--;
    this._cpuTicksExecuted++;
    this._quantumConsumed++;
  }
  public shouldBlockForIo(): boolean {
    return !!this._ioEvent && !this._ioTriggered && this._cpuTicksExecuted >= this._ioEvent.afterCpuTicks && this._remainingCpu > 0;
  }
  public blockForIo(): void {
    if (!this.shouldBlockForIo()) throw new Error('No corresponde bloquear por E/S');
    this._ioTriggered = true;
    this._blockedRemaining = this._ioEvent!.duration;
    this._state = ProcessState.BLOQUEADO;
    this._quantumConsumed = 0;
  }
  public updateBlocked(): boolean {
    if (this._state !== ProcessState.BLOQUEADO) return false;
    this._blockedRemaining--;
    if (this._blockedRemaining <= 0) {
      this._blockedRemaining = 0;
      this._state = ProcessState.LISTO;
      this._quantumConsumed = 0;
      return true;
    }
    return false;
  }
  public finish(): void {
    if (this._remainingCpu !== 0) throw new Error('No se puede finalizar un proceso con CPU pendiente');
    this._state = ProcessState.TERMINADO;
    this._quantumConsumed = 0;
  }
  public rotateToReady(): void { this.transition([ProcessState.EJECUTANDO], ProcessState.LISTO); this._quantumConsumed = 0; }
  public renewQuantum(): void { if (this._state !== ProcessState.EJECUTANDO) throw new Error('El proceso no está ejecutando'); this._quantumConsumed = 0; }

  private transition(from: ProcessState[], to: ProcessState): void {
    if (!from.includes(this._state)) throw new Error(`Transición inválida: ${this._state} -> ${to}`);
    this._state = to;
  }
}
