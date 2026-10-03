export enum ProcessState {
  NUEVO = 'Nuevo',
  ESPERANDO_MEMORIA = 'Esperando Memoria',
  LISTO = 'Listo',
  EJECUTANDO = 'Ejecutando',
  BLOQUEADO = 'Bloqueado',
  TERMINADO = 'Terminado'
}

export enum AllocationPolicy {
  FIRST_FIT = 'First-Fit',
  BEST_FIT = 'Best-Fit',
  WORST_FIT = 'Worst-Fit'
}
