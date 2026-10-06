// ============================================================================
// TRABAJO PRÁCTICO: SIMULADOR DE PROCESOS Y MEMORIA CONTIGUA (TypeScript)
// Hecho bien simple y claro, como para primer año de Ingeniería en Sistemas.
//
// Todo el código metido en este único archivo para que sea re fácil de seguir:
// 1. Estados y Políticas (Enums)
// 2. Interfaces y Contratos del Sistema
// 3. Bloque de Memoria (MemoryBlock)
// 4. Bloque de Control de Proceso (Process / PCB)
// 5. Planificador de CPU (RoundRobinScheduler)
// 6. Administrador de Memoria Contigua (ContiguousMemoryManager)
// 7. Calculador de Métricas (MetricsCalculator)
// 8. Motor de Simulación Principal (Simulator)
// ============================================================================


// ============================================================================
// 1. ENUMERACIONES (Estados del Proceso y Políticas de Memoria)
// ============================================================================

/**
 * Estados por los que va pasando un proceso a lo largo de su ciclo de vida.
 */
export enum ProcessState {
  NUEVO = 'Nuevo',
  ESPERANDO_MEMORIA = 'Esperando Memoria',
  LISTO = 'Listo',
  EJECUTANDO = 'Ejecutando',
  BLOQUEADO = 'Bloqueado',
  TERMINADO = 'Terminado'
}

/**
 * Políticas para ubicar un proceso en memoria contigua.
 */
export enum AllocationPolicy {
  FIRST_FIT = 'First-Fit',   // Agarra el primer hueco libre donde entre
  BEST_FIT = 'Best-Fit',     // Busca el hueco libre más chico donde entre justo
  WORST_FIT = 'Worst-Fit'    // Agarra el hueco libre más grande disponible
}


// ============================================================================
// 2. INTERFACES DEL SISTEMA
// ============================================================================

/**
 * Datos para cuando un proceso pide Entrada/Salida (E/S).
 */
export interface IoEvent {
  afterCpuTicks: number; // Cuántos ticks de CPU ejecuta antes de frenar por E/S
  duration: number;      // Cuántos ticks se queda esperando en bloqueo
}

/**
 * Vista rápida de un bloque de memoria para armar los reportes.
 */
export interface MemoryView {
  start: number;
  size: number;
  free: boolean;
  pid?: string;
}

/**
 * Métricas generales para ver cómo viene rindiendo el sistema.
 */
export interface Metrics {
  memoryOccupancy: number;        // Porcentaje de memoria ocupada (%)
  cpuUtilization: number;         // Porcentaje de uso de la CPU (%)
  contextSwitches: number;        // Cantidad de cambios de contexto
  totalFreeMemory: number;        // Memoria total libre disponible
  largestFreeBlock: number;       // Tamaño del hueco libre más grande
  externalFragmentation: number;  // Porcentaje de fragmentación externa (%)
}

/**
 * Contrato que tiene que cumplir el gestor de memoria contigua.
 */
export interface MemoryManager {
  readonly totalSize: number;
  allocate(pid: string, size: number, policy: AllocationPolicy): boolean;
  release(pid: string): void;
  blocks(): readonly MemoryBlock[];
  freeMemory(): number;
  largestFreeBlock(): number;
}

/**
 * Contrato que tiene que cumplir el planificador de CPU.
 */
export interface Scheduler {
  readonly quantum: number;
  enqueue(process: Process): void;
  readyQueue(): readonly Process[];
  current(): Process | undefined;
  dispatch(): Process | undefined;
  onCpuTick(): void;
  shouldRotate(): boolean;
  rotate(): void;
  clearCurrent(): void;
}

/**
 * Foto completa del estado de la simulación en un tick determinado.
 */
export interface SimulationSnapshot {
  tick: number;
  cpuProcess?: string;
  ready: string[];
  waitingForMemory: string[];
  blocked: string[];
  terminated: string[];
  memory: MemoryView[];
  metrics: Metrics;
}


// ============================================================================
// 3. BLOQUE DE MEMORIA (MemoryBlock)
// ============================================================================

