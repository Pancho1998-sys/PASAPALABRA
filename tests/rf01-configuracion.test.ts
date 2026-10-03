import { describe, expect, it } from 'vitest';
import { Simulator } from '../src/index.js';

describe('RF01 - Configuración e Inicio', () => {
  it('inicializa la simulación en tick 0', () => {
    const simulator = new Simulator();
    simulator.configure(1024, 2);
    expect(simulator.state().tick).toBe(0);
  });

  it('inicializa la memoria como un único bloque libre del tamaño total', () => {
    const simulator = new Simulator();
    simulator.configure(1024, 2);
    expect(simulator.state().memory).toEqual([
      { start: 0, size: 1024, free: true }
    ]);
  });

  it('inicializa la CPU sin proceso asignado', () => {
    const simulator = new Simulator();
    simulator.configure(1024, 2);
    expect(simulator.state().cpuProcess).toBeUndefined();
  });

  it('inicializa las métricas del sistema en 0', () => {
    const simulator = new Simulator();
    simulator.configure(1024, 2);
    expect(simulator.metrics()).toMatchObject({
      memoryOccupancy: 0,
      cpuUtilization: 0,
      contextSwitches: 0,
      totalFreeMemory: 1024,
      largestFreeBlock: 1024,
      externalFragmentation: 0,
    });
  });

  it('rechaza configuración con tamaño de memoria <= 0 o no entero', () => {
    const simulator = new Simulator();
    expect(() => simulator.configure(0, 2)).toThrow();
    expect(() => simulator.configure(-100, 2)).toThrow();
    expect(() => simulator.configure(10.5, 2)).toThrow();
  });

  it('rechaza configuración con quantum <= 0 o no entero', () => {
    const simulator = new Simulator();
    expect(() => simulator.configure(1024, 0)).toThrow();
    expect(() => simulator.configure(1024, -2)).toThrow();
    expect(() => simulator.configure(1024, 1.5)).toThrow();
  });

  it('lanza un error si se intenta operar la simulación antes de configurarla', () => {
    const simulator = new Simulator();
    expect(() => simulator.state()).toThrow('La simulación no fue configurada');
    expect(() => simulator.tick()).toThrow('La simulación no fue configurada');
    expect(() => simulator.metrics()).toThrow('La simulación no fue configurada');
    expect(() => simulator.registerProcess('P1', 10, 2)).toThrow('La simulación no fue configurada');
  });
});
