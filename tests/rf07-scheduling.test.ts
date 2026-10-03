import { describe, expect, it } from 'vitest';
import { ProcessState, Simulator } from '../src/index.js';

describe('RF07 - Planificación Round Robin con Quantum', () => {
  it('planifica los procesos en orden FIFO y realiza expropiación al agotar el quantum', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2); // Quantum = 2

    simulator.registerProcess('P1', 10, 3);
    simulator.registerProcess('P2', 10, 2);

    // Tick 1: P1 se despacha y ejecuta 1 tick
    simulator.tick();
    expect(simulator.state().cpuProcess).toBe('P1');
    expect(simulator.getProcess('P1').remainingCpu).toBe(2);
    expect(simulator.state().ready).toEqual(['P2']);

    // Tick 2: P1 ejecuta su segundo tick, agota su Quantum (2) y rota al final de la cola ready
    simulator.tick();
    expect(simulator.state().ready).toEqual(['P2', 'P1']);
    expect(simulator.state().cpuProcess).toBeUndefined();

    // Tick 3: P2 se despacha y ejecuta 1 tick
    simulator.tick();
    expect(simulator.state().cpuProcess).toBe('P2');
    expect(simulator.getProcess('P2').remainingCpu).toBe(1);
    expect(simulator.state().ready).toEqual(['P1']);

    // Tick 4: P2 ejecuta su segundo tick (termina su CPU total de 2) y se finaliza
    simulator.tick();
    expect(simulator.getProcess('P2').state).toBe(ProcessState.TERMINADO);

    // Tick 5: P1 vuelve a CPU para su tick final sobrante y finaliza
    simulator.tick();
    expect(simulator.getProcess('P1').state).toBe(ProcessState.TERMINADO);
    expect(simulator.getProcess('P1').remainingCpu).toBe(0);
    expect(simulator.state().terminated).toContain('P1');
  });

  it('incrementa el contador de cambios de contexto al expropiar por Quantum', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);

    simulator.registerProcess('P1', 10, 3);
    simulator.registerProcess('P2', 10, 2);

    expect(simulator.metrics().contextSwitches).toBe(0);

    simulator.tick(); // Tick 1 (P1 en CPU)
    simulator.tick(); // Tick 2 (P1 rota por quantum -> context switch)

    expect(simulator.metrics().contextSwitches).toBe(1);
  });

  it('no fuerza un cambio de contexto si el proceso en CPU finaliza antes de completar el quantum', () => {
    const simulator = new Simulator();
    simulator.configure(100, 5); // Quantum = 5

    simulator.registerProcess('P1', 10, 2); // CPU time = 2 < Quantum

    simulator.tick();
    simulator.tick(); // Finaliza P1

    expect(simulator.getProcess('P1').state).toBe(ProcessState.TERMINADO);
  });
});
