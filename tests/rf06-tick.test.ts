import { describe, expect, it } from 'vitest';
import { ProcessState, Simulator } from '../src/index.js';

describe('RF06 - Simulación por Ticks Deterministas', () => {
  it('incrementa el contador de ticks en 1 con cada llamada a tick()', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);

    expect(simulator.state().tick).toBe(0);
    simulator.tick();
    expect(simulator.state().tick).toBe(1);
    simulator.tick();
    expect(simulator.state().tick).toBe(2);
  });

  it('ejecuta 1 unidad de CPU del proceso actual en cada tick', () => {
    const simulator = new Simulator();
    simulator.configure(100, 5);
    simulator.registerProcess('P1', 20, 3);

    simulator.tick();
    expect(simulator.getProcess('P1').remainingCpu).toBe(2);

    simulator.tick();
    expect(simulator.getProcess('P1').remainingCpu).toBe(1);
  });

  it('pasa el proceso a TERMINADO cuando agota todo su tiempo de CPU', () => {
    const simulator = new Simulator();
    simulator.configure(100, 5);
    simulator.registerProcess('P1', 20, 2);

    simulator.tick();
    simulator.tick();

    expect(simulator.getProcess('P1').state).toBe(ProcessState.TERMINADO);
    expect(simulator.getProcess('P1').remainingCpu).toBe(0);
    expect(simulator.state().terminated).toContain('P1');
  });

  it('libera la memoria inmediatamente en el mismo tick en que finaliza el proceso', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);
    simulator.registerProcess('P1', 60, 1);

    simulator.tick();

    expect(simulator.getProcess('P1').state).toBe(ProcessState.TERMINADO);
    expect(simulator.state().memory).toEqual([
      { start: 0, size: 100, free: true, pid: undefined }
    ]);
  });
});
