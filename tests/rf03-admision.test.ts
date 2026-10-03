import { describe, expect, it } from 'vitest';
import { ProcessState, Simulator } from '../src/index.js';

describe('RF03 - Estados de Proceso y Admisión a Memoria', () => {
  it('envía a la cola de espera de memoria cuando no hay bloque contiguo disponible', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);

    simulator.registerProcess('A', 40, 1);
    simulator.registerProcess('B', 40, 1);
    simulator.registerProcess('C', 30, 1);

    expect(simulator.getProcess('C').state).toBe(ProcessState.ESPERANDO_MEMORIA);
    expect(simulator.state().waitingForMemory).toEqual(['C']);
  });

  it('admite automáticamente los procesos en espera cuando se libera suficiente memoria', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);

    simulator.registerProcess('A', 40, 1);
    simulator.registerProcess('B', 40, 1);
    simulator.registerProcess('C', 30, 1);

    // Tick 1: A finaliza y libera memoria.
    simulator.tick();
    expect(simulator.state().terminated).toContain('A');

    // Tick 2: Al inicio del tick 2 se procesa la admisión de espera; C cabe y pasa a LISTO.
    simulator.tick();
    expect(simulator.state().waitingForMemory).toEqual([]);
    expect(simulator.getProcess('C').state).not.toBe(ProcessState.ESPERANDO_MEMORIA);
  });

  it('mantiene en espera a un proceso si la memoria liberada sigue siendo insuficiente', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);

    simulator.registerProcess('A', 20, 1);
    simulator.registerProcess('B', 30, 2);
    simulator.registerProcess('C', 60, 1); // C requiere 60, disponible es 50 (100 - 20 - 30)

    expect(simulator.state().waitingForMemory).toEqual(['C']);

    // Finalizar A liberando 20 (disponible total ahora = 70, pero A dejó 20 libre a [0,20] y el otro bloque libre es 50 a [50,50])
    simulator.tick();
    expect(simulator.state().terminated).toContain('A');
    // Ningún bloque contiguo tiene 60 (bloque 1 tiene 20, bloque 2 tiene 50)
    simulator.tick();
    expect(simulator.state().waitingForMemory).toEqual(['C']);
  });
});
