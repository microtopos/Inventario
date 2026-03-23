import { useState, useEffect, useRef } from "react"
import { getProductsWithSizes } from "./inventoryService"
import { loadDraft, syncDraft, discardDraft, confirmDraft } from "./orderService"
import { jsPDF } from "jspdf"
import { join } from "@tauri-apps/api/path"
import { writeFile } from "@tauri-apps/plugin-fs"
import AppHeader from "./AppHeader"
import { useConfirm } from "./ConfirmDialog"
import { ordenarTallas } from "./sortTallas"
import { resolveExportDir } from "./exportService"
import { backupDBSilent } from "./backupService"
import { useToast } from "./Toast"
import { getImageUrl } from "./getImageUrl"

type SyncState = "idle" | "saving" | "saved" | "error"

export default function OrderPage({ onNavigate, onDraftChange }: {
  onNavigate: (page: any) => void
  onDraftChange?: (count: number) => void
}) {
  const [products, setProducts] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [deptFilter, setDeptFilter] = useState<number | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>("")
  const [pedido, setPedido] = useState<Record<number, number>>({})
  const [notas, setNotas] = useState("")
  const [, setDraftId] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>("idle")
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftIdRef = useRef<number | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { confirm, alert, dialog } = useConfirm()
  const toast = useToast()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // ── Carga inicial ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [prods, draft] = await Promise.all([
        getProductsWithSizes(),
        loadDraft(),
      ])
      setProducts(prods)
      if (draft) {
        setDraftId(draft.id)
        draftIdRef.current = draft.id
        setPedido(draft.items)
        setNotas(draft.notas ?? "")
      }
      setReady(true)
    }
    init()
  }, [])

  // Carga imagen cuando cambia el producto seleccionado
  useEffect(() => {
    if (!selectedProduct) { setSelectedImageUrl(""); return }
    getImageUrl(selectedProduct.id).then(url => setSelectedImageUrl(url))
  }, [selectedProduct])

  // ── Sincronización con debounce ──────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return
    if (syncTimer.current) clearTimeout(syncTimer.current)
    setSyncState("saving")
    syncTimer.current = setTimeout(async () => {
      try {
        const newId = await syncDraft(draftIdRef.current, pedido, notas)
        draftIdRef.current = newId
        setDraftId(newId)
        setSyncState(newId !== null ? "saved" : "idle")
      } catch (e) {
        console.error("Error sincronizando borrador:", e)
        setSyncState("error")
      }
    }, 600)
    return () => { if (syncTimer.current) clearTimeout(syncTimer.current) }
  }, [pedido, notas, ready])

  useEffect(() => {
    if (!ready) return
    const count = construirPedido().length
    onDraftChange?.(count)
  }, [pedido, products, ready])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function setCantidad(tallaId: number, value: number) {
    setPedido(prev => ({ ...prev, [tallaId]: value }))
  }

  function eliminarTalla(tallaId: number) {
    setPedido(prev => {
      const next = { ...prev }
      delete next[tallaId]
      return next
    })
  }

  function totalPedido() {
    return Object.values(pedido).reduce((s, v) => s + (Number(v) || 0), 0)
  }

  function construirPedido() {
    const map: Record<number, { producto: any; tallas: any[]; total: number }> = {}
    for (const tallaId in pedido) {
      const cantidad = pedido[Number(tallaId)]
      if (!cantidad) continue
      for (const p of products) {
        const talla = p.tallas?.find((t: any) => t.id === Number(tallaId))
        if (!talla) continue
        if (!map[p.id]) map[p.id] = { producto: p, tallas: [], total: 0 }
        map[p.id].tallas.push({ tallaId: talla.id, talla: talla.talla, cantidad })
        map[p.id].total += cantidad
      }
    }
    return Object.values(map)
  }

  async function resetPedido() {
    if (syncTimer.current) clearTimeout(syncTimer.current)
    const id = draftIdRef.current
    if (id !== null) {
      await discardDraft(id)
      draftIdRef.current = null
      setDraftId(null)
    }
    setPedido({})
    setNotas("")
    setSelectedProduct(null)
    setSyncState("idle")
  }

  async function flushSync(): Promise<number | null> {
    if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null }
    const newId = await syncDraft(draftIdRef.current, pedido, notas)
    draftIdRef.current = newId
    setDraftId(newId)
    return newId
  }

  async function confirmOnly() {
    setDropdownOpen(false)
    try {
      if (totalPedido() === 0) { toast.info("Pedido vacío", "Añade al menos una prenda antes de confirmar."); return }
      setSyncState("saving")
      const id = await flushSync()
      if (id === null) throw new Error("No se pudo crear el borrador")
      const confirmedId = await confirmDraft(id, notas)
      draftIdRef.current = null; setDraftId(null); setSyncState("idle")
      toast.success("Pedido confirmado", `Pedido #${confirmedId} guardado en el historial.`)
      backupDBSilent().catch(() => {})
      setPedido({}); setNotas(""); setSelectedProduct(null)
    } catch (e: any) {
      setSyncState("error")
      await alert(e.message ?? "Error al confirmar el pedido", { confirmLabel: "Aceptar" })
    }
  }

  async function exportPDF() {
    try {
      setSyncState("saving")
      const id = await flushSync()
      if (id === null) throw new Error("El pedido está vacío")

      const items = construirPedido()
      const doc = new jsPDF()
      const PW = doc.internal.pageSize.getWidth()
      const PH = doc.internal.pageSize.getHeight()
      const ML = 14, MR = 14, CW = PW - ML - MR

      const fecha = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
      const totalUnidades = items.reduce((s, i) => s + i.total, 0)
      const totalLineas = items.length

      const negro:    [number,number,number] = [30,  30,  30]
      const gris:     [number,number,number] = [100, 100, 100]
      const grisClar: [number,number,number] = [160, 160, 160]
      const linea:    [number,number,number] = [210, 210, 210]
      const fondoFil: [number,number,number] = [249, 249, 249]
      const fondoCab: [number,number,number] = [237, 237, 237]

      function drawHeader() {
        doc.setDrawColor(...linea); doc.setLineWidth(0.4); doc.line(ML, 12, PW - MR, 12)
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...negro)
        doc.text("Gestión de Ropa", ML, 9)
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...gris)
        doc.text(fecha, PW - MR, 9, { align: "right" })
        doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...negro)
        doc.text("Pedido de ropa", ML, 22)
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...gris)
        doc.text(`${totalLineas} prenda${totalLineas !== 1 ? "s" : ""}  ·  ${totalUnidades} unidades`, ML, 28)
        doc.setDrawColor(...linea); doc.setLineWidth(0.3); doc.line(ML, 31, PW - MR, 31)
      }

      function addPage() {
        doc.addPage()
        doc.setDrawColor(...linea); doc.setLineWidth(0.4); doc.line(ML, 12, PW - MR, 12)
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...negro)
        doc.text("Gestión de Ropa", ML, 9)
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...gris)
        doc.text(fecha, PW - MR, 9, { align: "right" })
        doc.setDrawColor(...linea); doc.setLineWidth(0.3); doc.line(ML, 14, PW - MR, 14)
      }

      function checkPageBreak(y: number, needed: number): number {
        if (y + needed > PH - 18) { addPage(); return 20 }
        return y
      }

      drawHeader()
      let y = 35

      const notasText = (notas ?? "").trim()
      if (notasText) {
        const labelH = 4, lineH = 4.1, boxPadY = 3, boxPadX = 3
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...negro)
        const lines = doc.splitTextToSize(notasText, CW - boxPadX * 2) as string[]
        const boxH = labelH + boxPadY + lines.length * lineH + 4
        y = checkPageBreak(y, boxH + 4)
        doc.setDrawColor(...linea); doc.setLineWidth(0.3); doc.rect(ML, y, CW, boxH, "S")
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...gris)
        doc.text("NOTAS", ML + boxPadX, y + 6)
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...negro)
        doc.text(lines, ML + boxPadX, y + 11)
        y += boxH + 8
      }

      doc.setFillColor(...fondoCab); doc.rect(ML, y, CW, 7, "F")
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...gris)
      doc.text("PRENDA", ML + 2, y + 5); doc.text("TOTAL", PW - MR - 2, y + 5, { align: "right" })
      y += 9

      const colW = 22
      const chipsPerRow = Math.floor(CW / colW)

      items.forEach((item, idx) => {
        const p = item.producto
        const tallas = [...item.tallas].sort((a, b) => ordenarTallas(a.talla, b.talla))
        const hasMeta = !!(p.color || p.codigo)
        const filasTallas = Math.ceil(tallas.length / chipsPerRow)
        const blockH = 7 + (hasMeta ? 6 : 0) + filasTallas * 9 + 5
        y = checkPageBreak(y, blockH)
        if (idx % 2 === 0) { doc.setFillColor(...fondoFil); doc.rect(ML, y - 1, CW, blockH + 1, "F") }
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...negro)
        doc.text(p.nombre, ML + 2, y + 5)
        doc.text(`${item.total} ud.`, PW - MR - 2, y + 5, { align: "right" })
        let tallaStartY = y + 8
        if (hasMeta) {
          doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...gris)
          doc.text([p.codigo, p.color].filter(Boolean).join("  ·  "), ML + 2, y + 11)
          tallaStartY = y + 14
        }
        let tx = ML + 2, ty = tallaStartY, col = 0
        for (const t of tallas) {
          if (col >= chipsPerRow) { col = 0; tx = ML + 2; ty += 9 }
          doc.setDrawColor(...linea); doc.setLineWidth(0.3); doc.rect(tx, ty, colW - 2, 7.5, "S")
          doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...negro)
          doc.text(t.talla, tx + 2, ty + 3.5)
          doc.setFont("helvetica", "normal"); doc.setTextColor(...gris)
          doc.text(`${t.cantidad}ud`, tx + (colW - 2) - 2, ty + 3.5, { align: "right" })
          tx += colW; col++
        }
        y += blockH
        doc.setDrawColor(...linea); doc.setLineWidth(0.2); doc.line(ML, y, PW - MR, y); y += 1
      })

      y = checkPageBreak(y, 14); y += 5
      doc.setDrawColor(...[180, 180, 180] as [number,number,number]); doc.setLineWidth(0.5)
      doc.line(ML, y - 2, PW - MR, y - 2)
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...negro)
      doc.text("Total del pedido:", ML + 2, y + 4)
      doc.text(`${totalLineas} prendas  ·  ${totalUnidades} unidades`, PW - MR - 2, y + 4, { align: "right" })

      const pages = doc.getNumberOfPages()
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        doc.setDrawColor(...linea); doc.setLineWidth(0.3); doc.line(ML, 286, PW - MR, 286)
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...grisClar)
        doc.text("Gestión de Ropa", ML, 290)
        doc.text(`Página ${i} de ${pages}`, PW - MR, 290, { align: "right" })
      }

      const pdfBytes = new Uint8Array(doc.output("arraybuffer"))
      const base = await resolveExportDir()
      const filePath = await join(base, `pedido_${new Date().toISOString().slice(0, 10)}.pdf`)
      await writeFile(filePath.replace(/\\/g, "/"), pdfBytes)
      await confirmDraft(id, notas)
      draftIdRef.current = null; setDraftId(null); setSyncState("idle")
      toast.success("PDF guardado", filePath)
      backupDBSilent().catch(() => {})
      setPedido({}); setNotas(""); setSelectedProduct(null)
    } catch (e: any) {
      if (e?.message === "Selección cancelada") { setSyncState("saved"); return }
      console.error("ERROR EXPORTANDO PDF:", e)
      setSyncState("error")
      await alert(e?.message ?? "Error al exportar el PDF", { confirmLabel: "Aceptar" })
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const departments = Array.from(
    new Map(
      products
        .filter(p => p.departamento_id != null && p.departamento)
        .map(p => [p.departamento_id, p.departamento])
    ).entries()
  ).sort((a, b) => String(a[1]).localeCompare(String(b[1])))

  const filtered = products.filter(p => {
    const matchesSearch = (p.nombre + " " + (p.color ?? "")).toLowerCase().includes(search.toLowerCase())
    const matchesDept = deptFilter === null || p.departamento_id === deptFilter
    return matchesSearch && matchesDept
  })

  const items = construirPedido()
  const total = totalPedido()

  const syncBadge = (() => {
    if (!ready || total === 0) return null
    if (syncState === "saving") return (
      <span style={badgeStyle("#f0f9ff", "#0369a1", "#bae6fd")}>
        <span style={spinnerStyle} /> Guardando…
      </span>
    )
    if (syncState === "saved") return (
      <span style={badgeStyle("#f0fdf4", "#15803d", "#bbf7d0")}>💾 Borrador guardado</span>
    )
    if (syncState === "error") return (
      <span style={badgeStyle("#fff5f5", "#dc2626", "#fecaca")}>⚠ Error al guardar</span>
    )
    return null
  })()

  // Tallas del producto seleccionado ordenadas
  const tallasOrdenadas = selectedProduct
    ? [...selectedProduct.tallas].sort((a: any, b: any) => ordenarTallas(a.talla, b.talla))
    : []

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f2f5", fontFamily: "system-ui, sans-serif" }}>

      <AppHeader page="orders" onNavigate={onNavigate} draftCount={construirPedido().length} />

      {/* BARRA DE ACCIONES */}
      <div style={{
        backgroundColor: "#fff", borderBottom: "1px solid #e0e0e0",
        padding: "0 32px", display: "flex", alignItems: "center", height: "52px", gap: "12px",
      }}>
        <span style={{ fontSize: "15px", fontWeight: 600, color: "#111" }}>🛒 Nuevo pedido</span>
        {syncBadge}
        <div style={{ marginLeft: "auto", display: "flex", gap: "10px", alignItems: "center" }}>
          {total > 0 && (
            <button
              onClick={async () => {
                const ok = await confirm("¿Descartar el borrador? Se perderán todos los cambios.", { confirmLabel: "Descartar", danger: true })
                if (ok) await resetPedido()
              }}
              style={{ padding: "7px 14px", backgroundColor: "#fff", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: "6px", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
            >
              ✕ Descartar
            </button>
          )}
          <div ref={dropdownRef} style={{ position: "relative", display: "flex" }}>
            <button
              onClick={exportPDF}
              disabled={total === 0 || syncState === "saving"}
              style={{
                padding: "7px 18px",
                backgroundColor: total > 0 && syncState !== "saving" ? "#2563eb" : "#ccc",
                color: "#fff", border: "none", borderRadius: "6px 0 0 6px",
                fontSize: "13px", fontWeight: 600,
                cursor: total > 0 && syncState !== "saving" ? "pointer" : "not-allowed",
                borderRight: "1px solid rgba(255,255,255,0.25)",
              }}
            >
              📄 Exportar PDF y confirmar
            </button>
            <button
              onClick={() => setDropdownOpen(o => !o)}
              disabled={total === 0 || syncState === "saving"}
              style={{
                padding: "7px 10px",
                backgroundColor: total > 0 && syncState !== "saving" ? "#2563eb" : "#ccc",
                color: "#fff", border: "none", borderRadius: "0 6px 6px 0",
                fontSize: "11px", cursor: total > 0 && syncState !== "saving" ? "pointer" : "not-allowed",
              }}
            >▾</button>
            {dropdownOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0,
                backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.10)", minWidth: "220px", zIndex: 100, overflow: "hidden",
              }}>
                <button
                  onClick={confirmOnly}
                  style={{ display: "block", width: "100%", padding: "12px 16px", background: "none", border: "none", textAlign: "left", fontSize: "13px", color: "#333", cursor: "pointer", lineHeight: 1.4 }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f5f5f5")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "")}
                >
                  <div style={{ fontWeight: 600 }}>✓ Confirmar sin exportar</div>
                  <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>Guarda el pedido sin generar PDF</div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 24px", display: "grid", gridTemplateColumns: "260px 1fr 300px", gap: "16px", alignItems: "start" }}>

        {/* ── COLUMNA 1: LISTA DE PRODUCTOS ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Productos
          </div>
          <input
            placeholder="🔍 Buscar producto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "9px 12px", borderRadius: "8px",
              border: "1px solid #e0e0e0", fontSize: "13px",
              boxSizing: "border-box", backgroundColor: "#fff", outline: "none",
            }}
          />
          {departments.length > 0 && (
            <select
              value={deptFilter ?? ""}
              onChange={e => setDeptFilter(e.target.value ? Number(e.target.value) : null)}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: "8px",
                border: `1px solid ${deptFilter ? "#2563eb" : "#e0e0e0"}`,
                fontSize: "13px", boxSizing: "border-box",
                backgroundColor: deptFilter ? "#eff6ff" : "#fff",
                cursor: "pointer", color: deptFilter ? "#1d4ed8" : "#888",
                fontWeight: deptFilter ? 600 : 400,
              }}
            >
              <option value="">Todos los departamentos</option>
              {departments.map(([id, nombre]) => (
                <option key={id} value={id}>{nombre}</option>
              ))}
            </select>
          )}
          <div style={{
            backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px",
            overflow: "hidden", maxHeight: "calc(100vh - 260px)", overflowY: "auto",
          }}>
            {filtered.length === 0 && (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "#bbb", fontSize: "13px" }}>
                Sin resultados
              </div>
            )}
            {filtered.map(p => {
              const enPedido = p.tallas?.some((t: any) => (pedido[t.id] || 0) > 0)
              const isSelected = selectedProduct?.id === p.id
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  style={{
                    padding: "10px 14px", borderBottom: "1px solid #f0f0f0", cursor: "pointer",
                    backgroundColor: isSelected ? "#eff6ff" : "#fff",
                    transition: "background 0.1s",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px",
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = "#f9f9f9" }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSelected ? "#eff6ff" : "#fff" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: "13px", fontWeight: isSelected ? 600 : 500,
                      color: isSelected ? "#1d4ed8" : "#333",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {p.nombre}
                    </div>
                    {p.color && (
                      <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{p.color}</div>
                    )}
                  </div>
                  {enPedido && (
                    <span style={{
                      flexShrink: 0, width: "8px", height: "8px", borderRadius: "50%",
                      backgroundColor: "#2563eb", display: "inline-block",
                    }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── COLUMNA 2: FICHA DE PRODUCTO ── */}
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "10px" }}>
            Cantidades por talla
          </div>

          {!selectedProduct ? (
            <div style={{
              backgroundColor: "#fff", border: "1px dashed #d1d5db", borderRadius: "12px",
              padding: "60px 40px", textAlign: "center", color: "#bbb",
            }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>👗</div>
              <div style={{ fontSize: "14px", fontWeight: 500 }}>Selecciona un producto de la lista</div>
              <div style={{ fontSize: "12px", marginTop: "4px", color: "#d1d5db" }}>para añadirlo al pedido</div>
            </div>
          ) : (
            <div style={{
              backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "12px",
              overflow: "hidden",
            }}>
              {/* Imagen + info del producto */}
              <div style={{ display: "flex", gap: "0", borderBottom: "1px solid #f0f0f0" }}>

                {/* Imagen */}
                <div style={{
                  width: "160px", flexShrink: 0, backgroundColor: "#f5f5f5",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  minHeight: "160px",
                }}>
                  {selectedImageUrl ? (
                    <img
                      src={selectedImageUrl}
                      style={{ width: "160px", height: "160px", objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <span style={{ fontSize: "56px", opacity: 0.25 }}>👕</span>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, padding: "20px 22px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "6px" }}>
                  <div style={{ fontSize: "17px", fontWeight: 700, color: "#111", lineHeight: 1.3 }}>
                    {selectedProduct.nombre}
                  </div>
                  {selectedProduct.color && (
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      fontSize: "12px", color: "#6b7280",
                    }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#9ca3af", display: "inline-block" }} />
                      {selectedProduct.color}
                    </div>
                  )}
                  {selectedProduct.codigo && (
                    <div style={{ fontSize: "12px", color: "#9ca3af", fontFamily: "monospace" }}>
                      {selectedProduct.codigo}
                    </div>
                  )}
                  {selectedProduct.departamento && (
                    <div style={{
                      marginTop: "4px", display: "inline-block",
                      fontSize: "11px", fontWeight: 600, color: "#2563eb",
                      backgroundColor: "#eff6ff", padding: "3px 8px", borderRadius: "20px",
                      alignSelf: "flex-start",
                    }}>
                      {selectedProduct.departamento}
                    </div>
                  )}
                </div>
              </div>

              {/* Tallas */}
              <div style={{ padding: "20px 22px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>
                  Unidades a pedir
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {tallasOrdenadas.map((t: any) => {
                    const qty = pedido[t.id] || 0
                    const hasQty = qty > 0
                    return (
                      <div
                        key={t.id}
                        style={{
                          display: "flex", alignItems: "center", gap: "12px",
                          padding: "10px 14px", borderRadius: "8px",
                          backgroundColor: hasQty ? "#eff6ff" : "#fafafa",
                          border: `1px solid ${hasQty ? "#bfdbfe" : "#f0f0f0"}`,
                          transition: "background-color 0.15s, border-color 0.15s",
                        }}
                      >
                        {/* Talla */}
                        <div style={{
                          width: "44px", flexShrink: 0,
                          fontWeight: 700, fontSize: "15px",
                          color: hasQty ? "#1d4ed8" : "#374151",
                        }}>
                          {t.talla}
                        </div>

                        {/* Stock actual */}
                        <div style={{ flex: 1, fontSize: "12px", color: "#9ca3af" }}>
                          stock: <span style={{ fontWeight: 600, color: "#6b7280" }}>{t.stock}</span>
                        </div>

                        {/* Control cantidad */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
                          <button
                            onClick={() => setCantidad(t.id, Math.max(0, qty - 1))}
                            style={{
                              width: "32px", height: "32px", borderRadius: "8px 0 0 8px",
                              border: "1px solid #e0e0e0", borderRight: "none",
                              backgroundColor: "#fff", color: "#374151",
                              fontSize: "16px", fontWeight: 600, cursor: "pointer", lineHeight: 1,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >−</button>
                          <input
                            type="number"
                            min="0"
                            value={qty === 0 ? "" : qty}
                            placeholder="0"
                            onChange={e => setCantidad(t.id, Math.max(0, Number(e.target.value) || 0))}
                            style={{
                              width: "52px", height: "32px",
                              border: "1px solid #e0e0e0",
                              fontSize: "14px", fontWeight: hasQty ? 700 : 400,
                              textAlign: "center",
                              color: hasQty ? "#1d4ed8" : "#374151",
                              backgroundColor: hasQty ? "#eff6ff" : "#fff",
                              outline: "none",
                              // remove number spinners
                              MozAppearance: "textfield" as any,
                            }}
                          />
                          <button
                            onClick={() => setCantidad(t.id, qty + 1)}
                            style={{
                              width: "32px", height: "32px", borderRadius: "0 8px 8px 0",
                              border: "1px solid #e0e0e0", borderLeft: "none",
                              backgroundColor: "#fff", color: "#374151",
                              fontSize: "16px", fontWeight: 600, cursor: "pointer", lineHeight: 1,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >+</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── COLUMNA 3: RESUMEN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Resumen del pedido
          </div>
          <div style={{
            backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px",
            overflow: "hidden", maxHeight: "calc(100vh - 230px)", overflowY: "auto",
          }}>
            {/* Notas */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                Notas
              </div>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Proveedor, albarán, condiciones de entrega…"
                rows={4}
                style={{
                  width: "100%", resize: "vertical", padding: "9px 12px", borderRadius: "7px",
                  border: "1px solid #ddd", fontSize: "13px", boxSizing: "border-box", outline: "none",
                }}
              />
              <div style={{ fontSize: "11px", color: "#aaa", marginTop: "6px" }}>
                Se guardan con el borrador y quedan visibles en el historial.
              </div>
            </div>

            {items.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#bbb", fontSize: "13px" }}>
                Sin productos en el pedido
              </div>
            ) : (
              <>
                {items.map(item => {
                  const tallas = [...item.tallas].sort((a, b) => ordenarTallas(a.talla, b.talla))
                  return (
                    <div key={item.producto.id} style={{ padding: "12px 14px", borderBottom: "1px solid #f0f0f0" }}>
                      <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "8px", color: "#111" }}>
                        {item.producto.nombre}
                        {item.producto.color && (
                          <span style={{ fontWeight: 400, color: "#888", marginLeft: "6px", fontSize: "12px" }}>
                            ({item.producto.color})
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                        {tallas.map((t: any) => (
                          <div
                            key={t.tallaId}
                            style={{
                              display: "flex", alignItems: "center", gap: "5px",
                              padding: "3px 10px", borderRadius: "20px",
                              backgroundColor: "#eff6ff", border: "1px solid #bfdbfe",
                              fontSize: "12px",
                            }}
                          >
                            <span style={{ fontWeight: 700, color: "#1d4ed8" }}>{t.talla}</span>
                            <span style={{ color: "#6b7280" }}>·</span>
                            <input
                              type="number"
                              min="0"
                              value={t.cantidad}
                              onChange={e => setCantidad(t.tallaId, Number(e.target.value))}
                              style={{
                                width: "36px", padding: "0", border: "none",
                                fontSize: "12px", fontWeight: 600, textAlign: "center",
                                color: "#1d4ed8", backgroundColor: "transparent", outline: "none",
                              }}
                            />
                            <button
                              onClick={() => eliminarTalla(t.tallaId)}
                              style={{ background: "none", border: "none", color: "#93c5fd", cursor: "pointer", fontSize: "11px", lineHeight: 1, padding: "0 0 0 2px" }}
                            >✕</button>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", marginTop: "8px" }}>
                        Subtotal: {item.total} ud.
                      </div>
                    </div>
                  )
                })}
                <div style={{ padding: "14px 16px", backgroundColor: "#f9fafb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", color: "#6b7280", fontWeight: 500 }}>Total pedido</span>
                  <span style={{ fontSize: "16px", fontWeight: 800, color: "#111" }}>{total} ud.</span>
                </div>
              </>
            )}
          </div>
        </div>

      </main>
      {dialog}
    </div>
  )
}

function badgeStyle(bg: string, color: string, border: string): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: "6px",
    fontSize: "12px", color, backgroundColor: bg,
    border: `1px solid ${border}`, borderRadius: "20px",
    padding: "3px 10px", fontWeight: 500,
  }
}

const spinnerStyle: React.CSSProperties = {
  display: "inline-block", width: "10px", height: "10px",
  border: "2px solid #bae6fd", borderTopColor: "#0369a1",
  borderRadius: "50%", animation: "spin 0.7s linear infinite",
}
