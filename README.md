# Gestión de Ropa — Contexto de la aplicación

## Stack

**Framework desktop:** [Tauri v2](https://tauri.app/) (Rust + WebView)
**Frontend:** React + TypeScript (Vite)
**Base de datos:** SQLite local vía tauri-plugin-sql (archivo inventario.db)
**Estilos:** Inline styles 100% (sin CSS framework)
**Gráficos:** Recharts
**Exports:** jsPDF + SheetJS (xlsx)
**Backend Rust:** comandos personalizados para imágenes (leer/guardar/borrar) y backups de BD
---

## Qué hace la app

App de escritorio para gestionar el inventario de ropa de trabajo de una empresa. Permite:

**Inventario:** CRUD de prendas con código, nombre, color, departamento, tallas y stock. Vista tabla o cuadrícula. Foto por producto.
**Stock:** Ajustes manuales de stock por talla (entrada/salida) con historial de movimientos y opción de deshacer.
**Pedidos:** Crear borradores de pedido (persistidos en BD con debounce), confirmar, exportar a PDF, y gestionar recepción parcial/total por línea.
**Historial de pedidos:** Ver pedidos pasados, modificar cantidades acordadas, marcar como recibido (actualiza stock automáticamente), exportar PDF.
**Estadísticas (Dashboard):** Gráficos de stock, entradas y consumo por departamento con filtros de fecha.
**Exportación:** PDF y Excel del inventario completo, stock por tallas e historial de movimientos.
**Backups:** Copia automática de la BD al confirmar pedidos, y manual desde ajustes.
---

## Modelo de datos (SQLite)

departamentos       id, nombre
productos           id, codigo, nombre, departamento_id, color, foto
tallas              id, producto_id, talla, stock
movimientos         id, talla_id, cambio, origen (manual|pedido), fecha
pedidos             id, fecha, recibido, borrador, notas, fecha_recibido
pedido_items        id, pedido_id, talla_id, cantidad, cantidad_acordada, cantidad_recibida, estado
colores             id, nombre
settings            key, value
---

## Estructura frontend relevante

| Archivo | Responsabilidad |
|---|---|
| App.tsx | Vista de inventario principal, modales de ajustes/ayuda |
| ProductDetail.tsx | Detalle de prenda: edición, ajuste de stock, historial |
| OrderPage.tsx | Creación de nuevo pedido (borrador) |
| OrderHistoryPage.tsx | Historial y recepción de pedidos |
| DashboardPage.tsx | Estadísticas y gráficos |
| DraftContext.tsx | Estado global del borrador de pedido (sincronizado a BD con debounce) |
| productService.ts | CRUD productos, tallas, stock, movimientos |
| orderService.ts | CRUD pedidos, borrador, recepción |
| exportService.ts | Generación de PDFs y Excel |
| settingsService.ts | Preferencias persistidas (carpetas, umbrales de stock) |

---

## Patrones destacados

**DraftContext:** El borrador del pedido vive en React context y se sincroniza a SQLite con debounce de 600ms. Se persiste entre sesiones.
**Imágenes:** Se guardan como .jpg en disco (AppData/images/) redimensionadas a 600×600. Se leen como base64 vía comando Rust y se cachean en memoria.
**Umbrales de stock configurables:** Rojo (crítico), naranja (aviso) y verde. Se aplican en toda la UI y en los exports PDF.
**usePagination:** Hook genérico para paginación de cualquier consulta async.
**useAsyncAction:** Hook para encapsular loading + error toast en acciones async.
