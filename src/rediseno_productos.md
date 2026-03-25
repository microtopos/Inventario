# Rediseño de Página de Productos (Limpieza)

## 📊 Contexto y Análisis

### Sistema Actual
La aplicación gestiona **dos tipos de productos** distintos:

1. **Productos de Ropa** (`productService.ts`)
   - Prendas con tallas, colores, departamentos
   - Gestión de stock por talla
   - Página `ProductDetail.tsx`

2. **Productos de Limpieza** (`productosService.ts`) ← **Enfoque de este rediseño**
   - Catálogo general: bolsas, papel, químicos, etc.
   - Consumo mensual por departamento
   - Páginas: `ProductsPage.tsx` (catálogo, registrar salida, estadísticas)

### Problema Identificado
La página actual fue desarrollada sin considerar el uso real. Se necesita una **vista tipo Excel** que permita:
- Ver consumo mes a mes de cada departamento
- Editar datos rápidamente
- Importar datos desde Excel
- Gestionar productos (crear, editar, eliminar)
- Filtrar por departamento

---

## 📋 Requisitos del Usuario

### ✅ Confirmados

1. **Vista principal**: Tabla tipo Excel con:
   - Filas = Productos
   - Columnas fijas: Referencia, Nombre, **Precio (€/unidad)**, Categoría, Unidad de medida
   - Columnas dinámicas: 12 meses del año (Enero-Diciembre)
   - Filtro obligatorio por departamento para ver consumos
   - Búsqueda por referencia o nombre
   - Agrupación por categorías (colapsables)
   - Fila de totales por mes al final

2. **Edición**:
   - ✅ Celdas de meses editables directamente (como matriz actual)
   - ✅ Modal para editar datos del producto (referencia, nombre, categoría, unidad, **precio**)
   - ✅ Eliminación de productos (con confirmación)
   - ✅ Añadir nuevos productos

3. **Importación desde Excel**:
   - Formato: columnas de meses detectadas automáticamente (Ene, Feb, Mar, etc.)
   - Filas de categoría: referencia no vacía + descripción vacía
   - Parseo de cantidades: extraer número de texto ("4 ROLLOS" → 4)
   - Crear categorías nuevas automáticamente
   - Upsert de productos por referencia
   - Upsert de salidas por producto+departamento+mes+año
   - Vista previa antes de importar
   - Selección de departamento y año

4. **Campos adicionales**:
   - **Precio** (€/unidad, paquete, caja) - opcional,numérico

5. **Organización visual**:
   - Agrupación por categorías con colapsables
   - Totalizadores al final de tabla
   -limpieza y clara

---

## 🗄️ Estructura de Base de Datos

### Tablas Existentes

```sql
categorias_producto (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
)

productos_almacen (
  id INTEGER PRIMARY KEY,
  referencia TEXT NOT NULL,
  nombre TEXT NOT NULL,
  categoria_id INTEGER NOT NULL REFERENCES categorias_producto(id),
  unidad_medida TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  precio DECIMAL(10,2) DEFAULT NULL  -- ← NUEVO
)

departamentos_prod (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
)

salidas_productos (
  id INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos_almacen(id),
  departamento_id INTEGER NOT NULL REFERENCES departamentos_prod(id),
  cantidad INTEGER NOT NULL DEFAULT 0,
  mes INTEGER NOT NULL CHECK(mes BETWEEN 1 AND 12),
  anio INTEGER NOT NULL
)

CREATE UNIQUE INDEX idx_salidas_unica
  ON salidas_productos(producto_id, departamento_id, mes, anio);
```

---

## 🔄 Flujo de Usuario

### 1. Vista de Catálogo (Principal)
```
Usuario entra → Selecciona departamento → Ve tabla con productos agrupados por categoría
                         ↓
                [Buscador] [Año] [Importar Excel] [+ Nuevo producto]
                         ↓
            Cada celda de mes es editable (onBlur guarda automáticamente)
                         ↓
           Acciones por fila: [Editar] [Eliminar]
```

### 2. Edición de Producto
```
Click "Editar" → Modal con campos:
  - Referencia (requerido)
  - Nombre/Descripción (requerido)
  - Categoría (dropdown)
  - Unidad de medida (requerido)
  - Precio (€) - opcional
                         ↓
                Guardar → Recarga tabla
```

### 3. Importación desde Excel
```
Click "Importar Excel" → Subir archivo (.xlsx/.xls/.csv)
                         ↓
                Detección automática de estructura
                         ↓
                Vista previa (primeros 50 productos)
                         ↓
         Seleccionar departamento + año
                         ↓
              Confirmar importación
                         ↓
  Para cada producto:
    - Obtener/crear categoría
    - Crear/actualizar producto (por referencia)
    - Para cada mes con cantidad: upsert salida
                         ↓
                "Importación completada"
```

---

## 📦 Componentes Nuevos/Modificados

### Archivos Creados

