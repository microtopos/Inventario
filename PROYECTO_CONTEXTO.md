# Contexto del Proyecto — Expansión App de Gestión de Almacén

## Resumen ejecutivo

Expansión de la app de escritorio existente de gestión de ropa de trabajo. Se añaden dos módulos nuevos (**Gasolina** y **Productos**) y se reorganiza el módulo de **Estadísticas de Ropa** dentro de su propia sección. El objetivo es que la app sea el único punto de gestión y visualización para el responsable del almacén.

---

## Contexto del usuario

- **Perfil:** Una sola persona, ~45 años, perfil no técnico
- **Entorno:** Windows, uso en local, un único equipo
- **Uso actual:** Ya utiliza la app de ropa a diario — no hay que reaprender nada, solo ampliar

---

## Decisión de arquitectura

**No se crea una app nueva.** Se expande la app de ropa existente (`inventario.db`, Tauri v2) añadiendo:
- Nuevas páginas en el frontend (React + TypeScript)
- Nuevas tablas en el mismo SQLite local
- Nuevos servicios (siguiendo el patrón `xxxService.ts`)

**Razón:** mismo usuario, mismo PC, mismo stack. Separar en múltiples apps crea fricción innecesaria para un perfil no técnico.

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework desktop | Tauri v2 (Rust + WebView) |
| Frontend | React + TypeScript (Vite) |
| Base de datos | SQLite local — mismo archivo `inventario.db` |
| Estilos (existente) | Inline styles 100% — **no se toca** |
| Estilos (módulos nuevos) | **Tailwind CSS** |
| Gráficos | Recharts (ya instalado) |
| Exports | jsPDF + SheetJS (ya instalados) |
| Backend Rust | Comandos existentes; nuevos si se necesitan |

> **Nota sobre estilos:** Los módulos nuevos (Gasolina y Productos) usan Tailwind. La app de ropa existente mantiene sus inline styles intactos. Ambos enfoques conviven sin conflicto en Vite/Tauri.

---

## Módulos a desarrollar

### 1. Módulo — Gasolina

**Objetivo:** Registrar y visualizar el gasto de gasolina por vehículo.

**Funcionalidades:**
- CRUD de vehículos del almacén (nombre/matrícula)
- Registro de repostajes: fecha + coste (los litros son opcionales, pendiente de decisión)
- Vista de historial por vehículo con tabla editable
- Gráfico de evolución del gasto por vehículo (Recharts)
- Filtros por vehículo y rango de fechas
- Exportar historial a Excel y/o PDF

**Volumen estimado:** 5–15 vehículos, registros mensuales por cada uno.

**Modelo de datos (propuesta):**
```sql
vehiculos       id, matricula, nombre, activo
repostajes      id, vehiculo_id, fecha, coste, litros (nullable), notas
```

---

### 2. Módulo — Productos

**Objetivo:** Registrar y visualizar el consumo mensual de productos de almacén por departamento.

**Funcionalidades:**
- Catálogo de ~60 productos con referencia, descripción, categoría y unidad de medida (CRUD)
- Registro de salidas: producto + departamento + cantidad numérica + mes/año
- Vista de consumo mensual por departamento (tabla editable, estilo matriz)
- Gráfico comparativo de consumo por departamento (Recharts)
- Filtros por departamento, producto, categoría y periodo
- Exportar a Excel (formato similar al Excel actual) y PDF

**Volumen estimado:** ~52 productos reales, 8–13 departamentos, datos mensuales.

**Estructura real del Excel actual (analizado):**
- Un archivo Excel por departamento, una hoja por trimestre
- Columnas: `Nº Referencia | Descripción | Cantidad (unidad de medida) | Mes1 | Mes2 | Mes3`
- Productos agrupados por categorías: Bolsas, Celulosa, Químicos, Útiles de Limpieza
- Las cantidades están en texto libre (ej: "4 ROLLOS", "1 GARRAFA") — **en la app se guardarán como número entero**, la unidad se infiere del catálogo
- Muchas celdas vacías = sin consumo ese mes (se registra como 0 o null)

