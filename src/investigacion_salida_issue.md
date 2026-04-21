# Investigación: Issue con guardado de salidas en modal

## Resumen

El problema reportado —que los registros de salidas guardadas no se reflejan en la tabla y que las ediciones directas en la tabla se reinician al recargar— se debe a un problema de sincronización entre el formulario modal y el estado de la tabla principal.

### Causa raíz

El flujo de guardado a través del **`SalidaModal.tsx`** tiene una secuencia crítica:

1. El modal llama a `upsertSalida()` para persistir el dato.
2. Al cerrar el modal, el manejador `onClose` ejecuta:
   - `loadInitialData()` → **no reinicia `salidasMap`** (el Map que almacena salidas en la tabla principal)
   - `cachedDeptYearRef.current = null` → invalida el caché
   - `cargarSalidas()` → intenta refetchear los datos

### Problemas identificados

1. **`loadInitialData()` no limpia `salidasMap`**: cuando se llama desde el modal, el mapa anterior persiste en memoria. Aunque `cargarSalidas()` debería sobrescribirlo, el efecto combinado de cierres asíncronos y closures puede hacer que el `cargarSalidas()` lea valores desactualizados de `departamentoId`/`year`.

2. **Cache desincronizado**: `cargarSalidas()` verifica `cachedDeptYearRef.current` antes de hacer la consulta. Si la secuencia de renders hace que el ref no esté actualizado a `null` en el momento exacto de la verificación, la función **retorna temprano** sin hacer el fetch, dejando los datos antiguos.

3. **Diferencia con edición directa en tabla**: `handleCellChange` en `VistaCatalogoMejorada.tsx` sí actualiza `salidasMap` de forma optimista y además **resetea el cache** (`cachedDeptYearRef.current`) después de guardar, asegurando que la siguiente lectura siempre refleje el estado más reciente.

### Conclusión

El comportamiento inconsistente es resultado de que el guardado desde el modal no sigue el mismo patrón seguro que el uso directo de la tabla: no limpia el mapa de datos, y depende de una secuencia asíncrona de estado (`cachedDeptYearRef`) que puede fallar por race conditions entre cierres de modal y ejecución de efectos.

### Recomendaciones clave

- Asegurar que `loadInitialData()` desde el modal **resetee `salidasMap` a un Map vacío** antes de intentar recargar.
- O bien, hacer que el guardado del modal **actualice `salidasMap` directamente** con la respuesta de la API, en lugar de depender de un recargue completo.
- Verificar que `cachedDeptYearRef.current` esté realmente en `null` cuando `cargarSalidas()` lo consulta, usando `useRef` de forma más consistente o asegurando un `await` de estado antes de invocar el siguiente paso.