/**
 * Representa un pedazo contiguo de memoria principal (partición).
 * Puede estar libre o asignado a un proceso (identificado con su PID).
 */
export class MemoryBlock {
  public readonly start: number;
  public readonly size: number;
  private ownerPid?: string;

  public constructor(start: number, size: number, ownerPid?: string) {
    // Nos aseguramos de que el arranque sea un entero mayor o igual a cero
    if (!Number.isInteger(start) || start < 0) {
      throw new Error('El inicio debe ser un entero no negativo');
    }

    // Nos aseguramos de que el tamaño sea un número entero positivo
    if (!Number.isInteger(size) || size <= 0) {
      throw new Error('El tamaño debe ser un entero positivo');
    }

    this.start = start;
    this.size = size;
    this.ownerPid = ownerPid;
  }

  // Te dice si el bloque está desocupado
  public get free(): boolean {
    return this.ownerPid === undefined;
  }

  // Te dice el PID del proceso dueño, o undefined si está libre
  public get pid(): string | undefined {
    return this.ownerPid;
  }

  // Le asigna este bloque a un proceso
  public assign(pid: string): void {
    if (!this.free) {
      throw new Error('El bloque ya está ocupado');
    }
    this.ownerPid = pid;
  }

  // Libera el bloque para que lo pueda aprovechar otro proceso
  public release(): void {
    this.ownerPid = undefined;
  }

  // Corta el bloque libre en dos: la parte que usa el proceso y el cacho sobrante
  public split(allocatedSize: number, pid: string): MemoryBlock[] {
    if (!this.free || allocatedSize <= 0 || allocatedSize > this.size) {
      throw new Error('Partición inválida');
    }

    const bloqueAsignado = new MemoryBlock(this.start, allocatedSize, pid);
    const espacioRestante = this.size - allocatedSize;

    // Si entró justo y no sobró nada, devolvemos solo el bloque asignado
    if (espacioRestante === 0) {
      return [bloqueAsignado];
    }

    // Si sobró memoria, armamos un nuevo bloque libre con lo que quedó
    const bloqueLibre = new MemoryBlock(this.start + allocatedSize, espacioRestante);
    return [bloqueAsignado, bloqueLibre];
  }
}


// ============================================================================
// 4. PROCESO (Process - Bloque de Control de Proceso / PCB)
// ============================================================================

/**
 * Guarda toda la info del proceso (el PCB):
 * Su PID, cuánta memoria necesita, cuánto CPU le queda y si pide E/S.
 */
export class Process {
  public readonly pid: string;
  public readonly memoryRequired: number;
  public readonly totalCpuTime: number;

  private _state: ProcessState;
  private _remainingCpu: number;
  private _quantumConsumed: number;
  private _blockedRemaining: number;
  private _cpuTicksExecuted: number;
  private _ioEvent?: IoEvent;
  private _ioTriggered: boolean;

  public constructor(
    pid: string,
    memoryRequired: number,
    totalCpuTime: number,
    ioEvent?: IoEvent
  ) {
    // 1. Chequeamos que el PID no venga vacío
    if (!pid.trim()) {
      throw new Error('PID inválido');
    }

    // 2. Chequeamos que la memoria pedida sea un entero positivo
    if (!Number.isInteger(memoryRequired) || memoryRequired <= 0) {
      throw new Error('La memoria requerida debe ser positiva');
    }

    // 3. Chequeamos que el tiempo total de CPU sea un entero positivo
    if (!Number.isInteger(totalCpuTime) || totalCpuTime <= 0) {
      throw new Error('El tiempo de CPU debe ser positivo');
    }

    // 4. Si tiene configurada una E/S, validamos que los números tengan sentido
    if (ioEvent) {
      if (!Number.isInteger(ioEvent.afterCpuTicks) || ioEvent.afterCpuTicks <= 0) {
        throw new Error('afterCpuTicks debe ser positivo');
      }
      if (!Number.isInteger(ioEvent.duration) || ioEvent.duration <= 0) {
        throw new Error('La duración de E/S debe ser positiva');
      }
      if (ioEvent.afterCpuTicks >= totalCpuTime) {
        throw new Error('El evento de E/S debe ocurrir antes de finalizar');
      }
    }

    this.pid = pid;
    this.memoryRequired = memoryRequired;
    this.totalCpuTime = totalCpuTime;

    // Todo proceso arranca nuevito en estado NUEVO
    this._state = ProcessState.NUEVO;
    this._remainingCpu = totalCpuTime;
    this._quantumConsumed = 0;
    this._blockedRemaining = 0;
    this._cpuTicksExecuted = 0;
    this._ioEvent = ioEvent;
    this._ioTriggered = false;
  }

