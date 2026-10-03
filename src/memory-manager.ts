import { AllocationPolicy } from './enums.js';
import { MemoryManager } from './interfaces.js';
import { MemoryBlock } from './memory-block.js';

export class ContiguousMemoryManager implements MemoryManager {
  private _blocks: MemoryBlock[];
  public constructor(public readonly totalSize: number) {
    if (!Number.isInteger(totalSize) || totalSize <= 0) throw new Error('La memoria total debe ser positiva');
    this._blocks = [new MemoryBlock(0, totalSize)];
  }

  public blocks(): readonly MemoryBlock[] { return this._blocks.map(b => new MemoryBlock(b.start, b.size, b.pid)); }
  public allocate(pid: string, size: number, policy: AllocationPolicy): boolean {
    if (!Number.isInteger(size) || size <= 0) throw new Error('Tamaño de asignación inválido');
    if (this._blocks.some(b => b.pid === pid)) throw new Error(`PID ${pid} ya posee memoria`);
    const candidates = this._blocks.filter(b => b.free && b.size >= size);
    if (!candidates.length) return false;
    let chosen: MemoryBlock;
    if (policy === AllocationPolicy.FIRST_FIT) chosen = candidates[0];
    else if (policy === AllocationPolicy.BEST_FIT) chosen = [...candidates].sort((a,b) => a.size-b.size || a.start-b.start)[0];
    else chosen = [...candidates].sort((a,b) => b.size-a.size || a.start-b.start)[0];
    const idx = this._blocks.indexOf(chosen);
    const replacement = chosen.split(size, pid);
    this._blocks.splice(idx, 1, ...replacement);
    this.assertInvariants();
    return true;
  }

  public release(pid: string): void {
    const index = this._blocks.findIndex(b => b.pid === pid);
    if (index < 0) throw new Error(`No existe memoria asignada al PID ${pid}`);
    this._blocks[index].release();
    this.coalesce(index);
    this.assertInvariants();
  }

  public freeMemory(): number { return this._blocks.filter(b=>b.free).reduce((s,b)=>s+b.size,0); }
  public largestFreeBlock(): number { return this._blocks.filter(b=>b.free).reduce((m,b)=>Math.max(m,b.size),0); }

  private coalesce(index: number): void {
    let i = index;
    if (i > 0 && this._blocks[i-1].free) {
      const left = this._blocks[i-1];
      const current = this._blocks[i];
      this._blocks.splice(i-1, 2, new MemoryBlock(left.start, left.size + current.size));
      i--;
    }
    if (i < this._blocks.length - 1 && this._blocks[i+1].free) {
      const current = this._blocks[i];
      const right = this._blocks[i+1];
      this._blocks.splice(i, 2, new MemoryBlock(current.start, current.size + right.size));
    }
  }

  private assertInvariants(): void {
    if (!this._blocks.length) throw new Error('Debe existir al menos un bloque');
    let cursor = 0;
    for (const b of this._blocks) {
      if (b.start !== cursor) throw new Error('Los bloques deben ser contiguos y ordenados');
      cursor += b.size;
    }
    if (cursor !== this.totalSize) throw new Error('La memoria total no coincide');
  }
}
