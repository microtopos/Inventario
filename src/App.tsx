import './App.css'
import { useState, useEffect, useRef } from "react"
import { importInventory } from "./seedInventory"
import ClothingDetail from "./ClothingDetail"
import { deleteProduct } from "./clothingService"
import ClothingForm from "./ClothingForm"
import OrderPage from "./OrderPage"
import AppHeader from "./AppHeader"
import ClothingStatsPage from "./ClothingStatsPage"
import { useConfirm } from "./ConfirmDialog"
import FuelPage from "./FuelPage"
import CleaningPage from "./CleaningPage"
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
import { cardStyleLegacy, inputStyle, btnStyle, thStyle, tdStyle, stockBadgeColors } from "./styles"
import {
  exportInventarioJSON,
  importInventarioJSON,
  type InventarioJSON,
} from "./clothingService"

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
  const exportRef = useRef<HTMLDivElement>(null)
  const { confirm, dialog } = useConfirm()
  const toast = useToast()

  const inv = useInventory({ stockThresholds })

  const invSort = useSortableTable<any, "nombre" | "codigo" | "departamento" | "stock">(
    inv.visible as any[],
    "nombre"
  )
  function sortArrow(key: any) {
    if (invSort.sortKey !== key) return ""
    return invSort.sortDir === "asc" ? " ▲" : " ▼"
  }

  async function handleExportJSON() {
    setExportOpen(false)
    setExporting(true)
    try {
      const data = await exportInventarioJSON()
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `inventario_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Exportación completada", `${data.productos.length} productos exportados a JSON`)
    } catch (e: any) {
      toast.error("Error al exportar", e?.message ?? String(e))
    }
    setExporting(false)
  }
  
  async function handleImportJSON() {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json,application/json"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data: InventarioJSON = JSON.parse(text)
        if (!data.version || !Array.isArray(data.productos)) {
          throw new Error("El archivo no tiene el formato esperado")
        }
        const r = await importInventarioJSON(data)
        await inv.reload()
        const msg = `${r.creados} creados, ${r.omitidos} omitidos${r.errores.length ? `, ${r.errores.length} errores` : ""}`
        if (r.errores.length > 0) {
          toast.error("Importación con errores", msg)
        } else {
          toast.success("Importación completada", msg)
        }
      } catch (e: any) {
        toast.error("Error al importar", e?.message ?? String(e))
      }
    }
    input.click()
  }

  // ── Inicialización ────────────────────────────────────────────────────────
  useEffect(() => {
    getExportDir().then(setExportDirState)
    getBackupDir().then(setBackupDirState)
    getStockThresholds().then(t => {
      setStockThresholdsState(t)
      setThresholdInputs({ red: String(t.red), orange: String(t.orange) })
    })
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

  // Resetear scroll al cambiar de página (inventario <-> producto)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [selectedProduct, page])

  // ── Navegación entre páginas ──────────────────────────────────────────────

  if (selectedProduct) {
    return (
      <ClothingDetail
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
      <ClothingForm
        onClose={() => setShowForm(false)}
        onNavigate={(p: string) => { setShowForm(false); setPage(p) }}
        onSaved={async () => { await inv.reload() }}
      />
    )
  }

  if (page === "orders") {
    return <OrderPage onNavigate={setPage} />
  }

  // orderHistory ya no se renderiza desde App — OrderPage lo gestiona internamente.
  // Mantenemos el case por si algún onNavigate externo lo invoca directamente;
  // en ese caso simplemente abrimos OrderPage (que arrancará en vista "new").
  if (page === "orderHistory") {
    return <OrderPage onNavigate={setPage} />
  }

  if (page === "dashboard") {
    return <ClothingStatsPage onNavigate={setPage as any} />
  }
  if (page === "gasolina") {
    return <FuelPage onNavigate={setPage} />
  }
  if (page === "productos") {
    return <CleaningPage onNavigate={setPage} />
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr) 180px", gap: "16px", marginBottom: "28px" }}>
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
          <div
            onClick={() => setPage("dashboard")}
            style={{ ...cardStyleLegacy, cursor: "pointer", transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "24px 16px" }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f0f7ff"; e.currentTarget.style.borderColor = "#2563eb"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.borderColor = "#e0e0e0"; }}
          >
            <div style={{ fontSize: "13px", color: "#888", marginBottom: "8px" }}>Panel de</div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#2563eb", marginBottom: "auto" }}>Estadísticas</div>
            <div style={{ fontSize: "24px", marginTop: "12px" }}>📊</div>
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
                {/* Separador JSON */}
<div style={{ borderTop: "1px solid #f0f0f0" }}>
  <div style={{ padding: "10px 16px 4px", fontSize: "11px", fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
    Datos completos
  </div>
  <div style={{ display: "flex", gap: "0", padding: "0 8px 8px" }}>
    <button
      onClick={handleExportJSON}
      style={{ flex: 1, margin: "0 4px", padding: "7px 0", borderRadius: "6px", border: "1px solid #7c3aed22", backgroundColor: "#faf5ff", color: "#7c3aed", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
    >
      ↓ JSON
    </button>
    <button
      onClick={() => { setExportOpen(false); handleImportJSON() }}
      style={{ flex: 1, margin: "0 4px", padding: "7px 0", borderRadius: "6px", border: "1px solid #0891b222", backgroundColor: "#f0f9ff", color: "#0891b2", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
    >
      ↑ Importar
    </button>
  </div>
</div>
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
                      style={{ ...thStyle, cursor: "pointer", userSelect: "none" }}
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
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
          onClick={() => setShowSettings(false)}
        >
          <div
            style={{ backgroundColor: "#fff", borderRadius: "12px", width: "460px", boxShadow: "0 8px 32px rgba(0,0,0,0.14)", overflow: "hidden" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "#111" }}>Ajustes</h2>
              <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#aaa", lineHeight: 1, padding: 0 }}>✕</button>
            </div>

            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>

              {/* Carpeta de exportación */}
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#111", marginBottom: "8px" }}>Carpeta de exportación</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <div style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#f5f5f5", fontSize: "12px", color: exportDir ? "#333" : "#aaa", fontFamily: exportDir ? "monospace" : "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {exportDir ?? "Se pedirá al exportar"}
                  </div>
                  <button
                    onClick={async () => { const dir = await changeExportDir(); if (dir) setExportDirState(dir) }}
                    style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#fff", fontSize: "13px", cursor: "pointer", fontWeight: 500, color: "#333", whiteSpace: "nowrap" }}
                  >Cambiar…</button>
                </div>
              </div>

              {/* Backups */}
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#111", marginBottom: "8px" }}>Carpeta de backups</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#f5f5f5", fontSize: "12px", color: backupDir ? "#333" : "#aaa", fontFamily: backupDir ? "monospace" : "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {backupDir ?? "%APPDATA%\\Inventario\\backups\\"}
                  </div>
                  <button
                    onClick={async () => { const dir = await changeBackupDir(); if (dir) setBackupDirState(dir) }}
                    style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#fff", fontSize: "13px", cursor: "pointer", fontWeight: 500, color: "#333", whiteSpace: "nowrap" }}
                  >Cambiar…</button>
                </div>
                <button
                  onClick={async () => {
                    if (backingUp) return
                    setBackingUp(true)
                    try {
                      const savedPath = await backupDB()
                      await getBackupDir().then(setBackupDirState)
                      toast.success("Backup creado", savedPath)
                    } catch (e: any) {
                      if (e?.message !== "Selección cancelada") toast.error("Error al crear backup", e?.message ?? String(e))
                    } finally {
                      setBackingUp(false)
                    }
                  }}
                  style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: backingUp ? "#f5f5f5" : "#fff", fontSize: "13px", cursor: backingUp ? "not-allowed" : "pointer", fontWeight: 500, color: backingUp ? "#aaa" : "#333" }}
                >
                  {backingUp ? "Creando backup…" : "Crear backup ahora"}
                </button>
              </div>

              {/* Separador */}
              <div style={{ borderTop: "1px solid #e0e0e0" }} />

              {/* Umbrales de stock */}
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#111", marginBottom: "4px" }}>Umbrales de stock por talla</div>
                <div style={{ fontSize: "12px", color: "#888", marginBottom: "12px" }}>El color del indicador cambia según las unidades de cada talla.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {([
                    { key: "red",    label: "🔴  Crítico — stock ≤", color: "#dc2626" },
                    { key: "orange", label: "🟠  Aviso — stock ≤",   color: "#ea580c" },
                  ] as const).map(({ key, label }) => (
                    <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "13px", color: "#444" }}>{label}</span>
                      <input
                        type="number" min={0}
                        value={thresholdInputs[key]}
                        onChange={e => setThresholdInputs(t => ({ ...t, [key]: e.target.value }))}
                        style={{ width: "64px", padding: "7px 10px", borderRadius: "8px", border: "1px solid #e0e0e0", fontSize: "14px", fontWeight: 600, textAlign: "center", color: "#111" }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #e0e0e0", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                onClick={() => setShowSettings(false)}
                style={{ padding: "8px 18px", borderRadius: "8px", border: "1px solid #e0e0e0", backgroundColor: "#fff", fontSize: "13px", cursor: "pointer", color: "#555", fontWeight: 500 }}
              >Cancelar</button>
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
                style={{ padding: "8px 18px", borderRadius: "8px", border: "none", backgroundColor: "#111", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE AYUDA */}
      {showHelp && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
          onClick={() => setShowHelp(false)}
        >
          <div
            style={{ backgroundColor: "#fff", borderRadius: "12px", width: "500px", maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.14)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "#111" }}>Ayuda — Backups</h2>
              <button onClick={() => setShowHelp(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#aaa", lineHeight: 1, padding: 0 }}>✕</button>
            </div>

            <div style={{ overflowY: "auto", padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>

              {/* Archivo de base de datos */}
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#111", marginBottom: "8px" }}>Ubicación del archivo</div>
                <div style={{ fontSize: "13px", color: "#555", marginBottom: "8px", lineHeight: 1.5 }}>
                  La app guarda todo en un único archivo SQLite3:
                </div>
                <div style={{ backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "10px 14px" }}>
                  <code style={{ fontSize: "12px", color: "#333", fontFamily: "monospace" }}>%APPDATA%\Inventario\inventario.db</code>
                </div>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "8px" }}>
                  Abre con DB Browser for SQLite, DBeaver o <code style={{ fontFamily: "monospace", fontSize: "11px" }}>sqlite3.exe</code> si necesitas inspeccionarlo.
                </div>
              </div>

              <div style={{ borderTop: "1px solid #e0e0e0" }} />

              {/* Backups */}
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#111", marginBottom: "8px" }}>Backups automáticos y manuales</div>
                <div style={{ fontSize: "13px", color: "#555", lineHeight: 1.6 }}>
                  Se crea un backup automáticamente cada vez que confirmas un pedido. También puedes crear uno en cualquier momento desde Ajustes ⚙ → <em>Crear backup ahora</em>.
                </div>
                <div style={{ fontSize: "13px", color: "#555", marginTop: "8px", lineHeight: 1.6 }}>
                  Los backups se guardan como <code style={{ fontFamily: "monospace", fontSize: "12px", backgroundColor: "#f5f5f5", padding: "1px 5px", borderRadius: "4px" }}>inventario_YYYY-MM-DD.db</code> en la carpeta configurada — por defecto:
                </div>
                <div style={{ backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "10px 14px", marginTop: "8px" }}>
                  <code style={{ fontSize: "12px", color: "#333", fontFamily: "monospace" }}>%APPDATA%\Inventario\backups\</code>
                </div>
              </div>

              <div style={{ borderTop: "1px solid #e0e0e0" }} />

              {/* Recuperación */}
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#111", marginBottom: "8px" }}>Recuperar un backup</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {[
                    "Cierra la aplicación.",
                    "Ve a la carpeta de backups y copia el archivo que quieras restaurar.",
                    "Pégalo un nivel arriba renombrado como inventario.db, sobreescribiendo el existente.",
                    "Reabre la aplicación.",
                  ].map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                      <span style={{ minWidth: "20px", height: "20px", borderRadius: "50%", backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "#555", flexShrink: 0, marginTop: "1px" }}>{i + 1}</span>
                      <span style={{ fontSize: "13px", color: "#555", lineHeight: 1.5 }}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tip */}
              <div style={{ backgroundColor: "#f0f7ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "12px 14px" }}>
                <span style={{ fontSize: "12px", color: "#1e40af", lineHeight: 1.6 }}>
                  💡 Apunta la carpeta de backups a una unidad de red o carpeta sincronizada con OneDrive para tener las copias fuera del equipo.
                </span>
              </div>

            </div>
          </div>
        </div>
      )}

      {dialog}
    </div>
  )
}

export default App
