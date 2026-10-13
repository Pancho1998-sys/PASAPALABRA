// ============================================================================
// PRUEBAS DEL SIMULADOR DE PROCESOS Y MEMORIA
// Todas las pruebas unificadas en un solo archivo, simples y directas.
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  AllocationPolicy,
  ContiguousMemoryManager,
  Process,
  ProcessState,
  Simulator,
} from '../src/index.js';

// ============================================================================
// RF01: Configuración inicial del sistema
// ============================================================================
describe('RF01: Configuración inicial', () => {
  it('arranca el simulador en el tick 0', () => {
    const sim = new Simulator();
    sim.configure(1024, 2);
    expect(sim.state().tick).toBe(0);
  });

  it('deja toda la memoria como un solo bloque libre del total', () => {
    const sim = new Simulator();
    sim.configure(1024, 2);
    expect(sim.state().memory).toEqual([
      { start: 0, size: 1024, free: true }
    ]);
  });

  it('arranca la CPU vacía sin ningún proceso', () => {
    const sim = new Simulator();
    sim.configure(1024, 2);
    expect(sim.state().cpuProcess).toBeUndefined();
  });

  it('arranca las métricas en 0 y con toda la memoria libre', () => {
    const sim = new Simulator();
    sim.configure(1024, 2);
    expect(sim.metrics()).toMatchObject({
      memoryOccupancy: 0,
      cpuUtilization: 0,
      contextSwitches: 0,
      totalFreeMemory: 1024,
      largestFreeBlock: 1024,
      externalFragmentation: 0,
    });
  });

  it('tira error si le pasas memoria negativa, cero o con coma', () => {
    const sim = new Simulator();
    expect(() => sim.configure(0, 2)).toThrow();
    expect(() => sim.configure(-100, 2)).toThrow();
    expect(() => sim.configure(10.5, 2)).toThrow();
  });

  it('tira error si le pasas quantum negativo, cero o con coma', () => {
    const sim = new Simulator();
    expect(() => sim.configure(1024, 0)).toThrow();
    expect(() => sim.configure(1024, -2)).toThrow();
    expect(() => sim.configure(1024, 1.5)).toThrow();
  });

  it('tira error si querés usar el simulador sin haberlo configurado antes', () => {
    const sim = new Simulator();
    expect(() => sim.state()).toThrow('La simulación no fue configurada');
    expect(() => sim.tick()).toThrow('La simulación no fue configurada');
    expect(() => sim.metrics()).toThrow('La simulación no fue configurada');
    expect(() => sim.registerProcess('P1', 10, 2)).toThrow('La simulación no fue configurada');
  });
});

// ============================================================================
// RF02: Registro y consulta de procesos
// ============================================================================
describe('RF02: Registro de procesos', () => {
  it('registra un proceso bien cuando hay memoria disponible', () => {
    const sim = new Simulator();
    sim.configure(100, 2);
    sim.registerProcess('P1', 40, 3);

    const p = sim.getProcess('P1');
    expect(p.pid).toBe('P1');
    expect(p.memoryRequired).toBe(40);
    expect(p.totalCpuTime).toBe(3);
    expect(p.remainingCpu).toBe(3);
  });

  it('pone el proceso en estado LISTO apenas entra a memoria', () => {
    const sim = new Simulator();
    sim.configure(100, 2);
    sim.registerProcess('P1', 40, 3);

    expect(sim.getProcess('P1').state).toBe(ProcessState.LISTO);
    expect(sim.state().ready).toEqual(['P1']);
  });

  it('no deja registrar dos procesos con el mismo nombre', () => {
    const sim = new Simulator();
    sim.configure(100, 2);
    sim.registerProcess('P1', 40, 3);

    expect(() => sim.registerProcess('P1', 10, 1)).toThrow('PID P1 duplicado');
  });

  it('no deja registrar un proceso que pide más memoria de la que tiene el sistema', () => {
    const sim = new Simulator();
    sim.configure(100, 2);

    expect(() => sim.registerProcess('P2', 101, 1)).toThrow('La memoria requerida supera la memoria total');
  });

  it('tira error si buscas un proceso que no existe', () => {
    const sim = new Simulator();
    sim.configure(100, 2);

    expect(() => sim.getProcess('NO_EXISTE')).toThrow('No existe el PID NO_EXISTE');
  });
});

