import { describe, expect, it } from 'vitest';
import { AllocationPolicy, ContiguousMemoryManager, Simulator } from '../src/index.js';

describe('RF09 - Cálculo de Métricas del Sistema', () => {
  it('calcula la fragmentación externa correctamente (ejemplo 25% con bloques libres de 100 y 300)', () => {
    const memory = new ContiguousMemoryManager(1000);
    memory.allocate('A', 100, AllocationPolicy.FIRST_FIT);
    memory.allocate('B', 300, AllocationPolicy.FIRST_FIT);
    memory.allocate('C', 300, AllocationPolicy.FIRST_FIT);
    memory.allocate('D', 300, AllocationPolicy.FIRST_FIT);

    memory.release('A'); // Bloque libre 100
    memory.release('C'); // Bloque libre 300

    expect(memory.freeMemory()).toBe(400);
    expect(memory.largestFreeBlock()).toBe(300);
    // Fragmentación externa: 100 * (1 - 300 / 400) = 25%
    const frag = 100 * (1 - memory.largestFreeBlock() / memory.freeMemory());
    expect(frag).toBe(25);
  });

  it('reporta utilización de CPU en 0% en el tick 0', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);
    expect(simulator.metrics().cpuUtilization).toBe(0);
  });

  it('calcula la utilización de CPU correctamente según los ticks ocupados', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);
    simulator.registerProcess('P1', 20, 2);

    simulator.tick(); // Busy = 1, Tick = 1 -> 100%
    expect(simulator.metrics().cpuUtilization).toBe(100);

    simulator.tick(); // Busy = 2, Tick = 2 -> 100%
    simulator.tick(); // No hay procesos en CPU. Busy = 2, Tick = 3 -> 66.67%
    expect(simulator.metrics().cpuUtilization).toBeCloseTo(66.67, 1);
  });

  it('calcula la ocupación de memoria correctamente', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);
    simulator.registerProcess('P1', 40, 2);

    expect(simulator.metrics().memoryOccupancy).toBe(40);
  });
});
