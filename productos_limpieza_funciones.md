# Archivos y Funciones: Gestión de Productos de Limpieza

Este documento lista los archivos en `src/` encargados de **guardar** (CRUD, salidas, presentaciones) y **mostrar** datos de productos de limpieza (inventario de almacén).

---

## 1. `src/productosService.ts`
**Propósito**: Servicio central con toda la lógica de base de datos para productos de limpieza, categorías, salidas, presentaciones y estadísticas.

### Funciones de Guardado (Saving)
| Función | Descripción |
|---------|-------------|
| `crearProducto(referencia, nombre, categoria_id, unidad_medida, precio?)` | Crea un nuevo producto en `productos_almacen`. |
| `actualizarProducto(id, datos)` | Actualiza los campos de un producto existente. |
| `desactivarProducto(id)` | Marca un producto como inactivo (`activo = 0`). |
| `reactivarProducto(id)` | Reactiva un producto (`activo = 1`). |
| `deleteProduct(productId)` | Elimina un producto y sus salidas/presentaciones asociadas. |
| `upsertSalida(datos)` | Inserta o actualiza una salida (upsert) en `salidas_productos`. |
| `eliminarSalida(id)` | Elimina un registro de salida. |
| `crearCategoria(nombre)` | Crea una nueva categoría de producto. |
| `actualizarCategoria(id, nombre)` | Actualiza el nombre de una categoría. |
| `eliminarCategoria(id)` | Elimina una categoría (solo si no tiene productos activos). |
| `ensureProduct(referencia, nombre, categoriaId, unidadMedida, precio?)` | Crea o actualiza un producto basado en su referencia. |
| `upsertPresentacion(productoId, unidadId, precio)` | Inserta o actualiza una presentación de producto. |
| `deletePresentacion(presentacionId)` | Elimina una presentación (si no tiene salidas). |
| `crearUnidadPresentacion(nombre)` | Crea una nueva unidad de presentación global. |

### Funciones de Muestra (Display)
| Función | Descripción |
|---------|-------------|
| `getCategorias()` | Obtiene todas las categorías de productos. |
| `getProductos(soloActivos?)` | Lista productos (activos por defecto) con JOIN a categoría. |
| `getProductosPorCategoria(categoria_id, soloActivos?)` | Filtra productos por categoría. |
| `getDepartamentosProd()` | Obtiene departamentos para registro de salidas. |
| `getSalidas(filtros)` | Obtiene salidas con filtros (departamento, producto, fecha). |
| `getSalidasByYear(year, departamentoId?)` | Obtiene salidas de un año desglosadas por presentación. |
| `getAniosDisponibles()` | Lista años con salidas registradas. |
| `getUnidadesPresentacion()` | Obtiene unidades de presentación globales. |
| `getAllPresentaciones()` | Obtiene todas las presentaciones de todos los productos (una sola query). |
| `getPresentacionesDeProducto(productoId)` | Presentaciones configuradas para un producto específico. |
| `getConsumoMensualPorDepartamento(filtros)` | Consumo mensual agrupado por departamento. |
| `getMatrizConsumo(anio, mes, categoria_id?)` | Matriz de consumo producto × departamento. |
| `getResumenPorDepartamento(filtros)` | Resumen de salidas por departamento. |

---

## 2. `src/ProductModal.tsx`
**Propósito**: Modal para crear o editar productos de limpieza, gestionando también sus presentaciones y precios.

### Funciones Relevantes
- `handleSubmit()`: Valida y guarda un producto nuevo o editado usando `crearProducto` / `actualizarProducto` de `productosService`.
- Carga dinámica de presentaciones (`getPresentacionesDeProducto`) al abrir el modal.
- Gestiona el estado de presentaciones: añade nuevas, actualiza precios y elimina presentaciones.
- Crea nuevas unidades de presentación sobre la marcha (`crearUnidadPresentacion`).

---

## 3. `src/VistaCatalogoMejorada.tsx`
**Propósito**: Vista principal que muestra el catálogo de productos de limpieza en una tabla interactiva, permite editar salidas mensuales y gestionar presentaciones.

### Funciones de Guardado
| Función | Descripción |
|---------|-------------|
| `handleCellChange(productoId, mes, valorStr)` | Actualiza una celda de salida mensual (llama a `upsertSalida`). |
| `handleDeleteProduct(producto)` | Elimina un producto (llama a `deleteProduct`). |
| `handleGuardarPresentacion()` | Guarda una presentación para un producto (llama a `upsertPresentacion`). |
| `handleEliminarPresentacion(productoId, pres)` | Elimina una presentación (llama a `deletePresentacion`). |
| `handleImportClick()` / `handleFileSelected(e)` | Importa productos desde Excel (usa `ensureProduct` y `upsertSalida`). |
| `handleCrearUnidadGlobal()` | Crea una unidad de presentación global (llama a `crearUnidadPresentacion`). |

### Funciones de Muestra
| Función | Descripción |
|---------|-------------|
| `loadInitialData()` | Carga inicial: categorías, productos, departamentos, presentaciones y años. |
| `cargarSalidas()` | Carga salidas para el año y departamento seleccionados. |
| `getConsumo(productoId, mes)` | Obtiene el consumo mensual de un producto/presentación. |
| `getPresActiva(productoId)` | Devuelve la presentación activa de un producto. |
| Renderizado de tabla | Muestra productos agrupados por categoría, con celdas editables para salidas mensuales. |
| Filtros | Búsqueda por referencia/nombre, filtro por departamento y año. |

---

## 4. `src/SalidaModal.tsx`
**Propósito**: Modal para registrar nuevas salidas de productos de limpieza hacia departamentos.

### Funciones Relevantes
- Permite seleccionar producto, departamento, mes, año, cantidad y presentación.
- Guarda la salida usando `upsertSalida` de `productosService`.

---

## 5. `src/exportService.ts`
**Propósito**: Exporta datos de productos y salidas a formatos portátiles (PDF, Excel).

### Funciones Esperadas
- `exportProductosToPDF()` – Genera un PDF con el catálogo de productos de limpieza.
- `exportSalidasToExcel()` – Exporta el registro de salidas a un archivo Excel.

---

## 6. `src/importInventory.ts`
**Propósito**: Importa inventario de productos desde archivos externos (Excel/CSV).

### Funciones Esperadas
- Parsea archivos Excel/CSV y carga productos usando `ensureProduct` y `upsertSalida` de `productosService`.

---

## Notas Importantes
- Los archivos `productService.ts`, `ProductForm.tsx` y `ProductDetail.tsx` gestionan **ropa** (productos con tallas), no productos de limpieza.
- Los productos de limpieza se almacenan en la tabla `productos_almacen` y usan el servicio `productosService.ts`.
- La base de datos se accede vía `@tauri-apps/plugin-sql` con retrys automáticos para evitar "database is locked".