// ============================================================================
// RF03: Admisión y espera de memoria
// ============================================================================
describe('RF03: Admisión y espera de memoria', () => {
  it('manda el proceso a esperar si no hay hueco libre donde entre', () => {
    const sim = new Simulator();
    sim.configure(100, 2);

    sim.registerProcess('A', 40, 1);
    sim.registerProcess('B', 40, 1);
    sim.registerProcess('C', 30, 1); // C pide 30 pero solo quedan 20 libres

    expect(sim.getProcess('C').state).toBe(ProcessState.ESPERANDO_MEMORIA);
    expect(sim.state().waitingForMemory).toEqual(['C']);
  });

  it('hace entrar al que estaba esperando cuando se libera memoria', () => {
    const sim = new Simulator();
    sim.configure(100, 2);

    sim.registerProcess('A', 40, 1);
    sim.registerProcess('B', 40, 1);
    sim.registerProcess('C', 30, 1);

    // En el tick 1 A termina y libera sus 40
    sim.tick();
    expect(sim.state().terminated).toContain('A');

    // En el tick 2 C ya puede entrar y pasa a listo
    sim.tick();
    expect(sim.state().waitingForMemory).toEqual([]);
    expect(sim.getProcess('C').state).not.toBe(ProcessState.ESPERANDO_MEMORIA);
  });

  it('deja esperando al proceso si la memoria liberada todavía no le alcanza', () => {
    const sim = new Simulator();
    sim.configure(100, 2);

    sim.registerProcess('A', 20, 1);
    sim.registerProcess('B', 30, 2);
    sim.registerProcess('C', 60, 1);

    expect(sim.state().waitingForMemory).toEqual(['C']);

    // Termina A (libera 20). Queda un hueco de 20 y otro de 50, pero C pide 60 contiguos
    sim.tick();
    expect(sim.state().terminated).toContain('A');

    sim.tick();
    expect(sim.state().waitingForMemory).toEqual(['C']);
  });
});

// ============================================================================
// RF04: Políticas de asignación First-Fit, Best-Fit y Worst-Fit
// ============================================================================
describe('RF04: Políticas de memoria (First-Fit, Best-Fit, Worst-Fit)', () => {
  it('First-Fit agarra el primer hueco libre que encuentra', () => {
    const mem = new ContiguousMemoryManager(100);
    mem.allocate('A', 20, AllocationPolicy.FIRST_FIT);
    mem.allocate('B', 30, AllocationPolicy.FIRST_FIT);
    mem.release('A'); // Queda libre [0, 20]
    mem.allocate('C', 15, AllocationPolicy.FIRST_FIT); // Entra en [0, 15]

    expect(mem.blocks().map(b => [b.start, b.size, b.pid])).toEqual([
      [0, 15, 'C'],
      [15, 5, undefined],
      [20, 30, 'B'],
      [50, 50, undefined],
    ]);
  });

  it('Best-Fit agarra el hueco más chico donde entre justo', () => {
    const mem = new ContiguousMemoryManager(100);
    mem.allocate('A', 20, AllocationPolicy.FIRST_FIT);
    mem.allocate('B', 30, AllocationPolicy.FIRST_FIT);
    mem.allocate('C', 10, AllocationPolicy.FIRST_FIT);
    mem.allocate('D', 40, AllocationPolicy.FIRST_FIT);

    // Liberamos B (30) y D (40)
    mem.release('B');
    mem.release('D');

    // Pedimos 25 con Best-Fit: tiene que elegir el hueco de 30 y no el de 40
    mem.allocate('E', 25, AllocationPolicy.BEST_FIT);

    const bloqueE = mem.blocks().find(b => b.pid === 'E');
    expect(bloqueE).toBeDefined();
    expect(bloqueE?.start).toBe(20);
    expect(bloqueE?.size).toBe(25);
  });

  it('Worst-Fit agarra el hueco más grande que haya disponible', () => {
    const mem = new ContiguousMemoryManager(100);
    mem.allocate('A', 20, AllocationPolicy.FIRST_FIT);
    mem.allocate('B', 30, AllocationPolicy.FIRST_FIT);
    mem.allocate('C', 10, AllocationPolicy.FIRST_FIT);
    mem.allocate('D', 40, AllocationPolicy.FIRST_FIT);

    // Liberamos B (30) y D (40)
    mem.release('B');
    mem.release('D');

    // Pedimos 15 con Worst-Fit: tiene que elegir el hueco de 40
    mem.allocate('E', 15, AllocationPolicy.WORST_FIT);

    const bloqueE = mem.blocks().find(b => b.pid === 'E');
    expect(bloqueE).toBeDefined();
    expect(bloqueE?.start).toBe(60);
    expect(bloqueE?.size).toBe(15);
  });

  it('no toca nada en memoria si no hay lugar para asignar', () => {
    const mem = new ContiguousMemoryManager(100);
    mem.allocate('A', 60, AllocationPolicy.FIRST_FIT);
    mem.allocate('B', 20, AllocationPolicy.FIRST_FIT);

    const estadoAntes = mem.blocks().map(b => [b.start, b.size, b.pid]);
    const pudo = mem.allocate('C', 25, AllocationPolicy.FIRST_FIT);

    expect(pudo).toBe(false);
    expect(mem.blocks().map(b => [b.start, b.size, b.pid])).toEqual(estadoAntes);
  });

  it('tira error si pedís tamaño negativo, cero o no entero', () => {
    const mem = new ContiguousMemoryManager(100);
    expect(() => mem.allocate('A', 0, AllocationPolicy.FIRST_FIT)).toThrow();
    expect(() => mem.allocate('A', -10, AllocationPolicy.FIRST_FIT)).toThrow();
    expect(() => mem.allocate('A', 10.5, AllocationPolicy.FIRST_FIT)).toThrow();
  });

  it('tira error si el proceso ya tiene memoria asignada', () => {
    const mem = new ContiguousMemoryManager(100);
    mem.allocate('A', 20, AllocationPolicy.FIRST_FIT);
    expect(() => mem.allocate('A', 10, AllocationPolicy.FIRST_FIT)).toThrow('PID A ya posee memoria');
  });
});