  // Getters para consultar las variables internas del proceso
  public get state(): ProcessState {
    return this._state;
  }

  public get remainingCpu(): number {
    return this._remainingCpu;
  }

  public get quantumConsumed(): number {
    return this._quantumConsumed;
  }

  public get blockedRemaining(): number {
    return this._blockedRemaining;
  }

  public get cpuTicksExecuted(): number {
    return this._cpuTicksExecuted;
  }

  // Pasa el proceso a LISTO una vez que consiguió memoria
  public admit(): void {
    this.transition([ProcessState.NUEVO, ProcessState.ESPERANDO_MEMORIA], ProcessState.LISTO);
  }

  // Lo manda a esperar memoria si no hay lugar disponible todavía
  public waitForMemory(): void {
    this.transition([ProcessState.NUEVO, ProcessState.LISTO], ProcessState.ESPERANDO_MEMORIA);
  }

  // El planificador lo manda a la CPU a laburar (pasa a EJECUTANDO)
  public dispatch(): void {
    this.transition([ProcessState.LISTO], ProcessState.EJECUTANDO);
    this._quantumConsumed = 0;
  }

  // Gasta un tick laburando en la CPU
  public executeCpuUnit(): void {
    if (this._state !== ProcessState.EJECUTANDO) {
      throw new Error('Solo el proceso ejecutando puede consumir CPU');
    }
    this._remainingCpu -= 1;
    this._cpuTicksExecuted += 1;
    this._quantumConsumed += 1;
  }

  // Se fija si ya es momento de frenar por una Entrada/Salida
  public shouldBlockForIo(): boolean {
    if (!this._ioEvent) {
      return false;
    }
    if (this._ioTriggered) {
      return false;
    }
    if (this._remainingCpu <= 0) {
      return false;
    }
    return this._cpuTicksExecuted >= this._ioEvent.afterCpuTicks;
  }

  // Clava el proceso en estado BLOQUEADO por la E/S
  public blockForIo(): void {
    if (!this.shouldBlockForIo()) {
      throw new Error('No corresponde bloquear por E/S');
    }
    this._ioTriggered = true;
    this._blockedRemaining = this._ioEvent!.duration;
    this._state = ProcessState.BLOQUEADO;
    this._quantumConsumed = 0;
  }

  // Le descuenta un tick al bloqueo; si ya terminó de esperar, vuelve a quedar LISTO
  public updateBlocked(): boolean {
    if (this._state !== ProcessState.BLOQUEADO) {
      return false;
    }

    this._blockedRemaining -= 1;

    // Si terminó la espera de E/S, vuelve a la cola de listos
    if (this._blockedRemaining <= 0) {
      this._blockedRemaining = 0;
      this._state = ProcessState.LISTO;
      this._quantumConsumed = 0;
      return true;
    }

    return false;
  }

  // Da por terminado el proceso cuando liquidó todo su tiempo de CPU
  public finish(): void {
    if (this._remainingCpu !== 0) {
      throw new Error('No se puede finalizar un proceso con CPU pendiente');
    }
    this._state = ProcessState.TERMINADO;
    this._quantumConsumed = 0;
  }

  // Si se le gastó el quantum, vuelve a la cola de listos
  public rotateToReady(): void {
    this.transition([ProcessState.EJECUTANDO], ProcessState.LISTO);
    this._quantumConsumed = 0;
  }

