export class MemoryBlock {
  public constructor(
    public readonly start: number,
    public readonly size: number,
    private ownerPid?: string
  ) {
    if (!Number.isInteger(start) || start < 0) throw new Error('El inicio debe ser un entero no negativo');
    if (!Number.isInteger(size) || size <= 0) throw new Error('El tamaño debe ser un entero positivo');
  }

  public get free(): boolean { return this.ownerPid === undefined; }
  public get pid(): string | undefined { return this.ownerPid; }

  public assign(pid: string): void {
    if (!this.free) throw new Error('El bloque ya está ocupado');
    this.ownerPid = pid;
  }

  public release(): void { this.ownerPid = undefined; }

  public split(allocatedSize: number, pid: string): MemoryBlock[] {
    if (!this.free || allocatedSize <= 0 || allocatedSize > this.size) throw new Error('Partición inválida');
    const allocated = new MemoryBlock(this.start, allocatedSize, pid);
    const remaining = this.size - allocatedSize;
    return remaining === 0
      ? [allocated]
      : [allocated, new MemoryBlock(this.start + allocatedSize, remaining)];
  }
}