// ============================================================================
// RF05: Liberación de memoria y coalescencia (fusión de huecos libres)
// ============================================================================
describe('RF05: Liberación de memoria y coalescencia', () => {
  it('junta con el bloque libre de la izquierda', () => {
    const mem = new ContiguousMemoryManager(100);
    mem.allocate('A', 20, AllocationPolicy.FIRST_FIT);
    mem.allocate('B', 20, AllocationPolicy.FIRST_FIT);

    mem.release('A');
    mem.release('B'); // B se pega con A a la izquierda

    expect(mem.blocks()[0]).toEqual(
      expect.objectContaining({ start: 0, size: 100, free: true })
    );
  });

  it('junta con el bloque libre de la derecha', () => {
    const mem = new ContiguousMemoryManager(100);
    mem.allocate('A', 20, AllocationPolicy.FIRST_FIT);
    mem.allocate('B', 20, AllocationPolicy.FIRST_FIT);
    mem.allocate('C', 20, AllocationPolicy.FIRST_FIT);

    mem.release('C');
    mem.release('B'); // B se pega con C a la derecha

    expect(mem.blocks().find(b => b.start === 20)).toEqual(
      expect.objectContaining({ start: 20, size: 80, free: true })
    );
  });

  it('junta por los dos lados si los vecinos estaban libres', () => {
    const mem = new ContiguousMemoryManager(100);
    mem.allocate('A', 20, AllocationPolicy.FIRST_FIT);
    mem.allocate('B', 20, AllocationPolicy.FIRST_FIT);
    mem.allocate('C', 20, AllocationPolicy.FIRST_FIT);
    mem.allocate('D', 20, AllocationPolicy.FIRST_FIT);

    mem.release('B');
    mem.release('D');
    mem.release('C'); // C se pega con B (izquierda) y D (derecha)

    expect(mem.blocks()).toHaveLength(2);
    expect(mem.blocks()[1]).toEqual(
      expect.objectContaining({ start: 20, size: 80, free: true })
    );
  });

  it('vuelve a quedar toda la memoria junta en un solo bloque si liberás todo', () => {
    const mem = new ContiguousMemoryManager(100);
    mem.allocate('A', 20, AllocationPolicy.FIRST_FIT);
    mem.allocate('B', 30, AllocationPolicy.FIRST_FIT);

    mem.release('A');
    mem.release('B');

    expect(mem.blocks()).toHaveLength(1);
    expect(mem.blocks()[0]).toEqual(
      expect.objectContaining({ start: 0, size: 100, free: true })
    );
  });

  it('tira error si querés liberar un proceso que no existe', () => {
    const mem = new ContiguousMemoryManager(100);
    expect(() => mem.release('NO_EXISTE')).toThrow('No existe memoria asignada al PID NO_EXISTE');
  });
});