  // Si no hay otro esperando, le renovamos el quantum para que siga derecho
  public renewQuantum(): void {
    if (this._state !== ProcessState.EJECUTANDO) {
      throw new Error('El proceso no está ejecutando');
    }
    this._quantumConsumed = 0;
  }

  // Función auxiliar para chequear que los cambios de estado sean válidos
  private transition(estadosOrigenPermitidos: ProcessState[], estadoDestino: ProcessState): void {
    let esOrigenValido = false;
    for (const origen of estadosOrigenPermitidos) {
      if (this._state === origen) {
        esOrigenValido = true;
        break;
      }
    }

    if (!esOrigenValido) {
      throw new Error(`Transición inválida: ${this._state} -> ${estadoDestino}`);
    }

    this._state = estadoDestino;
  }
}


// ============================================================================
// 5. PLANIFICADOR ROUND-ROBIN (RoundRobinScheduler)
// ============================================================================

/**
 * Planificador de CPU que usa el algoritmo Round-Robin.
 * Administra la cola de procesos listos por orden de llegada (FIFO)
 * y va rotando los procesos según el tiempo de Quantum.
 */
export class RoundRobinScheduler implements Scheduler {
  public readonly quantum: number;
  private queue: Process[] = [];
  private running?: Process;

  public constructor(quantum: number) {
    if (!Number.isInteger(quantum) || quantum <= 0) {
      throw new Error('El quantum debe ser positivo');
    }
    this.quantum = quantum;
  }

  // Encola un proceso al fondo de la lista si no estaba ya esperando ni corriendo
  public enqueue(process: Process): void {
    const yaEstaEnCola = this.queue.includes(process);
    const estaEnEjecucion = this.running === process;

    if (!yaEstaEnCola && !estaEnEjecucion) {
      this.queue.push(process);
    }
  }

  // Te tira una copia de la cola de procesos listos
  public readyQueue(): readonly Process[] {
    const copia: Process[] = [];
    for (const p of this.queue) {
      copia.push(p);
    }
    return copia;
  }

  // Te dice qué proceso está corriendo en la CPU ahora mismo
  public current(): Process | undefined {
    return this.running;
  }

  // Manda el próximo proceso de la cola de listos a la CPU
  public dispatch(): Process | undefined {
    // Si la CPU ya está ocupada o la cola está vacía, no tocamos nada
    if (this.running !== undefined || this.queue.length === 0) {
      return this.running;
    }

    const siguiente = this.queue.shift();
    if (siguiente !== undefined) {
      siguiente.dispatch();
      this.running = siguiente;
    }

    return this.running;
  }

  // Hace que el proceso que está corriendo consuma un ciclo de CPU
  public onCpuTick(): void {
    if (this.running !== undefined) {
      this.running.executeCpuUnit();
    }
  }

  // Se fija si el proceso ya se gastó todo el quantum
  public shouldRotate(): boolean {
    if (this.running === undefined) {
      return false;
    }
    return this.running.quantumConsumed >= this.quantum;
  }

  // Lo baja de la CPU por fin de quantum y lo manda al fondo de la cola de listos
  public rotate(): void {
    if (this.running === undefined) {
      return;
    }

    const procesoDesalojado = this.running;
    this.running = undefined;
    procesoDesalojado.rotateToReady();
    this.queue.push(procesoDesalojado);
  }

  // Limpia la CPU (cuando un proceso termina o se clava en bloqueo)
  public clearCurrent(): void {
    this.running = undefined;
  }
}


// ============================================================================
// 6. ADMINISTRADOR DE MEMORIA CONTIGUA (ContiguousMemoryManager)
// ============================================================================

/**
 * Administra la memoria principal contigua con particionamiento dinámico.
 * Soporta First-Fit, Best-Fit y Worst-Fit, y junta huecos libres vecinos (coalescencia).
 */
export class ContiguousMemoryManager implements MemoryManager {
  public readonly totalSize: number;
  private _blocks: MemoryBlock[];

  public constructor(totalSize: number) {
    if (!Number.isInteger(totalSize) || totalSize <= 0) {
      throw new Error('La memoria total debe ser positiva');
    }

    this.totalSize = totalSize;
    // Toda la memoria arranca como un único hueco libre desde la posición 0
    this._blocks = [new MemoryBlock(0, totalSize)];
  }

