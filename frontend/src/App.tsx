import './App.css'
import { useState, useEffect, useRef } from "react"
import { importInventory } from "./importInventory"
import { getImageUrlSync, invalidateImageCache, getImageUrl } from "./getImageUrl"
import ProductDetail from "./ProductDetail"
import { deleteProduct } from "./productService"
import ProductForm from "./ProductForm"
import OrderPage from "./OrderPage"
import OrderHistoryPage from "./OrderHistoryPage"
import AppHeader from "./AppHeader"
import DashboardPage from "./DashboardPage"
import { useConfirm } from "./ConfirmDialog"
// orderService imports moved — draft state now via DraftContext
import {
  exportInventarioPDF, exportInventarioXLSX,
  exportTallasPDF, exportTallasXLSX,
  exportMovimientosPDF, exportMovimientosXLSX,
  changeExportDir,
} from "./exportService"
import {
  getBackupDir,
  getExportDir,
  getStockThresholds,
  setStockThresholds,
  type StockThresholds,
} from "./settingsService"
import { backupDB, changeBackupDir } from "./backupService"
import { useToast } from "./Toast"
import { useSortableTable } from "./useSortableTable"
import { useInventory } from "./useInventory"
import { useDraft } from "./DraftContext"
import { cardStyleLegacy, inputStyle, btnStyle, thStyle, tdStyle, helpSectionTitle, helpText, helpList, helpCode, stockBadgeColors } from "./styles"

// ── Miniaturas ────────────────────────────────────────────────────────────────