| Archivo | Descripción |
|---------|-------------|
| `VistaCatalogoMejorada.tsx` | Componente principal de tabla tipo Excel con agrupación por categorías |
| `ImportarProductosModal.tsx` | Modal para importar datos desde Excel/CSV |
| `ProductModal.tsx` | Modal de edición de producto (extraído de ProductsPage) |
| `add_precio_column.mjs` | Script de migración para bases de datos existentes |

### Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `init_db.mjs` | Añadida columna `precio` en schema y SELECT |
| `productosService.ts` | Añadido campo `precio` en interfaz y queries; nuevas funciones `deleteProduct`, `getSalidasByYear`, `ensureProduct` |
| `ProductsPage.tsx` | Reemplazado `VistaCatalogo` por `VistaCatalogoMejorada`; añadido botón de importación |
| `src-tauri/src/lib.rs` | Añadida **Migración 6**: `ALTER TABLE productos_almacen ADD COLUMN precio DECIMAL(10,2) DEFAULT NULL;` |

---

## 🔧 Funciones de Servicio (productosService.ts)

### Nuevas Funciones

```typescript
// Elimina producto y todas sus salidas
export async function deleteProduct(productId: number): Promise<void>

// Obtiene salidas de un año como mapa: producto_id → mes → cantidad
export async function getSalidasByYear(
  year: number,
  departamentoId?: number
): Promise<Map<number, Map<number, number>>>

// Crea o actualiza producto (upsert por referencia)
export async function ensureProduct(
  referencia: string,
  nombre: string,
  categoriaId: number,
  unidadMedida: string,
  precio?: number | null
): Promise<number>
```

### Funciones Modificadas

- `getProductos()`: añadido `p.precio` en SELECT
- `getProductosPorCategoria()`: añadido `p.precio` en SELECT
- `crearProducto()`: añadido parámetro `precio`
- `actualizarProducto()`: añadido campo `precio` en actualización

---

## 🎨 Estilos y UX

### Paleta de Colores
- Verde principal: `#16a34a` (guardar, éxito)
- Azul: `#2563eb` (acciones)
- Rojo: `#dc2626` (eliminar, peligro)
- Grises fondos: `#f5f5f5`, `#fff`, `#f9fafb`

### Layout de Tabla
- **Sticky header** para categorías
- **Columnas fijas** (Referencia, Nombre) con `position: sticky` sugerido (pendiente)
- **Inputs numéricos** para celdas de meses (width: 60px, centered)
- **Total por producto**: columna "Total" al lado de los meses
- **Fila de totales**: fondo gris claro, negrita, al final de tabla

### Responsive
- Scroll horizontal automático cuando hay muchas columnas
- Controles superiores responsive (flexWrap: "wrap")
- Modal con `maxWidth: calc(100vw - 32px)`

---

## ⚙️ Configuración Técnica

### Dependencias
- `xlsx`: ^0.18.5 (ya instalado) → para importación Excel
- `recharts`: para gráficos (ya instalado, aunque no se usa en esta vista)

### SQLite Pragmas (anti-lock)
```sql
PRAGMA busy_timeout = 10000;  -- Espera 10s antes de fallar por bloqueo
PRAGMA journal_mode = WAL;     -- Permite lecturas concurrentes durante escrituras
```

### Retry Logic
- Función `withRetry<T>`: hasta 3 reintentos con backoff exponencial
- Aplicada a todas las operaciones de BD mediante `getDbWithRetry()`

---

## 🚀 Instrucciones de Migración

### Para Bases de Datos Nuevas (desarrollo)
1. Eliminar `inventario.db`
2. Ejecutar `npm run dev` → crea DB desde `init_db.mjs` con todos los campos
3. Listo

### Para Bases de Datos Existentes (producción)
**Opción A: Migración automática Tauri**
1. Cerrar aplicación
2. Actualizar código (incluye migración versión 6 en `lib.rs`)
3. Iniciar aplicación → Tauri ejecuta migración automáticamente

**Opción B: Script Node.js (respaldo)**
```bash
node add_precio_column.mjs
```
Esto añade la columna `precio` a la tabla existente sin borrar datos.

---

## 🐛 Problemas Conocidos y Soluciones

### Error: "database is locked"

**Causa**: SQLite permite un solo escritor concurrente. Se produce cuando:
- La migración está ejecutándose
- La importación está insertando datos
- La UI está consultando simultáneamente

**Soluciones implementadas**:
1. ✅ `PRAGMA busy_timeout = 10000` en migración y conexión
2. ✅ `PRAGMA journal_mode = WAL` para lecturas durante escrituras
3. ✅ Retry automático en funciones de BD (3 intentos con backoff)
4. ✅ Importación en lotes de 10 con pausa de 150ms entre lotes
5. ✅ Lotes en `ImportarProductosModal.tsx`

**Si persiste**:
- Cerrar otros programas que puedan usar la DB
- Asegurar que no hay múltiples instancias de la app abiertas
- Reiniciar el sistema (liberar file locks de Windows)

---

## ✅ Tareas Completadas