  // Te devuelve una lista de copias de los bloques para no alterar la lista interna
  public blocks(): readonly MemoryBlock[] {
    const listaCopia: MemoryBlock[] = [];
    for (const bloque of this._blocks) {
      listaCopia.push(new MemoryBlock(bloque.start, bloque.size, bloque.pid));
    }
    return listaCopia;
  }

  // Intenta asignarle un cacho de memoria al proceso según la política elegida
  public allocate(pid: string, size: number, policy: AllocationPolicy): boolean {
    // 1. Validamos que el tamaño pedido sea válido
    if (!Number.isInteger(size) || size <= 0) {
      throw new Error('Tamaño de asignación inválido');
    }

    // 2. Nos fijamos si el proceso ya tenía memoria asignada
    for (const bloque of this._blocks) {
      if (bloque.pid === pid) {
        throw new Error(`PID ${pid} ya posee memoria`);
      }
    }

    // 3. Juntamos todos los bloques libres donde entre el proceso
    const bloquesCandidatos: MemoryBlock[] = [];
    for (const bloque of this._blocks) {
      if (bloque.free && bloque.size >= size) {
        bloquesCandidatos.push(bloque);
      }
    }

    // Si no encontramos ningún hueco donde entre, devolvemos false
    if (bloquesCandidatos.length === 0) {
      return false;
    }

    // 4. Elegimos el bloque según la política indicada
    let bloqueSeleccionado: MemoryBlock = bloquesCandidatos[0];

    if (policy === AllocationPolicy.FIRST_FIT) {
      // First-Fit: Agarramos el primer hueco libre que encontramos
      bloqueSeleccionado = bloquesCandidatos[0];
    } else if (policy === AllocationPolicy.BEST_FIT) {
      // Best-Fit: Buscamos el hueco libre más chico donde entre
      // Si empatan en tamaño, desempatamos agarrando el que arranca antes
      bloqueSeleccionado = bloquesCandidatos[0];
      for (let i = 1; i < bloquesCandidatos.length; i++) {
        const candidato = bloquesCandidatos[i];
        if (candidato.size < bloqueSeleccionado.size) {
          bloqueSeleccionado = candidato;
        } else if (candidato.size === bloqueSeleccionado.size && candidato.start < bloqueSeleccionado.start) {
          bloqueSeleccionado = candidato;
        }
      }
    } else if (policy === AllocationPolicy.WORST_FIT) {
      // Worst-Fit: Buscamos el hueco libre más grande disponible
      // Si empatan en tamaño, desempatamos agarrando el que arranca antes
      bloqueSeleccionado = bloquesCandidatos[0];
      for (let i = 1; i < bloquesCandidatos.length; i++) {
        const candidato = bloquesCandidatos[i];
        if (candidato.size > bloqueSeleccionado.size) {
          bloqueSeleccionado = candidato;
        } else if (candidato.size === bloqueSeleccionado.size && candidato.start < bloqueSeleccionado.start) {
          bloqueSeleccionado = candidato;
        }
      }
    }

    // 5. Particionamos el bloque elegido para asignarle el espacio al proceso
    const indice = this._blocks.indexOf(bloqueSeleccionado);
    const bloquesNuevos = bloqueSeleccionado.split(size, pid);
    this._blocks.splice(indice, 1, ...bloquesNuevos);

    this.assertInvariants();
    return true;
  }

  // Libera la memoria del proceso y junta los bloques libres que hayan quedado pegados
  public release(pid: string): void {
    let indiceEncontrado = -1;
    for (let i = 0; i < this._blocks.length; i++) {
      if (this._blocks[i].pid === pid) {
        indiceEncontrado = i;
        break;
      }
    }

    if (indiceEncontrado < 0) {
      throw new Error(`No existe memoria asignada al PID ${pid}`);
    }

    this._blocks[indiceEncontrado].release();
    this.coalesce(indiceEncontrado);
    this.assertInvariants();
  }