function ImageCell({ imageUrl }: { imageUrl: string }) {
  const [error, setError] = useState(false)
  if (!imageUrl || error) {
    return (
      <div style={{ width: 44, height: 44, backgroundColor: "#f0f0f0", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
        👕
      </div>
    )
  }
  return (
    <img
      src={imageUrl}
      style={{ width: 44, height: 44, objectFit: "cover", borderRadius: "6px", border: "1px solid #eee" }}
      onError={() => setError(true)}
    />
  )
}

function GridImageCell({ imageUrl }: { imageUrl: string }) {
  const [error, setError] = useState(false)
  if (!imageUrl || error) {
    return (
      <div style={{ width: "100%", aspectRatio: "1", backgroundColor: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "48px" }}>
        👕
      </div>
    )
  }
  return (
    <img
      src={imageUrl}
      style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
      onError={() => setError(true)}
    />
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [page, setPage] = useState("inventory")
  const [viewMode, setViewMode] = useState<"table" | "grid">("table")
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [exportDir, setExportDirState] = useState<string | null>(null)
  const [backupDir, setBackupDirState] = useState<string | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [stockThresholds, setStockThresholdsState] = useState<StockThresholds>({ red: 2, orange: 5 })
  const [thresholdInputs, setThresholdInputs] = useState({ red: "2", orange: "5" })
  const { draftCount } = useDraft()
  const exportRef = useRef<HTMLDivElement>(null)
  const { confirm, dialog } = useConfirm()
  const toast = useToast()

  // ── Inventario delegado al hook ───────────────────────────────────────────
  const inv = useInventory({ stockThresholds })

  const invSort = useSortableTable<any, "nombre" | "codigo" | "departamento" | "stock">(
    inv.visible as any[],
    "nombre"
  )
  function sortArrow(key: any) {
    if (invSort.sortKey !== key) return ""
    return invSort.sortDir === "asc" ? " ▲" : " ▼"
  }

  // ── Inicialización ────────────────────────────────────────────────────────
  useEffect(() => {
    getExportDir().then(setExportDirState)
    getBackupDir().then(setBackupDirState)
    getStockThresholds().then(t => {
      setStockThresholdsState(t)
      setThresholdInputs({ red: String(t.red), orange: String(t.orange) })
    })
    // Importa el inventario inicial si la BD está vacía
    importInventory()
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // ── Navegación entre páginas ──────────────────────────────────────────────

  if (selectedProduct) {
    return (
      <ProductDetail
        product={selectedProduct}
        stockThresholds={stockThresholds}
        onBack={() => setSelectedProduct(null)}
        onNavigate={(p: string) => { setSelectedProduct(null); setPage(p) }}
        onProductUpdated={async (changes: any) => {
          setSelectedProduct((prev: any) => ({ ...prev, ...changes }))
          await inv.reload()
        }}
      />
    )
  }

  if (showForm) {
    return (
      <ProductForm
        onClose={() => setShowForm(false)}
        onNavigate={(p: string) => { setShowForm(false); setPage(p) }}
        onSaved={async () => { await inv.reload() }}
      />
    )
  }

  if (page === "orders") {
    return <OrderPage onNavigate={setPage} />
  }
  if (page === "orderHistory") {
    return <OrderHistoryPage onNavigate={setPage} />
  }
  if (page === "dashboard") {
    return <DashboardPage onNavigate={setPage as any} />
  }

  // ── Vista de inventario ───────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>

      <AppHeader
        page={page as any}
        onNavigate={setPage as any}
        actions={
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={() => setShowHelp(true)}
              title="Ayuda"
              style={{ background: "none", border: "1px solid #e0e0e0", borderRadius: "6px", padding: "6px 10px", fontSize: "16px", cursor: "pointer", color: "#888", lineHeight: 1 }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#aaa")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#e0e0e0")}
            >?</button>
            <button
              onClick={() => setShowSettings(true)}
              title="Ajustes"
              style={{ background: "none", border: "1px solid #e0e0e0", borderRadius: "6px", padding: "6px 10px", fontSize: "16px", cursor: "pointer", color: "#888", lineHeight: 1 }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#aaa")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#e0e0e0")}
            >⚙</button>
          </div>
        }
      />

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px" }}>

        {/* TARJETAS RESUMEN */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "28px" }}>
          <div style={cardStyleLegacy}>
            <div style={{ fontSize: "13px", color: "#888", marginBottom: "6px" }}>Total prendas</div>
            <div style={{ fontSize: "32px", fontWeight: 700, color: "#111" }}>{inv.inventory.length}</div>
          </div>
          <div style={cardStyleLegacy}>
            <div style={{ fontSize: "13px", color: "#888", marginBottom: "6px" }}>Unidades en stock</div>
            <div style={{ fontSize: "32px", fontWeight: 700, color: "#111" }}>{inv.totalUnits}</div>
          </div>
          <div style={{ ...cardStyleLegacy, borderLeft: inv.lowStockCount > 0 ? "4px solid #f59e0b" : "1px solid #e0e0e0" }}>
            <div style={{ fontSize: "13px", color: "#888", marginBottom: "6px" }}>⚠️ Stock bajo (≤{stockThresholds.red} ud. por talla)</div>
            <div style={{ fontSize: "32px", fontWeight: 700, color: inv.lowStockCount > 0 ? "#d97706" : "#111" }}>
              {inv.lowStockCount}
            </div>
          </div>
        </div>

        {/* BARRA DE HERRAMIENTAS */}
        <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", padding: "16px 20px", display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="🔍  Buscar prenda o código..."
            value={inv.search}
            onChange={e => inv.setSearch(e.target.value)}
            style={inputStyle}
          />
          <select
            value={inv.departmentFilter ?? ""}
            onChange={e => inv.setDepartmentFilter(e.target.value ? Number(e.target.value) : null)}
            style={inputStyle}
          >
            <option value="">Todos los departamentos</option>
            {inv.departments.map((d: any) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
          <button
            onClick={() => inv.setShowLowStock(!inv.showLowStock)}
            style={{
              ...btnStyle,
              backgroundColor: inv.showLowStock ? "#fef3c7" : "#f5f5f5",
              color: inv.showLowStock ? "#92400e" : "#444",
              border: inv.showLowStock ? "1px solid #fcd34d" : "1px solid #ddd",
            }}
          >
            {inv.showLowStock ? "✕  Quitar filtro" : "⚠️  Stock bajo"}
          </button>

          {/* TOGGLE VISTA */}
          <div style={{ display: "flex", border: "1px solid #ddd", borderRadius: "6px", overflow: "hidden" }}>
            {(["table", "grid"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={mode === "table" ? "Vista lista" : "Vista cuadrícula"}
                style={{
                  ...btnStyle,
                  borderRadius: 0,
                  border: "none",
                  borderLeft: mode === "grid" ? "1px solid #ddd" : "none",
                  backgroundColor: viewMode === mode ? "#eff6ff" : "#fff",
                  color: viewMode === mode ? "#2563eb" : "#888",
                  padding: "8px 12px",
                  fontWeight: viewMode === mode ? 700 : 400,
                }}
              >
                {mode === "table" ? "☰" : "⊞"}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowForm(true)}
            style={{ ...btnStyle, backgroundColor: "#2563eb", color: "#fff", border: "none", marginLeft: "auto" }}
          >
            + Nueva prenda
          </button>

          {/* EXPORTAR */}
          <div ref={exportRef} style={{ position: "relative" }}>
            <button
              onClick={() => setExportOpen(o => !o)}
              disabled={exporting}
              style={{ ...btnStyle, backgroundColor: "#f5f5f5", color: "#444", border: "1px solid #ddd" }}
            >
              {exporting ? "Exportando..." : "↓ Exportar"}
            </button>
            {exportOpen && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.10)", width: "260px", zIndex: 100, overflow: "hidden" }}>
                {[
                  { label: "Inventario completo",   pdfFn: exportInventarioPDF,  xlsxFn: exportInventarioXLSX },
                  { label: "Stock por tallas",       pdfFn: exportTallasPDF,      xlsxFn: exportTallasXLSX },
                  { label: "Historial movimientos",  pdfFn: exportMovimientosPDF, xlsxFn: exportMovimientosXLSX },
                ].map((item, i) => (
                  <div key={i} style={{ borderBottom: i < 2 ? "1px solid #f0f0f0" : "none" }}>
                    <div style={{ padding: "10px 16px 4px", fontSize: "11px", fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {item.label}
                    </div>
                    <div style={{ display: "flex", gap: "0", padding: "0 8px 8px" }}>
                      {[
                        { fmt: "PDF",   fn: item.pdfFn,  color: "#dc2626", bg: "#fff5f5" },
                        { fmt: "Excel", fn: item.xlsxFn, color: "#16a34a", bg: "#f0fdf4" },
                      ].map(btn => (
                        <button
                          key={btn.fmt}
                          onClick={async () => {
                            setExportOpen(false)
                            setExporting(true)
                            try {
                              await btn.fn()
                              toast.success("Exportación completada", `${item.label} — ${btn.fmt}`)
                            } catch (e: any) {
                              toast.error("Error al exportar", e?.message ?? String(e))
                            }
                            setExporting(false)
                          }}
                          style={{ flex: 1, margin: "0 4px", padding: "7px 0", borderRadius: "6px", border: `1px solid ${btn.color}22`, backgroundColor: btn.bg, color: btn.color, fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                        >
                          {btn.fmt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* TABLA */}
        {viewMode === "table" ? (
          <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#fafafa", borderBottom: "2px solid #e0e0e0" }}>
                  <th style={thStyle}>Foto</th>
                  {(["codigo", "nombre", "departamento", "stock"] as const).map(col => (
                    <th
                      key={col}
                      style={{ ...thStyle, cursor: col !== "codigo" || true ? "pointer" : "default", userSelect: "none" }}
                      onClick={() => invSort.toggleSort(col)}
                    >
                      {{ codigo: "Código", nombre: "Prenda", departamento: "Departamento", stock: "Stock" }[col]}
                      {sortArrow(col)}
                    </th>
                  ))}
                  <th style={thStyle}>Color</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {inv.visible.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "48px", color: "#aaa", fontSize: "15px" }}>
                      No se encontraron prendas
                    </td>
                  </tr>
                )}
                {invSort.sorted.map((item: any) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: "1px solid #f0f0f0", backgroundColor: "#fff", transition: "background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f0f7ff")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#fff")}
                  >
                    <td style={tdStyle}><ImageCell imageUrl={item.imageUrl} /></td>
                    <td style={{ ...tdStyle, fontSize: "13px", color: "#888", fontFamily: "monospace" }}>{item.codigo || "—"}</td>
                    <td
                      style={{ ...tdStyle, fontWeight: 600, color: "#2563eb", cursor: "pointer" }}
                      onClick={() => setSelectedProduct(item)}
                    >
                      {item.nombre}
                    </td>
                    <td style={{ ...tdStyle, color: "#555" }}>{item.departamento}</td>
                    <td style={tdStyle}>
                      <span style={{
                        display: "inline-block", padding: "4px 12px", borderRadius: "20px", fontSize: "13px", fontWeight: 600,
                        ...stockBadgeColors(item.stock, stockThresholds),
                      }}>
                        {item.stock} ud.
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: "#555" }}>{item.color || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center" }}>
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedProduct({ ...item, autoOpenCart: true }) }}
                          title="Añadir al pedido"
                          style={{ background: "none", border: "1px solid #bfdbfe", color: "#2563eb", borderRadius: "6px", padding: "5px 10px", fontSize: "13px", cursor: "pointer" }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#eff6ff")}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                        >🛒</button>
                        <button
                          onClick={async () => {
                            const ok = await confirm(`¿Eliminar "${item.nombre}"?`, { confirmLabel: "Eliminar", danger: true })
                            if (!ok) return
                            try {
                              await deleteProduct(item.id)
                              await inv.reload()
                              toast.success("Prenda eliminada", `"${item.nombre}" se eliminó del inventario`)
                            } catch (e: any) {
                              toast.error("No se pudo eliminar", e?.message ?? String(e))
                            }
                          }}
                          style={{ background: "none", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: "6px", padding: "5px 12px", fontSize: "13px", cursor: "pointer" }}
                        >Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: "12px 20px", borderTop: "1px solid #f0f0f0", fontSize: "13px", color: "#aaa" }}>
              {inv.visible.length} prenda{inv.visible.length !== 1 ? "s" : ""} mostrada{inv.visible.length !== 1 ? "s" : ""}
            </div>
          </div>
        ) : (
          /* CUADRÍCULA */
          <div>
            {inv.visible.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px", color: "#aaa", fontSize: "15px", backgroundColor: "#fff", borderRadius: "10px", border: "1px solid #e0e0e0" }}>
                No se encontraron prendas
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "16px" }}>
              {invSort.sorted.map((item: any) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedProduct(item)}
                  style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", overflow: "hidden", cursor: "pointer", transition: "box-shadow 0.15s, transform 0.15s" }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)"
                    ;(e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = ""
                    ;(e.currentTarget as HTMLElement).style.transform = ""
                  }}
                >
                  <GridImageCell imageUrl={item.imageUrl} />
                  <div style={{ padding: "12px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#111", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.nombre}
                    </div>
                    {item.color && <div style={{ fontSize: "12px", color: "#888", marginBottom: "6px" }}>{item.color}</div>}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "6px" }}>
                      <span style={{
                        padding: "3px 9px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
                        ...stockBadgeColors(item.stock, stockThresholds),
                      }}>
                        {item.stock} ud.
                      </span>
                      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedProduct({ ...item, autoOpenCart: true }) }}
                          title="Añadir al pedido"
                          style={{ background: "none", border: "none", color: "#2563eb", fontSize: "15px", cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}
                        >🛒</button>
                        <button
                          onClick={async e => {
                            e.stopPropagation()
                            const ok = await confirm(`¿Eliminar "${item.nombre}"?`, { confirmLabel: "Eliminar", danger: true })
                            if (!ok) return
                            try {
                              await deleteProduct(item.id)
                              await inv.reload()
                              toast.success("Prenda eliminada", `"${item.nombre}" se eliminó del inventario`)
                            } catch (err: any) {
                              toast.error("No se pudo eliminar", err?.message ?? String(err))
                            }
                          }}
                          title="Eliminar"
                          style={{ background: "none", border: "none", color: "#dc2626", fontSize: "16px", cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}
                        >✕</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {inv.visible.length > 0 && (
              <div style={{ marginTop: "12px", fontSize: "13px", color: "#aaa" }}>
                {inv.visible.length} prenda{inv.visible.length !== 1 ? "s" : ""} mostrada{inv.visible.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        )}

      </main>

      {/* MODAL DE AJUSTES */}
      {showSettings && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
          onClick={() => setShowSettings(false)}
        >
          <div
            style={{ backgroundColor: "#fff", borderRadius: "14px", width: "480px", overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ height: "4px", backgroundColor: "#111" }} />
            <div style={{ padding: "28px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 20px" }}>⚙ Ajustes</h2>

              {/* Carpeta exportación */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Carpeta de exportación</div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <div style={{ flex: 1, padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "13px", color: exportDir ? "#333" : "#aaa", fontFamily: exportDir ? "monospace" : "inherit", backgroundColor: "#fafafa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {exportDir ?? "No configurada — se pedirá al exportar"}
                  </div>
                  <button onClick={async () => { const dir = await changeExportDir(); if (dir) setExportDirState(dir) }} style={{ padding: "9px 16px", borderRadius: "7px", border: "1px solid #ddd", backgroundColor: "#fff", fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap", fontWeight: 500 }}>
                    Cambiar…
                  </button>
                </div>
                <div style={{ fontSize: "12px", color: "#aaa", marginTop: "6px" }}>Los exports se guardan directamente en esta carpeta.</div>
              </div>

              {/* Backups */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Copias de seguridad</div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <div style={{ flex: 1, padding: "9px 12px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "13px", color: backupDir ? "#333" : "#aaa", fontFamily: backupDir ? "monospace" : "inherit", backgroundColor: "#fafafa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {backupDir ?? "Por defecto: carpeta backups/ dentro de los datos de la app"}
                  </div>
                  <button onClick={async () => { const dir = await changeBackupDir(); if (dir) setBackupDirState(dir) }} style={{ padding: "9px 16px", borderRadius: "7px", border: "1px solid #ddd", backgroundColor: "#fff", fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap", fontWeight: 500 }}>
                    Cambiar…
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                  <button
                    onClick={async () => {
                      if (backingUp) return
                      setBackingUp(true)
                      try {
                        const savedPath = await backupDB()
                        await getBackupDir().then(setBackupDirState)
                        toast.success("Copia de seguridad creada", savedPath)
                      } catch (e: any) {
                        if (e?.message !== "Selección cancelada") toast.error("No se pudo crear la copia de seguridad", e?.message ?? String(e))
                      } finally {
                        setBackingUp(false)
                      }
                    }}
                    style={{ padding: "9px 16px", borderRadius: "7px", border: "none", backgroundColor: backingUp ? "#ccc" : "#111", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: backingUp ? "not-allowed" : "pointer" }}
                  >
                    {backingUp ? "Creando copia…" : "Crear copia de seguridad"}
                  </button>
                </div>
                <div style={{ fontSize: "12px", color: "#aaa", marginTop: "6px" }}>
                  Se guarda como <code>inventario_YYYY-MM-DD.db</code>. Usa "?" para ver cómo recuperar una copia.
                </div>
              </div>

              {/* Umbrales de stock */}
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>Umbrales de color por talla</div>
                <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "14px" }}>Define cuántas unidades marcan el límite entre verde, naranja y rojo en el stock de cada talla.</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {([
                    { key: "red",    label: "Rojo (crítico) — ≤",  color: "#dc2626" },
                    { key: "orange", label: "Naranja (aviso) — ≤", color: "#f97316" },
                  ] as const).map(({ key, label, color }) => (
                    <div key={key}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                        <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: color, display: "inline-block" }} />
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#555" }}>{label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="number" min={0}
                          value={thresholdInputs[key]}
                          onChange={e => setThresholdInputs(t => ({ ...t, [key]: e.target.value }))}
                          style={{ width: "70px", padding: "8px 10px", borderRadius: "7px", border: "1px solid #e0e0e0", fontSize: "14px", textAlign: "center" }}
                        />
                        <span style={{ fontSize: "12px", color: "#aaa" }}>unidades</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "14px", display: "flex", gap: "8px", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Preview:</span>
                  <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, backgroundColor: "#fee2e2", color: "#991b1b" }}>0–{thresholdInputs.red || "?"} ud. 🔴</span>
                  <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, backgroundColor: "#ffedd5", color: "#c2410c" }}>{Number(thresholdInputs.red || 0) + 1}–{thresholdInputs.orange || "?"} ud. 🟠</span>
                  <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, backgroundColor: "#dcfce7", color: "#166534" }}>&gt;{thresholdInputs.orange || "?"} ud. 🟢</span>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={async () => {
                    const red = Math.max(0, Number(thresholdInputs.red) || 0)
                    const orange = Math.max(red, Number(thresholdInputs.orange) || 0)
                    const t = { red, orange }
                    await setStockThresholds(t)
                    setStockThresholdsState(t)
                    setThresholdInputs({ red: String(red), orange: String(orange) })
                    setShowSettings(false)
                  }}
                  style={{ padding: "9px 22px", borderRadius: "8px", border: "none", backgroundColor: "#111", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
                >
                  Guardar y cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE AYUDA */}
      {showHelp && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
          onClick={() => setShowHelp(false)}
        >
          <div
            style={{ backgroundColor: "#fff", borderRadius: "14px", width: "560px", maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ height: "4px", backgroundColor: "#2563eb" }} />
            <div style={{ padding: "28px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>? Ayuda — Copias de seguridad</h2>
              <button onClick={() => setShowHelp(false)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#aaa", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: "24px 28px 28px", overflowY: "auto" }}>
              <section style={{ marginBottom: "24px" }}>
                <div style={helpSectionTitle}>¿Qué es una copia de seguridad?</div>
                <p style={helpText}>La aplicación guarda todos los datos en un único archivo llamado <code style={helpCode}>inventario.db</code>. Una copia de seguridad es ese mismo archivo duplicado con la fecha en el nombre.</p>
              </section>
              <section style={{ marginBottom: "24px" }}>
                <div style={helpSectionTitle}>¿Cuándo se crean las copias?</div>
                <p style={helpText}>Las copias se crean en dos momentos:</p>
                <ul style={helpList}>
                  <li><b>Automáticamente</b> cada vez que confirmas un pedido.</li>
                  <li><b>Manualmente</b> pulsando "Crear copia de seguridad" en Ajustes ⚙.</li>
                </ul>
              </section>
              <section style={{ marginBottom: "24px" }}>
                <div style={helpSectionTitle}>¿Cómo recupero los datos si algo va mal?</div>
                <ol style={helpList}>
                  <li>Cierra la aplicación completamente.</li>
                  <li>Localiza la carpeta de backups (visible en Ajustes ⚙):
                    <ul style={{ ...helpList, marginTop: "6px" }}>
                      <li><b>Windows:</b> <code style={helpCode}>%APPDATA%\Inventario\backups\</code></li>
                      <li><b>macOS:</b> <code style={helpCode}>~/Library/Application Support/Inventario/backups/</code></li>
                      <li><b>Linux:</b> <code style={helpCode}>~/.local/share/Inventario/backups/</code></li>
                    </ul>
                  </li>
                  <li>Elige el archivo más reciente, renómbralo a <code style={helpCode}>inventario.db</code> y cópialo un nivel más arriba.</li>
                  <li>Vuelve a abrir la aplicación.</li>
                </ol>
              </section>
              <section style={{ padding: "14px 16px", backgroundColor: "#eff6ff", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#1d4ed8", marginBottom: "6px" }}>💡 Recomendación</div>
                <p style={{ ...helpText, margin: 0, color: "#1e40af" }}>Configura la carpeta de backups en una unidad externa o carpeta sincronizada con la nube. Así las copias estarán protegidas si el equipo falla.</p>
              </section>
            </div>
          </div>
        </div>
      )}

      {dialog}
    </div>
  )
}

// ── Styles — ver styles.ts ──────────────────────────────────────────────────────

export default App
