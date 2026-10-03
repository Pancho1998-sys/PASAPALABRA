import { describe, expect, it } from 'vitest';
import { AllocationPolicy, ContiguousMemoryManager } from '../src/index.js';

describe('RF04 - Asignación de Memoria Contigua (First-Fit, Best-Fit, Worst-Fit)', () => {
  it('First-Fit elige el primer bloque libre con suficiente tamaño', () => {
    const memory = new ContiguousMemoryManager(100);
    memory.allocate('A', 20, AllocationPolicy.FIRST_FIT);
    memory.allocate('B', 30, AllocationPolicy.FIRST_FIT);
    memory.release('A');
    memory.allocate('C', 15, AllocationPolicy.FIRST_FIT);

    expect(memory.blocks().map(b => [b.start, b.size, b.pid])).toEqual([
      [0, 15, 'C'],
      [15, 5, undefined],
      [20, 30, 'B'],
      [50, 50, undefined],
    ]);
  });

  it('Best-Fit elige el bloque libre de menor tamaño suficiente', () => {
    const memory = new ContiguousMemoryManager(100);
    // Asignar bloques A, B, C, D
    memory.allocate('A', 20, AllocationPolicy.FIRST_FIT); // [0, 20]
    memory.allocate('B', 30, AllocationPolicy.FIRST_FIT); // [20, 30]
    memory.allocate('C', 10, AllocationPolicy.FIRST_FIT); // [50, 10]
    memory.allocate('D', 40, AllocationPolicy.FIRST_FIT); // [60, 40]

    // Liberar B (30) y D (40), dejando dos huecos libres de tamaño 30 y 40 respectivamente.
    memory.release('B'); // Libre [20, 30]
    memory.release('D'); // Libre [60, 40]

    // Solicitamos 25 unidades usando Best-Fit. Debe elegir el hueco de 30 (el menor suficiente), no el de 40.
    memory.allocate('E', 25, AllocationPolicy.BEST_FIT);

    const blockE = memory.blocks().find(b => b.pid === 'E');
    expect(blockE).toBeDefined();
    expect(blockE?.start).toBe(20);
    expect(blockE?.size).toBe(25);
  });

  it('Worst-Fit elige el bloque libre de mayor tamaño suficiente', () => {
    const memory = new ContiguousMemoryManager(100);
    // Asignar bloques A, B, C, D
    memory.allocate('A', 20, AllocationPolicy.FIRST_FIT); // [0, 20]
    memory.allocate('B', 30, AllocationPolicy.FIRST_FIT); // [20, 30]
    memory.allocate('C', 10, AllocationPolicy.FIRST_FIT); // [50, 10]
    memory.allocate('D', 40, AllocationPolicy.FIRST_FIT); // [60, 40]

    // Liberar B (30) y D (40), dejando dos huecos libres de tamaño 30 y 40 respectivamente.
    memory.release('B'); // Libre [20, 30]
    memory.release('D'); // Libre [60, 40]

    // Solicitamos 15 unidades usando Worst-Fit. Debe elegir el hueco de 40 (el mayor), no el de 30.
    memory.allocate('E', 15, AllocationPolicy.WORST_FIT);

    const blockE = memory.blocks().find(b => b.pid === 'E');
    expect(blockE).toBeDefined();
    expect(blockE?.start).toBe(60);
    expect(blockE?.size).toBe(15);
  });

  it('no modifica los bloques existentes si la asignación falla por falta de espacio', () => {
    const memory = new ContiguousMemoryManager(100);
    memory.allocate('A', 60, AllocationPolicy.FIRST_FIT);
    memory.allocate('B', 20, AllocationPolicy.FIRST_FIT);

    const snapshotAntes = memory.blocks().map(b => [b.start, b.size, b.pid]);
    const exito = memory.allocate('C', 25, AllocationPolicy.FIRST_FIT);

    expect(exito).toBe(false);
    expect(memory.blocks().map(b => [b.start, b.size, b.pid])).toEqual(snapshotAntes);
  });

  it('lanza error si se intenta asignar con tamaño <= 0 o no entero', () => {
    const memory = new ContiguousMemoryManager(100);
    expect(() => memory.allocate('A', 0, AllocationPolicy.FIRST_FIT)).toThrow();
    expect(() => memory.allocate('A', -10, AllocationPolicy.FIRST_FIT)).toThrow();
    expect(() => memory.allocate('A', 10.5, AllocationPolicy.FIRST_FIT)).toThrow();
  });

  it('lanza error si se intenta asignar a un PID que ya posee memoria', () => {
    const memory = new ContiguousMemoryManager(100);
    memory.allocate('A', 20, AllocationPolicy.FIRST_FIT);
    expect(() => memory.allocate('A', 10, AllocationPolicy.FIRST_FIT)).toThrow('PID A ya posee memoria');
  });
});
