import { describe, expect, it } from 'vitest';
import { Process, ProcessState, Simulator } from '../src/index.js';

describe('RF08 - Eventos de Entrada / Salida (E/S) Deterministas', () => {
  it('bloquea el proceso tras ejecutar N ticks de CPU, libera CPU y regresa a LISTO tras su duración', () => {
    const simulator = new Simulator();
    simulator.configure(100, 5);

    // P1 tiene E/S tras 2 ticks de CPU con duración de 2 ticks
    simulator.registerProcess('P1', 10, 4, { afterCpuTicks: 2, duration: 2 });
    simulator.registerProcess('P2', 10, 2);

    // Tick 1 y Tick 2: P1 ejecuta sus 2 ticks de CPU
    simulator.tick();
    simulator.tick();

    // Después del 2do tick de CPU, P1 pasa a BLOQUEADO y libera la CPU
    expect(simulator.getProcess('P1').state).toBe(ProcessState.BLOQUEADO);
    expect(simulator.state().cpuProcess).toBeUndefined();
    expect(simulator.state().blocked).toContain('P1');

    // Tick 3: P1 consume 1 tick de bloqueo (queda 1)
    simulator.tick();
    expect(simulator.getProcess('P1').blockedRemaining).toBe(1);

    // Tick 4: P1 finaliza su bloqueo y vuelve a estado LISTO
    simulator.tick();
    expect(simulator.getProcess('P1').state).toBe(ProcessState.LISTO);
    expect(simulator.state().ready).toContain('P1');
  });

  it('rechaza una configuración de evento E/S inválida (afterCpuTicks >= cpuTime o duration <= 0)', () => {
    expect(() => new Process('P', 10, 3, { afterCpuTicks: 3, duration: 1 })).toThrow(
      'El evento de E/S debe ocurrir antes de finalizar'
    );
    expect(() => new Process('P', 10, 3, { afterCpuTicks: 1, duration: 0 })).toThrow(
      'La duración de E/S debe ser positiva'
    );
  });
});
