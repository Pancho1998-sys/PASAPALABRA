import { describe, expect, it } from 'vitest';
import { ProcessState, Simulator } from '../src/index.js';

describe('RF02 - Registro y Consulta de Procesos', () => {
  it('registra exitosamente un proceso cuando hay memoria suficiente', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);
    simulator.registerProcess('P1', 40, 3);

    const process = simulator.getProcess('P1');
    expect(process.pid).toBe('P1');
    expect(process.memoryRequired).toBe(40);
    expect(process.totalCpuTime).toBe(3);
    expect(process.remainingCpu).toBe(3);
  });

  it('cambia el estado del proceso a LISTO al ser admitido', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);
    simulator.registerProcess('P1', 40, 3);

    expect(simulator.getProcess('P1').state).toBe(ProcessState.LISTO);
    expect(simulator.state().ready).toEqual(['P1']);
  });

  it('rechaza el registro de un proceso con PID duplicado', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);
    simulator.registerProcess('P1', 40, 3);

    expect(() => simulator.registerProcess('P1', 10, 1)).toThrow('PID P1 duplicado');
  });

  it('rechaza el registro de un proceso que requiere más memoria que la total', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);

    expect(() => simulator.registerProcess('P2', 101, 1)).toThrow('La memoria requerida supera la memoria total');
  });

  it('lanza un error al consultar un PID que no existe', () => {
    const simulator = new Simulator();
    simulator.configure(100, 2);

    expect(() => simulator.getProcess('NO_EXISTE')).toThrow('No existe el PID NO_EXISTE');
  });
});
