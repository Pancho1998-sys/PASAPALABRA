import { describe, expect, it } from 'vitest';
import { AllocationPolicy, ContiguousMemoryManager } from '../src/index.js';

describe('RF05 - Liberación de Memoria y Coalescencia de Bloques', () => {
  it('realiza coalescencia por la izquierda al liberar un bloque adyacente a uno libre', () => {
    const memory = new ContiguousMemoryManager(100);
    memory.allocate('A', 20, AllocationPolicy.FIRST_FIT); // [0, 20]
    memory.allocate('B', 20, AllocationPolicy.FIRST_FIT); // [20, 20]

    memory.release('A'); // Bloque 0-20 libre
    memory.release('B'); // Al liberar B (20-40), se une con A (0-20) por la izquierda

    expect(memory.blocks()[0]).toEqual(
      expect.objectContaining({ start: 0, size: 100, free: true })
    );
  });

  it('realiza coalescencia por la derecha al liberar un bloque adyacente a uno libre', () => {
    const memory = new ContiguousMemoryManager(100);
    memory.allocate('A', 20, AllocationPolicy.FIRST_FIT); // [0, 20]
    memory.allocate('B', 20, AllocationPolicy.FIRST_FIT); // [20, 20]
    memory.allocate('C', 20, AllocationPolicy.FIRST_FIT); // [40, 20]

    memory.release('C'); // Bloque 40-60 libre, y 60-100 ya libre (se fusionan a 40-100)
    memory.release('B'); // Al liberar B (20-40), se une con el libre de la derecha (40-100)

    expect(memory.blocks().find(b => b.start === 20)).toEqual(
      expect.objectContaining({ start: 20, size: 80, free: true })
    );
  });

  it('realiza coalescencia por ambos lados cuando los bloques adyacentes están libres', () => {
    const memory = new ContiguousMemoryManager(100);
    memory.allocate('A', 20, AllocationPolicy.FIRST_FIT);
    memory.allocate('B', 20, AllocationPolicy.FIRST_FIT);
    memory.allocate('C', 20, AllocationPolicy.FIRST_FIT);
    memory.allocate('D', 20, AllocationPolicy.FIRST_FIT);

    memory.release('B'); // Libre [20, 20]
    memory.release('D'); // Libre [60, 40]
    memory.release('C'); // Libre C [40, 20] -> fusiona con B (izquierda) y D (derecha)

    expect(memory.blocks()).toHaveLength(2);
    expect(memory.blocks()[1]).toEqual(
      expect.objectContaining({ start: 20, size: 80, free: true })
    );
  });

  it('restablece la memoria a un único bloque total cuando se liberan todos los procesos', () => {
    const memory = new ContiguousMemoryManager(100);
    memory.allocate('A', 20, AllocationPolicy.FIRST_FIT);
    memory.allocate('B', 30, AllocationPolicy.FIRST_FIT);

    memory.release('A');
    memory.release('B');

    expect(memory.blocks()).toHaveLength(1);
    expect(memory.blocks()[0]).toEqual(
      expect.objectContaining({ start: 0, size: 100, free: true })
    );
  });

  it('lanza un error al intentar liberar memoria de un PID no asignado o inexistente', () => {
    const memory = new ContiguousMemoryManager(100);
    expect(() => memory.release('NO_EXISTE')).toThrow('No existe memoria asignada al PID NO_EXISTE');
  });
});