  // Suma cuánta memoria libre queda disponible en total
  public freeMemory(): number {
    let totalLibre = 0;
    for (const bloque of this._blocks) {
      if (bloque.free) {
        totalLibre += bloque.size;
      }
    }
    return totalLibre;
  }

  // Te dice cuánto mide el hueco libre más grande
  public largestFreeBlock(): number {
    let mayorTamano = 0;
    for (const bloque of this._blocks) {
      if (bloque.free && bloque.size > mayorTamano) {
        mayorTamano = bloque.size;
      }
    }
    return mayorTamano;
  }

  // Junta el bloque recién liberado con los vecinos si también están libres (coalescencia)
  private coalesce(indice: number): void {
    let i = indice;

    // Fusión por la izquierda: si el bloque de atrás está libre, los pegamos
    if (i > 0 && this._blocks[i - 1].free) {
      const bloqueIzquierdo = this._blocks[i - 1];
      const bloqueActual = this._blocks[i];
      const tamanoCombinado = bloqueIzquierdo.size + bloqueActual.size;

      const nuevoBloque = new MemoryBlock(bloqueIzquierdo.start, tamanoCombinado);
      this._blocks.splice(i - 1, 2, nuevoBloque);
      i = i - 1;
    }

    // Fusión por la derecha: si el bloque de adelante está libre, los pegamos
    if (i < this._blocks.length - 1 && this._blocks[i + 1].free) {
      const bloqueActual = this._blocks[i];
      const bloqueDerecho = this._blocks[i + 1];
      const tamanoCombinado = bloqueActual.size + bloqueDerecho.size;

      const nuevoBloque = new MemoryBlock(bloqueActual.start, tamanoCombinado);
      this._blocks.splice(i, 2, nuevoBloque);
    }
  }

  // Chequea que todos los bloques estén pegados, ordenados y sumen la memoria total
  private assertInvariants(): void {
    if (this._blocks.length === 0) {
      throw new Error('Debe existir al menos un bloque');
    }

    let cursor = 0;
    for (const bloque of this._blocks) {
      if (bloque.start !== cursor) {
        throw new Error('Los bloques deben ser contiguos y ordenados');
      }
      cursor += bloque.size;
    }

    if (cursor !== this.totalSize) {
      throw new Error('La memoria total no coincide');
    }
  }
}


// ============================================================================
// 7. CALCULADOR DE MÉTRICAS (MetricsCalculator)
// ============================================================================

/**
 * Calcula las métricas del sistema: ocupación de memoria, uso de CPU, cambios de contexto y fragmentación.
 */
export class MetricsCalculator {
  private memory: ContiguousMemoryManager;

  public constructor(memory: ContiguousMemoryManager) {
    this.memory = memory;
  }

  public calculate(contextSwitches: number, ticksElapsed: number, busyTicks: number): Metrics {
    const memoriaLibre = this.memory.freeMemory();
    const mayorBloqueLibre = this.memory.largestFreeBlock();
    const memoriaTotal = this.memory.totalSize;

    // 1. Porcentaje de memoria ocupada
    const memoriaOcupada = memoriaTotal - memoriaLibre;
    const memoryOccupancy = (memoriaOcupada / memoriaTotal) * 100;

    // 2. Porcentaje de uso de la CPU
    let cpuUtilization = 0;
    if (ticksElapsed > 0) {
      cpuUtilization = (busyTicks / ticksElapsed) * 100;
    }

    // 3. Porcentaje de fragmentación externa
    let externalFragmentation = 0;
    if (memoriaLibre > 0) {
      externalFragmentation = 100 * (1 - mayorBloqueLibre / memoriaLibre);
    }

    return {
      memoryOccupancy,
      cpuUtilization,
      contextSwitches,
      totalFreeMemory: memoriaLibre,
      largestFreeBlock: mayorBloqueLibre,
      externalFragmentation,
    };
  }
}


// ============================================================================
// 8. SIMULADOR PRINCIPAL (Simulator)
// ============================================================================

