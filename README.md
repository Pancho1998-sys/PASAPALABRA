# AE2 - Simulador de Gestión de Procesos y Memoria (TypeScript)

Este proyecto consiste en un **simulador discreto de gestión de procesos y memoria contigua** implementado en **TypeScript**. El simulador modela la interacción entre la planificación de la CPU (algoritmo Round-Robin) y la gestión de memoria principal (particionamiento dinámico con distintas políticas de ajuste), operando paso a paso mediante ciclos de reloj (*ticks*).

---

## 🚀 Descripción del Proyecto

El simulador administra el ciclo de vida completo de los procesos en un sistema operativo, coordinando la admisión según disponibilidad de memoria, el ciclo de ejecución en CPU, las interrupciones por operaciones de Entrada/Salida (E/S) y la liberación/fusión de bloques de memoria.

### 📋 Requerimientos Funcionales (RF-01 a RF-10)

1. **RF-01: Configuración Inicial del Sistema**
   - Inicializa el simulador definiendo la memoria principal total (en KB/MB) y la duración del **Quantum** de CPU.

2. **RF-02: Registro de Procesos**
   - Registra procesos especificando su identificador único (`PID`), la memoria requerida, el tiempo total de ejecucion en CPU y eventos opcionales de Entrada/Salida (`afterCpuTicks`, `duration`).

3. **RF-03: Admisión y Transiciones de Estado**
   - Maneja el ciclo de vida formal de los procesos atravesando los estados:
     `Nuevo` ➔ `Esperando Memoria` ➔ `Listo` ➔ `Ejecutando` ➔ `Bloqueado` ➔ `Terminado`.

4. **RF-04: Asignación de Memoria Contigua**
   - Asigna memoria contigua a los procesos según tres políticas configurables:
     - **First-Fit**: Asigna el primer bloque libre con tamaño suficiente.
     - **Best-Fit**: Asigna el bloque libre de menor tamaño donde quepa el proceso.
     - **Worst-Fit**: Asigna el bloque libre de mayor tamaño disponible.

5. **RF-05: Liberación y Fusión de Memoria**
   - Libera la partición asignada cuando un proceso finaliza y fusiona automáticamente los bloques libres contiguos adyacentes para prevenir la fragmentación.

6. **RF-06: Ciclos de Reloj (*Tick*) y Control del Quantum**
   - Modela el avance del tiempo mediante el método `tick()`. Avanza el consumo de CPU del proceso en ejecución y desaloja procesos cuando expira el Quantum.

7. **RF-07: Planificación de CPU (*Round-Robin*)**
   - Implementa una cola de procesos listos orientada a *Round-Robin*, distribuyendo el uso de la CPU entre los procesos activos respetando el Quantum.

8. **RF-08: Gestión de Dispositivos de Entrada/Salida (E/S)**
   - Transicion de procesos a estado `Bloqueado` cuando solicitan E/S tras un número determinado de ciclos en CPU, reincorporándolos a la cola de `Listo` una vez cumplida la duración de la E/S.

9. **RF-09: Cálculo de Métricas en Tiempo Real**
   - Calcula métricas esenciales del sistema:
     - Porcentaje de ocupación de memoria.
     - Utilización de la CPU (ticks ocupados vs. totales).
     - Contador de cambios de contexto.
     - Fragmentación externa.
     - Total de memoria libre y el tamaño del bloque libre mayor.

10. **RF-10: Consultas e Invariantes del Sistema**
    - Proporciona capturas de estado completo (*SimulationSnapshot*) e inspección individual de cada proceso y bloque de memoria.

---

## 🏗️ Estructura del Código Fuente

```text
src/
├── enums.ts             # Estados de procesos y políticas de asignación
├── interfaces.ts        # Interfaces para bloques de memoria, métricas y snapshots
├── memory-block.ts      # Representación de bloques y particiones de memoria
├── memory-manager.ts    # Gestor de memoria contigua y algoritmos First/Best/Worst-Fit
├── metrics.ts           # Calculador de métricas del sistema
├── process.ts           # Control de bloque de proceso (PCB) y transiciones
├── scheduler.ts         # Planificador Round-Robin y cola de listos
├── simulator.ts         # Motor principal de la simulación (orquestador)
└── index.ts             # Exportaciones principales del paquete
```

---

## 🛠️ Instalación y Uso

### Prerequisitos
- **Node.js** (versión 18 o superior)
- **npm**

### Instalación de dependencias
```bash
npm install
```

### Ejecutar Pruebas Unitarias
El proyecto utiliza **Vitest** con 10 suites de prueba correspondientes a cada requerimiento funcional:
```bash
npm test
```

### Reporte de Cobertura
```bash
npm run coverage
```

### Compilar TypeScript
```bash
npm run build
```
