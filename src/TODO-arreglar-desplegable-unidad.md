# TODO: Arreglar bug del desplegable de tipos de unidad

## Problema
En `VistaCatalogoMejorada.tsx`, la columna "Unidad" muestra "-" en lugar del desplegable para seleccionar el tipo de unidad de presentación.

## Causa raíz
1. La función `cargarTodasLasPresentaciones` (líneas 144-168) solo carga productos activos (`p.activo === 1`)
2. Si un producto no tiene registros en la tabla `producto_presentaciones`, el array queda vacío y muestra "-"

---

## Tareas a realizar

### 1. Modificar `cargarTodasLasPresentaciones` para incluir todos los productos
- **Ubicación:** `VistaCatalogoMejorada.tsx`, línea 147
- **Cambio:** Cambiar `productos.filter(p => p.activo === 1)` por `productos` (todos los productos)

### 2. Crear presentación por defecto si no existe ninguna
- **Ubicación:** `VistaCatalogoMejorada.tsx`, dentro del `for` de `cargarTodasLasPresentaciones` (líneas 152-161)
- **Cambio:** Agregar lógica para crear una presentación por defecto basada en `unidad_medida` del producto cuando `presentaciones.length === 0`

```typescript
// Después de obtener las presentaciones:
if (presentaciones.length === 0) {
  // Crear presentación por defecto
  presentacionesMap.set(producto.id, [{
    id: -1, // ID especial para presentación por defecto
    unidad_id: 0,
    nombre: producto.unidad_medida || "Unidad",
    precio: producto.precio ?? null
  }]);
  seleccionadasMap.set(producto.id, -1);
} else {
  presentacionesMap.set(producto.id, presentaciones);
  seleccionadasMap.set(producto.id, presentaciones[0].id);
}
```

### 3. Manejar el caso de presentación por defecto en el select
- **Ubicación:** `VistaCatalogoMejorada.tsx`, líneas 904-936
- **Cambio:** El código ya maneja el valor `-1` para "Añadir tipo...", pero hay que asegurar que el select funcione correctamente cuando la presentación tiene `id: -1`

---

## Archivos a modificar
- `src/VistaCatalogoMejorada.tsx`

## Estado
- [ ] Tarea 1: Incluir todos los productos (no solo activos)
- [ ] Tarea 2: Crear presentación por defecto
- [ ] Tarea 3: Verificar funcionamiento del select