/**
 * Motor principal de la simulación del sistema operativo.
 * Orquesta la memoria, el planificador Round-Robin y el paso del tiempo por ciclos (ticks).
 */
export class Simulator {
  private allocationPolicy: AllocationPolicy;

  // Listas de procesos según en qué andan
  private processes: Map<string, Process> = new Map();
  private waiting: Process[] = [];
  private blocked: Process[] = [];
  private terminated: Process[] = [];

  // Contadores de la simulación
  private _tick: number = 0;
  private busyTicks: number = 0;
  private contextSwitches: number = 0;

  // Componentes del sistema
  private memory!: ContiguousMemoryManager;
  private scheduler!: RoundRobinScheduler;
  private metricsCalculator!: MetricsCalculator;
  private started: boolean = false;

  public constructor(allocationPolicy: AllocationPolicy = AllocationPolicy.FIRST_FIT) {
    this.allocationPolicy = allocationPolicy;
  }

  // Arranca y configura el simulador con la memoria total y el valor de quantum
  public configure(totalMemory: number, quantum: number): void {
    if (!Number.isInteger(totalMemory) || totalMemory <= 0) {
      throw new Error('La memoria total debe ser positiva');
    }
    if (!Number.isInteger(quantum) || quantum <= 0) {
      throw new Error('El quantum debe ser positivo');
    }

    this.memory = new ContiguousMemoryManager(totalMemory);
    this.scheduler = new RoundRobinScheduler(quantum);
    this.metricsCalculator = new MetricsCalculator(this.memory);

    // Reseteamos todas las listas y contadores a cero
    this.processes.clear();
    this.waiting = [];
    this.blocked = [];
    this.terminated = [];

    this._tick = 0;
    this.busyTicks = 0;
    this.contextSwitches = 0;
    this.started = true;
  }

  // Da de alta un nuevo proceso en el sistema
  public registerProcess(
    pid: string,
    memoryRequired: number,
    cpuTime: number,
    ioEvent?: { afterCpuTicks: number; duration: number }
  ): void {
    this.ensureStarted();

    // Chequeamos que no haya otro proceso con el mismo PID
    if (this.processes.has(pid)) {
      throw new Error(`PID ${pid} duplicado`);
    }

    // Chequeamos que el proceso no pida más memoria de la que tiene la máquina
    if (memoryRequired > this.memory.totalSize) {
      throw new Error('La memoria requerida supera la memoria total');
    }

    const nuevoProceso = new Process(pid, memoryRequired, cpuTime, ioEvent);
    this.processes.set(pid, nuevoProceso);

    // Probamos si entra en memoria de una
    const pudoAsignar = this.memory.allocate(pid, memoryRequired, this.allocationPolicy);

    if (pudoAsignar) {
      nuevoProceso.admit();
    } else {
      // Si no hay lugar, queda esperando memoria
      nuevoProceso.waitForMemory();
      this.waiting.push(nuevoProceso);
    }

    // Si logró quedar en estado LISTO, lo encolamos en el planificador
    if (nuevoProceso.state === ProcessState.LISTO) {
      this.scheduler.enqueue(nuevoProceso);
    }
  }

  // Avanza exactamente un ciclo de reloj (tick) en la simulación
  public tick(): void {
    this.ensureStarted();

    // 1. Nos fijamos si ahora entran los procesos que estaban esperando memoria
    this.admitWaitingProcesses();

    // 2. Le descontamos tiempo a los procesos que están clavados en E/S
    this.updateBlockedProcesses();

    // 3. Si la CPU está libre, mandamos a ejecutar el siguiente proceso listo
    this.dispatchIfNeeded();

    // 4. Ponemos a laburar a la CPU con el proceso actual
    const running = this.scheduler.current();
    if (running !== undefined) {
      this.scheduler.onCpuTick();
      this.busyTicks += 1;

      // Caso A: El proceso terminó todo su tiempo de CPU
      if (running.remainingCpu === 0) {
        running.finish();
        this.memory.release(running.pid);
        this.terminated.push(running);
        this.scheduler.clearCurrent();
      }
      // Caso B: El proceso pide Entrada/Salida
      else if (running.shouldBlockForIo()) {
        running.blockForIo();
        this.blocked.push(running);
        this.scheduler.clearCurrent();

        // Si hay otros procesos esperando en la cola, cuenta como cambio de contexto
        if (this.scheduler.readyQueue().length > 0) {
          this.contextSwitches += 1;
        }
      }
      // Caso C: Al proceso se le acabó el quantum
      else if (this.scheduler.shouldRotate()) {
        if (this.scheduler.readyQueue().length > 0) {
          // Hay otros esperando: rota y se cuenta cambio de contexto
          this.scheduler.rotate();
          this.contextSwitches += 1;
        } else {
          // No hay nadie más esperando: renueva el quantum y sigue derecho
          running.renewQuantum();
        }
      }
    }

    // 5. Sumamos un tick al reloj general
    this._tick += 1;
  }

