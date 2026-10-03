import { describe, expect, it } from 'vitest';
import { Simulator } from '../src/index.js';

describe('RF10 - Consultas de Estado e Invariantes', () => {
  it('devuelve copias defensivas de las colas de procesos y de los bloques de memoria', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);
    simulator.registerProcess('P1', 20, 1);

    const snapshot = simulator.state();

    // Modificar la copia local
    snapshot.ready.push('PROCESO_FALSO');
    snapshot.memory[0].size = 999;

    // Verificar que el estado interno del simulador permanece inalterado
    expect(simulator.state().ready).not.toContain('PROCESO_FALSO');
    expect(simulator.state().memory[0].size).toBe(20);
  });

  it('permite consultar las métricas del sistema mediante metrics() sin alterar el estado', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);
    simulator.registerProcess('P1', 50, 2);

    const metrics1 = simulator.metrics();
    const metrics2 = simulator.metrics();

    expect(metrics1).toEqual(metrics2);
    expect(metrics1.memoryOccupancy).toBe(50);
  });
});