**Modelo de datos (propuesta):**
```sql
categorias_producto   id, nombre
productos_almacen     id, referencia, nombre, categoria_id, unidad_medida, activo
departamentos_prod    id, nombre                          -- tabla propia, independiente de ropa
salidas_productos     id, producto_id, departamento_id, cantidad, mes, anio
```

> **Importante:** Los departamentos de Productos son distintos a los de Ropa. Se crea una tabla `departamentos_prod` separada.

---

### 3. Estadísticas de Ropa (reorganización)

La sección `DashboardPage.tsx` existente se **mantiene donde está** dentro de la navegación de ropa. No se mueve ni se refactoriza en esta fase. Se documenta aquí para tenerla en cuenta en la navegación global.

---

## Navegación global (propuesta)

La barra lateral existente se amplía con las nuevas secciones:

```
├── Ropa (existente)
│   ├── Inventario
│   ├── Pedidos
│   ├── Historial de pedidos
│   └── Estadísticas
├── Gasolina (nuevo)
│   ├── Vehículos
│   ├── Registrar repostaje
│   └── Estadísticas
└── Productos (nuevo)
    ├── Catálogo
    ├── Registrar salida
    └── Estadísticas
```

---

## Funcionalidades transversales

| Funcionalidad | Prioridad |
|---|---|
| Gráficos / visualizaciones | Alta |
| Tablas editables | Alta |
| Exportar a PDF y Excel | Alta |
| Buscador / filtros | Alta |
| Importar desde Excel | No requerido (de momento) |

---

## Patrones y convenciones a seguir

Heredados de la app de ropa existente:

- **Servicios:** toda la lógica de BD en archivos `xxxService.ts` (ej: `gasolinaService.ts`, `productosService.ts`)
- **Hooks:** `useAsyncAction` para loading + error toast, `usePagination` para listas largas
- **Exports:** usar `exportService.ts` como referencia o extender con funciones específicas
- **BD:** queries SQL directas vía `tauri-plugin-sql`, sin ORM
- **Modales:** patrón de modales de confirmación y edición igual al de la app de ropa

---

## Migración de datos del Excel actual

### Contexto
Hay un Excel por departamento con estructura trimestral. Los datos históricos deben importarse a SQLite antes o durante el lanzamiento del módulo de Productos.

### Estrategia recomendada: script Python de migración puntual

Un script `migrate_excel.py` que:
1. Recorre todos los archivos Excel de la carpeta (uno por departamento)
2. Parsea cada hoja (un trimestre): lee filas de producto, salta cabeceras y filas de categoría
3. Extrae cantidad como número entero (limpiando texto como "4 ROLLOS" → `4`)
4. Inserta en `salidas_productos` con el mes/año correcto

**Consideraciones del Excel real:**
- Las cantidades son texto libre ("4 ROLLOS", "1 GARRAFA", "2 CAJAS") → hay que parsear solo el número inicial
- Las filas de categoría (sin referencia) deben ignorarse
- Las celdas vacías = sin consumo = no insertar fila (o insertar con cantidad 0, a decidir)
- El nombre del departamento se deduce del nombre del archivo Excel

### Alternativa más sencilla
Si los datos históricos no son críticos, cargar solo desde el mes de lanzamiento y dejar el Excel como archivo histórico de consulta.

---

## Decisiones pendientes

| Decisión | Estado |
|---|---|
| ¿Registrar litros en repostajes? | Pendiente — probablemente no, solo coste |
| ¿Celdas vacías en Excel = 0 o sin registro? | Pendiente — afecta a la migración |
| ¿Migrar histórico completo o solo desde lanzamiento? | Pendiente |
| ¿Añadir campo "notas" en repostajes? | Abierto |

---

## Lo que NO entra en scope (por ahora)

- Multiusuario o autenticación
- Sincronización en la nube
- App móvil
- Importación automática desde Excel
- Módulo de ropa tocado o refactorizado