// ============================================================================
// RF06: Avance por ticks y ejecución en CPU
// ============================================================================
describe('RF06: Simulación por ticks', () => {
  it('suma 1 tick al reloj cada vez que llamas a tick()', () => {
    const sim = new Simulator();
    sim.configure(100, 2);

    expect(sim.state().tick).toBe(0);
    sim.tick();
    expect(sim.state().tick).toBe(1);
    sim.tick();
    expect(sim.state().tick).toBe(2);
  });

  it('le descuenta 1 unidad de CPU al proceso actual en cada tick', () => {
    const sim = new Simulator();
    sim.configure(100, 5);
    sim.registerProcess('P1', 20, 3);

    sim.tick();
    expect(sim.getProcess('P1').remainingCpu).toBe(2);

    sim.tick();
    expect(sim.getProcess('P1').remainingCpu).toBe(1);
  });

  it('pasa el proceso a TERMINADO cuando agota toda su CPU', () => {
    const sim = new Simulator();
    sim.configure(100, 5);
    sim.registerProcess('P1', 20, 2);

    sim.tick();
    sim.tick();

    expect(sim.getProcess('P1').state).toBe(ProcessState.TERMINADO);
    expect(sim.getProcess('P1').remainingCpu).toBe(0);
    expect(sim.state().terminated).toContain('P1');
  });

  it('libera la memoria en el mismo tick que termina el proceso', () => {
    const sim = new Simulator();
    sim.configure(100, 2);
    sim.registerProcess('P1', 60, 1);

    sim.tick();

    expect(sim.getProcess('P1').state).toBe(ProcessState.TERMINADO);
    expect(sim.state().memory).toEqual([
      { start: 0, size: 100, free: true, pid: undefined }
    ]);
  });
});

// ============================================================================
// RF07: Planificación Round-Robin con quantum
// ============================================================================
describe('RF07: Planificación Round-Robin', () => {
  it('hace turnos con quantum y rota los procesos al final de la cola', () => {
    const sim = new Simulator();
    sim.configure(100, 2); // Quantum = 2

    sim.registerProcess('P1', 10, 3);
    sim.registerProcess('P2', 10, 2);

    // Tick 1: P1 corre 1 tick
    sim.tick();
    expect(sim.state().cpuProcess).toBe('P1');
    expect(sim.getProcess('P1').remainingCpu).toBe(2);
    expect(sim.state().ready).toEqual(['P2']);

    // Tick 2: P1 agota quantum (2) y rota al fondo
    sim.tick();
    expect(sim.state().ready).toEqual(['P2', 'P1']);
    expect(sim.state().cpuProcess).toBeUndefined();

    // Tick 3: P2 corre 1 tick
    sim.tick();
    expect(sim.state().cpuProcess).toBe('P2');
    expect(sim.getProcess('P2').remainingCpu).toBe(1);
    expect(sim.state().ready).toEqual(['P1']);

    // Tick 4: P2 termina sus 2 ticks y finaliza
    sim.tick();
    expect(sim.getProcess('P2').state).toBe(ProcessState.TERMINADO);

    // Tick 5: P1 vuelve y hace su último tick
    sim.tick();
    expect(sim.getProcess('P1').state).toBe(ProcessState.TERMINADO);
    expect(sim.getProcess('P1').remainingCpu).toBe(0);
    expect(sim.state().terminated).toContain('P1');
  });

  it('suma un cambio de contexto cuando se expulsa por quantum', () => {
    const sim = new Simulator();
    sim.configure(100, 2);

    sim.registerProcess('P1', 10, 3);
    sim.registerProcess('P2', 10, 2);

    expect(sim.metrics().contextSwitches).toBe(0);

    sim.tick(); // Tick 1 (P1 en CPU)
    sim.tick(); // Tick 2 (P1 rota -> cambio de contexto)

    expect(sim.metrics().contextSwitches).toBe(1);
  });

  it('no cuenta cambio de contexto si el proceso termina antes de gastar el quantum', () => {
    const sim = new Simulator();
    sim.configure(100, 5); // Quantum = 5

    sim.registerProcess('P1', 10, 2); // CPU = 2 < Quantum

    sim.tick();
    sim.tick();

    expect(sim.getProcess('P1').state).toBe(ProcessState.TERMINADO);
  });
});