1. ✅ Añadir columna `precio` a tabla `productos_almacen`
2. ✅ Actualizar `init_db.mjs` con nuevo schema
3. ✅ Crear script `add_precio_column.mjs` para migración
4. ✅ Actualizar `productosService.ts`:
   - Interface `ProductoAlmacen` con campo `precio`
   - Funciones `getProductos`, `getProductosPorCategoria` con `precio`
   - `crearProducto`, `actualizarProducto` con `precio`
   - Nuevas: `deleteProduct`, `getSalidasByYear`, `ensureProduct`
5. ✅ Extraer `ProductModal.tsx` y añadir campo precio
6. ✅ Crear `VistaCatalogoMejorada.tsx` con tabla tipo Excel
7. ✅ Crear `ImportarProductosModal.tsx` con parser Excel
8. ✅ Modificar `ProductsPage.tsx` para usar nueva vista
9. ✅ Añadir migración versión 6 en `lib.rs`
10. ✅ Implementar retry logic y WAL mode para evitar locks

---

## 📝 Decisiones de Diseño

### 1. **Precio por unidad/paquete/caja**
Se almacena como `DECIMAL(10,2)` y es opcional. Se muestra en tabla como "X.XX €".

### 2. **Agrupación por categorías**
Se usa un `Set<number>` para controlar expand/collapse. Cada categoría es una fila con `colSpan` y alExpandido muestra sus productos.

### 3. **Edición directa en tabla**
Los inputs de meses tienen `onChange` que llama a `upsertSalida` inmediatamente. Se muestra indicador de "Guardando..." mientras se ejecuta.

### 4. **Importación upsert**
- Por **referencia** (identificador único)
- Si producto existe: actualizar nombre, categoría, unidad, precio (mantener existente)
- Si no existe: crear nuevo
- Para salidas: `INSERT ... ON CONFLICT DO UPDATE`

### 5. **Detección de meses en Excel**
Se parsean nombres de columna buscando substrings: ENE, FEB, MAR, ABR, MAY, JUN, JUL, AGO, SET/SEP, OCT, NOV, DIC. Soporta versiones cortas y largas (Enero, Febrero, etc.).

### 6. **Categorías dinámicas**
Si en el Excel aparece una categoría que no existe en BD, se crea automáticamente con `crearCategoria()`.

---

## 🔮 Mejoras Futuras (Scope fuera de este rediseño)

- Exportar tabla a CSV/Excel
- Filtro por categoría además de departamento
- Búsqueda por código (si se añade en el futuro)
- Vista de estadísticas más rica (gráficos de tendencia)
- Historial de cambios (quién, cuándo) en salidas
- Lote de ajuste de stock (como en ProductDetail de ropa)
- Adjuntar imágenes a productos de limpieza
- Código de barras / QR

---

## 📂 Estructura de Archivos

```
src/
├── productosService.ts         # Servicios de BD (modificado)
├── ProductsPage.tsx            # Página principal (modificado)
├── ProductModal.tsx            # Modal edición producto (nuevo)
├── VistaCatalogoMejorada.tsx   # Tabla tipo Excel (nuevo)
├── ImportarProductosModal.tsx  # Importador Excel (nuevo)
├── rediseno_productos.md       # Este documento
└── add_precio_column.mjs       # Script migración (nuevo)

src-tauri/src/
└── lib.rs                      # Migración versión 6 añadida
```

---

## 📊 Formato del Excel de Origen

Basado en `PEDIDO LIMPIEZ DESARROLLO.xlsx`:

| Columna A | Columna B | Columna C | Columna D | Columna E | ... |
|-----------|-----------|-----------|-----------|-----------|-----|
| REFERENCIA | DESCRIPCIÓN | CANTIDAD | ENERO | FEBRERO | MARZO |
| BOLSA-001 | Bolsa basura 50L | UNIDAD | 4 | 6 | 8 |
| ... | ... | ... | ... | ... | ... |

**Fila de categoría**: Primera columna con texto, segunda columna vacía → esa fila define la categoría para los productos siguientes.

---

## 🧪 Testing Checklist

- [ ] Migración automática aplica columna `precio`
- [ ] Crear nuevo producto con precio
- [ ] Editar producto existente (cambiar precio, nombre, categoría)
- [ ] Eliminar producto (borra también salidas)
- [ ] Tabla muestra productos agrupados por categoría
- [ ] Expandir/colapsar categorías funciona
- [ ] Filtro por departamento filtra consumos
- [ ] Búsqueda por texto funciona
- [ ] Editar celda de mes guarda automáticamente
- [ ] Totales por mes se calculan correctamente
- [ ] Importar Excel detecta estructura correctamente
- [ ] Categorías nuevas se crean automáticamente
- [ ] Productos existentes se actualizan (upsert)
- [ ] Salidas se insertan/actualizan correctamente
- [ ] Manejo de errores de importación (producto con datos faltantes)
- [ ] Sin errores "database is locked" en uso normal

---

## 📞 Contacto y Soporte

Para cualquier duda sobre la implementación, revisar:
- Código fuente en `src/`
- Logs de consola (Tauri dev tools)
- Archivo de errores: `inventario.db` (puede abrirse con DB Browser for SQLite)

---

**Última actualización**: 2025-03-25
**Estado**: ✅ Implementación completada, en fase de pruebas
