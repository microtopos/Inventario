# Gestión de Almacén — App de escritorio

Aplicación de escritorio para la gestión integral del almacén: inventario de ropa de trabajo, control de repostajes de vehículos y seguimiento de consumo de productos de limpieza.

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework desktop | [Tauri v2](https://tauri.app/) (Rust + WebView) |
| Frontend | React 19 + TypeScript (Vite) |
| Base de datos | SQLite local vía `tauri-plugin-sql` (archivo `inventario.db`) |
| Estilos | CSS inline (100%) + `src/index.css` + `src/App.css` |
| Gráficos | Recharts |
| Iconos | Lucide React |
| Exportación | jsPDF (PDF) + SheetJS/xlsx (Excel) |
| Backend Rust | Comandos para imágenes y backups de BD |

---

## Requisitos previos

- **Node.js** ≥ 18
- **Rust** ≥ 1.77.2 ([rustup](https://rustup.rs/))
- **Windows**: [Microsoft Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (para compilar dependencias Rust)
- **npm** (viene con Node.js)

---

## Primer arranque

```bash
# Instalar dependencias frontend
npm install

# Arrancar en modo desarrollo (Vite + Tauri)
npm run tauri dev
```

El comando `tauri dev` levanta el servidor Vite en `localhost:5173` y abre la ventana nativa de Tauri.

---

## Comandos disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Solo frontend (Vite, sin Tauri) — útil para desarrollo rápido de UI |
| `npm run tauri dev` | App completa (frontend + backend Rust) |
| `npm run build` | Compila TypeScript y empaqueta con Vite |
| `npm run tauri build` | Genera el instalable (.msi/.exe) para distribución |
| `npm run lint` | ESLint sobre todo el proyecto |

---

## Estructura del proyecto

```
Inventario Ropa/
├── index.html                 # Entry point HTML
├── package.json               # Dependencias y scripts npm
├── vite.config.ts             # Configuración de Vite
├── tsconfig.json              # TypeScript
├── eslint.config.js           # ESLint
├── public/
│   └── vite.svg               # Favicon
├── src/                       # ── Código fuente frontend ──
│   ├── main.tsx               # Punto de entrada React
│   ├── App.tsx                # Componente raíz + vista de inventario de ropa
│   ├── App.css / index.css    # Estilos globales
│   ├── styles.ts              # Objetos de estilo reutilizables
│   │
│   │  # ── Páginas ──
│   ├── CleaningPage.tsx       # Gestión de productos de limpieza (estadísticas, departamentos)
│   ├── CatalogView.tsx        # Vista tabla del catálogo con salidas mensuales
│   ├── FuelPage.tsx           # Gestión de vehículos y repostajes
│   ├── OrderPage.tsx          # Creación de pedido (borrador)
│   ├── OrderHistoryPage.tsx   # Historial y recepción de pedidos
│   ├── ClothingStatsPage.tsx  # Dashboard / estadísticas de ropa
│   ├── StockPage.tsx          # Gestión de almacén general (artículos, movimientos, alertas)
│   │
│   │  # ── Componentes ──
│   ├── AppHeader.tsx          # Barra superior con navegación
│   ├── ClothingDetail.tsx     # Detalle de prenda: edición, stock, historial
│   ├── ClothingForm.tsx       # Formulario crear/editar prenda de ropa
│   ├── CleaningProductModal.tsx  # Modal crear/editar producto de limpieza
│   ├── ConsumptionModal.tsx   # Modal para registrar salida de producto
│   ├── StockArticuloModal.tsx # Modal crear/editar artículo de almacén (con categoría inline)
│   ├── StockMovimientoModal.tsx  # Modal registrar entrada/salida de stock
│   ├── FormField.tsx          # Campo de formulario reutilizable
│   ├── ColorSelect.tsx        # Selector de color para prendas
│   ├── DepartmentSelect.tsx   # Selector de departamento
│   ├── ConfirmDialog.tsx      # Diálogo de confirmación genérico
│   ├── Toast.tsx              # Sistema de notificaciones toast
│   │
│   │  # ── Servicios (lógica de BD) ──
│   ├── db.ts                  # Conexión a SQLite + helpers
│   ├── clothingService.ts     # CRUD prendas de ropa, tallas, stock, movimientos
│   ├── inventoryService.ts    # Consultas avanzadas de inventario de ropa
│   ├── orderService.ts        # CRUD pedidos, borrador, recepción
│   ├── cleaningService.ts     # CRUD productos de limpieza, salidas, categorías
│   ├── fuelService.ts         # CRUD vehículos y repostajes
│   ├── stockService.ts        # CRUD artículos de almacén, categorías, movimientos de stock
│   ├── statisticsService.ts   # Consultas agregadas para estadísticas de ropa
│   ├── exportService.ts       # Generación de PDFs y Excel
│   ├── backupService.ts       # Copias de seguridad de la BD
│   ├── settingsService.ts     # Preferencias persistidas en BD
│   ├── imageService.ts        # Guardado/lectura de imágenes vía comandos Rust
│   │
│   │  # ── Hooks / Utilidades ──
│   ├── DraftContext.tsx       # Estado global del borrador de pedido (debounced a BD)
│   ├── useInventory.ts        # Hook para carga y caché de inventario
│   ├── useAsyncAction.ts      # Hook para acciones asíncronas con loading/error
│   ├── usePagination.ts       # Hook genérico de paginación
│   ├── useSortableTable.ts    # Hook para tablas con ordenación
│   ├── getImageUrl.ts         # Resolución de URLs de imágenes desde disco
│   ├── sortSizes.ts           # Ordenación de tallas (XS, S, M, L, XL…)
│   ├── seedInventory.ts       # Importación de inventario semilla desde JSON
│   └── data/inventario.json  # Datos semilla de ejemplo
│
└── src-tauri/                 # ── Backend Rust (Tauri) ──
    ├── Cargo.toml             # Dependencias Rust
    ├── tauri.conf.json        # Configuración de Tauri
    ├── build.rs               # Script de build
    ├── capabilities/
    │   └── default.json       # Permisos de plugins Tauri
    ├── icons/                 # Iconos de la app (todos los tamaños)
    └── src/
        ├── main.rs            # Entry point Rust
        └── lib.rs             # Comandos Tauri (imágenes, backups)
```

---

## Modelo de datos

Base de datos única: `inventario.db` (SQLite). Se crea automáticamente al primer arranque.

### Ropa
```
departamentos       id, nombre
productos           id, codigo, nombre, departamento_id, color, foto
tallas              id, producto_id, talla, stock
movimientos         id, talla_id, cambio, origen (manual|pedido), fecha
pedidos             id, fecha, recibido, borrador, notas, fecha_recibido
pedido_items        id, pedido_id, talla_id, cantidad, cantidad_acordada, cantidad_recibida, estado
colores             id, nombre
```

### Gasolina
```
vehiculos           id, matricula, nombre, activo
repostajes          id, vehiculo_id, fecha, coste, litros, notas
```

### Productos de limpieza
```
categorias_producto     id, nombre
productos_almacen       id, referencia, nombre, categoria_id, unidad_medida, activo, precio
departamentos_prod      id, nombre
salidas_productos       id, producto_id, departamento_id, cantidad, mes, anio
presentaciones          id, producto_id, unidad_id, precio
unidades_presentacion   id, nombre
```

### Almacén general
```
categorias_stock    id, nombre
articulos_stock     id, nombre, categoria_id, unidad, stock_actual, stock_minimo, activo
movimientos_stock   id, articulo_id, tipo (entrada|salida), cantidad, notas, fecha
```

### Configuración
```
settings            key, value
```

---

## Los 4 módulos de la app

### 1. Ropa
Gestión de inventario de ropa de trabajo con tallas. CRUD de prendas, ajustes de stock (entrada/salida) con historial, pedidos con borradores persistentes, recepción de pedidos, estadísticas y exportación a PDF/Excel.

### 2. Gasolina
Registro de vehículos y repostajes. CRUD de vehículos (con activación/desactivación), registro de repostajes (fecha + coste), gráficos de evolución y filtros por vehículo/fechas.

### 3. Productos de limpieza
Catálogo de ~60 productos de limpieza por categoría. Registro de salidas mensuales por departamento, vista de matriz de consumo (producto × departamento × mes), presentaciones con precios, importación desde Excel.

### 4. Almacén general
Control de stock genérico para cualquier tipo de artículo (consumibles, herramientas, materiales, etc.). CRUD de artículos con unidad configurable, stock mínimo de alerta y activación/desactivación. Registro de entradas y salidas con historial paginado por artículo, filtrable por tipo y rango de fechas. Barra de resumen colapsable con alertas de stock bajo o sin stock y los últimos movimientos globales. Las categorías se crean al vuelo desde el propio formulario del artículo.

---

## Patrones y convenciones

Seguir estos patrones al añadir funcionalidad o arreglar bugs:

- **Servicios:** Toda la lógica de BD va en archivos `xxxService.ts`. Las queries son SQL directas vía `db.ts` (que usa `@tauri-apps/plugin-sql`). No hay ORM. **Todos los servicios deben usar `getDB()` de `./db` — nunca llamar a `Database.load()` directamente**, ya que el singleton gestiona la conexión única, aplica los PRAGMAs de sesión (`foreign_keys`, `busy_timeout`) y garantiza que `resetDBInstance()` funcione correctamente.
- **Insertar y obtener el ID:** usar `result.lastInsertId` del valor devuelto por `db.execute()`. No usar `SELECT last_insert_rowid()` (no es fiable con múltiples accesos).
- **Operaciones multi-paso en BD:** envolver en `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK` cualquier secuencia de queries que deba ser atómica (deletes en cascada manual, imports, etc.).
- **Hooks reutilizables:** `useAsyncAction` para loading/error, `usePagination` para listas, `useSortableTable` para ordenación.
- **Estilos:** Objetos inline en `styles.ts`. No usar Tailwind ni CSS modules. Los estilos se definen como objetos TypeScript y se pasan vía `style={}`.
- **Modales:** Patrón de `ConfirmDialog` para confirmaciones y `CleaningProductModal`/`ConsumptionModal` para edición. El hook `useConfirm()` devuelve `{ confirm, alert, dialog }` — hay que renderizar `{dialog}` en el JSX del componente que lo use.
- **Toast:** Usar `useToast()` para notificaciones.
- **Borrador de pedido:** El `DraftContext` sincroniza automáticamente a BD con debounce de 600ms. No hace falta guardar manualmente.
- **Imágenes:** Se guardan como .jpg en disco (`AppData/images/`) redimensionadas a 600×600. Se leen vía comando Rust y se cachean en `getImageUrl.ts`. En cada push a red se copian también a `{red}/images/`; al restaurar desde red se copian de vuelta automáticamente.

---

## Build para distribución

```bash
npm run tauri build
```

Genera el instalable en `src-tauri/target/release/bundle/`. Configuración en `src-tauri/tauri.conf.json`.

---

## Notas

- La app es monousuario, ejecutándose en local en Windows.
- Los datos de los 3 módulos comparten la misma BD (`inventario.db`).
- Los departamentos de Ropa y de Productos son entidades separadas (tablas distintas).
- El backend Rust (`src-tauri/src/lib.rs`) expone comandos para leer/guardar/borrar imágenes del sistema de archivos y hacer backup de la BD.