  // Saca una foto completa del estado actual
  public state(): SimulationSnapshot {
    this.ensureStarted();

    const listaReady: string[] = [];
    for (const p of this.scheduler.readyQueue()) {
      listaReady.push(p.pid);
    }

    const listaWaiting: string[] = [];
    for (const p of this.waiting) {
      listaWaiting.push(p.pid);
    }

    const listaBlocked: string[] = [];
    for (const p of this.blocked) {
      listaBlocked.push(p.pid);
    }

    const listaTerminated: string[] = [];
    for (const p of this.terminated) {
      listaTerminated.push(p.pid);
    }

    const listaMemoria = [];
    for (const bloque of this.memory.blocks()) {
      listaMemoria.push({
        start: bloque.start,
        size: bloque.size,
        free: bloque.free,
        pid: bloque.pid,
      });
    }

    const procesoEnCpu = this.scheduler.current();

    return {
      tick: this._tick,
      cpuProcess: procesoEnCpu ? procesoEnCpu.pid : undefined,
      ready: listaReady,
      waitingForMemory: listaWaiting,
      blocked: listaBlocked,
      terminated: listaTerminated,
      memory: listaMemoria,
      metrics: this.metrics(),
    };
  }

  // Devuelve las métricas del sistema calculadas al tick actual
  public metrics(): Metrics {
    this.ensureStarted();
    return this.metricsCalculator.calculate(
      this.contextSwitches,
      this._tick,
      this.busyTicks
    );
  }

  // Devuelve los datos de un proceso según su PID
  public getProcess(pid: string): Readonly<Process> {
    this.ensureStarted();
    const proceso = this.processes.get(pid);
    if (!proceso) {
      throw new Error(`No existe el PID ${pid}`);
    }
    return proceso;
  }

  // Revisa la cola de espera de memoria e intenta admitir procesos por orden de llegada
  private admitWaitingProcesses(): void {
    let i = 0;
    while (i < this.waiting.length) {
      const proceso = this.waiting[i];
      const pudoAsignar = this.memory.allocate(
        proceso.pid,
        proceso.memoryRequired,
        this.allocationPolicy
      );

      if (pudoAsignar) {
        proceso.admit();
        this.scheduler.enqueue(proceso);
        this.waiting.splice(i, 1);
      } else {
        i++;
      }
    }
  }

  // Actualiza los procesos que están esperando en E/S
  private updateBlockedProcesses(): void {
    let i = 0;
    while (i < this.blocked.length) {
      const proceso = this.blocked[i];
      const terminoBloqueo = proceso.updateBlocked();

      if (terminoBloqueo) {
        this.scheduler.enqueue(proceso);
        this.blocked.splice(i, 1);
      } else {
        i++;
      }
    }
  }

  // Si la CPU quedó desocupada, despacha el siguiente de la cola de listos
  private dispatchIfNeeded(): void {
    if (this.scheduler.current() === undefined) {
      this.scheduler.dispatch();
    }
  }

  // Chequea que el simulador esté configurado antes de usarlo
  private ensureStarted(): void {
    if (!this.started) {
      throw new Error('La simulación no fue configurada');
    }
  }
}

// [commit] docs: pulimos los comentarios finales en criollo para la entrega del TP