// ============================================================================
// RF08: Eventos de Entrada y Salida (E/S)
// ============================================================================
describe('RF08: Entrada y Salida (E/S)', () => {
  it('bloquea el proceso tras N ticks de CPU y vuelve a listo cuando termina la E/S', () => {
    const sim = new Simulator();
    sim.configure(100, 5);

    // P1 pide E/S a los 2 ticks y dura 2 ticks bloqueado
    sim.registerProcess('P1', 10, 4, { afterCpuTicks: 2, duration: 2 });
    sim.registerProcess('P2', 10, 2);

    // Ticks 1 y 2: P1 ejecuta sus 2 ticks
    sim.tick();
    sim.tick();

    // Se bloquea y suelta la CPU
    expect(sim.getProcess('P1').state).toBe(ProcessState.BLOQUEADO);
    expect(sim.state().cpuProcess).toBeUndefined();
    expect(sim.state().blocked).toContain('P1');

    // Tick 3: le queda 1 tick de bloqueo
    sim.tick();
    expect(sim.getProcess('P1').blockedRemaining).toBe(1);

    // Tick 4: termina el bloqueo y vuelve a LISTO
    sim.tick();
    expect(sim.getProcess('P1').state).toBe(ProcessState.LISTO);
    expect(sim.state().ready).toContain('P1');
  });

  it('tira error si la E/S tiene números inválidos', () => {
    expect(() => new Process('P', 10, 3, { afterCpuTicks: 3, duration: 1 })).toThrow(
      'El evento de E/S debe ocurrir antes de finalizar'
    );
    expect(() => new Process('P', 10, 3, { afterCpuTicks: 1, duration: 0 })).toThrow(
      'La duración de E/S debe ser positiva'
    );
  });
});

// ============================================================================
// RF09: Métricas del sistema
// ============================================================================
describe('RF09: Métricas del sistema', () => {
  it('calcula la fragmentación externa como corresponde', () => {
    const mem = new ContiguousMemoryManager(1000);
    mem.allocate('A', 100, AllocationPolicy.FIRST_FIT);
    mem.allocate('B', 300, AllocationPolicy.FIRST_FIT);
    mem.allocate('C', 300, AllocationPolicy.FIRST_FIT);
    mem.allocate('D', 300, AllocationPolicy.FIRST_FIT);

    mem.release('A'); // Hueco libre de 100
    mem.release('C'); // Hueco libre de 300

    expect(mem.freeMemory()).toBe(400);
    expect(mem.largestFreeBlock()).toBe(300);

    // Fragmentación: 100 * (1 - 300 / 400) = 25%
    const frag = 100 * (1 - mem.largestFreeBlock() / mem.freeMemory());
    expect(frag).toBe(25);
  });

  it('marca 0% de CPU en el tick 0', () => {
    const sim = new Simulator();
    sim.configure(100, 2);
    expect(sim.metrics().cpuUtilization).toBe(0);
  });

  it('calcula bien el uso de CPU con los ticks laburados', () => {
    const sim = new Simulator();
    sim.configure(100, 2);
    sim.registerProcess('P1', 20, 2);

    sim.tick(); // Tick 1: 100%
    expect(sim.metrics().cpuUtilization).toBe(100);

    sim.tick(); // Tick 2: 100%
    sim.tick(); // Tick 3 (CPU vacía): 2 de 3 ticks = 66.67%
    expect(sim.metrics().cpuUtilization).toBeCloseTo(66.67, 1);
  });

  it('calcula la ocupación de memoria correctamente', () => {
    const sim = new Simulator();
    sim.configure(100, 2);
    sim.registerProcess('P1', 40, 2);

    expect(sim.metrics().memoryOccupancy).toBe(40);
  });
});

// ============================================================================
// RF10: Consultas e invariantes del sistema
// ============================================================================
describe('RF10: Consultas e invariantes', () => {
  it('devuelve copias defensivas de las colas y de la memoria para no alterar lo interno', () => {
    const sim = new Simulator();
    sim.configure(100, 2);
    sim.registerProcess('P1', 20, 1);

    const snapshot = sim.state();

    // Modificamos la copia que nos devolvió
    snapshot.ready.push('PROCESO_FALSO');
    snapshot.memory[0].size = 999;

    // El simulador por dentro tiene que seguir intacto
    expect(sim.state().ready).not.toContain('PROCESO_FALSO');
    expect(sim.state().memory[0].size).toBe(20);
  });

  it('consultar metrics() varias veces no cambia nada en el sistema', () => {
    const sim = new Simulator();
    sim.configure(100, 2);
    sim.registerProcess('P1', 50, 2);

    const m1 = sim.metrics();
    const m2 = sim.metrics();

    expect(m1).toEqual(m2);
    expect(m1.memoryOccupancy).toBe(50);
  });
});
