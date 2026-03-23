import { useEffect, useState } from "react"
import { getProductSizes, getProductMovements, getProductMovementsCount, updateProduct } from "./productService"
import { pickAndSaveProductImage } from "./imageService"
import { addStock, updateProductColor } from "./productService"
import { useConfirm } from "./ConfirmDialog"
import { ordenarTallas } from "./sortTallas"
import ColorSelect from "./ColorSelect"
import DepartmentSelect from "./DepartmentSelect"
import { getImageUrl, invalidateImageCache } from "./getImageUrl"
import AppHeader from "./AppHeader"
import type { StockThresholds } from "./settingsService"
import { getDB } from "./db"

async function addTallaToProduct(productId: number, talla: string): Promise<void> {
  const db = await getDB()
  await db.execute(
    "INSERT OR IGNORE INTO tallas (producto_id, talla, stock) VALUES (?, ?, 0)",
    [productId, talla.trim()]
  )
}

async function deleteTalla(tallaId: number): Promise<void> {
  const db = await getDB()
  await db.execute("DELETE FROM movimientos WHERE talla_id = ?", [tallaId])
  await db.execute("DELETE FROM tallas WHERE id = ?", [tallaId])
}

export default function ProductDetail({ product, onBack, onNavigate, onProductUpdated, stockThresholds, draftCount }: any) {
  const [sizes, setSizes] = useState<any[]>([])
  const [entrada, setEntrada] = useState<Record<number, number | "">>({})
  const [movements, setMovements] = useState<any[]>([])
  const [movementsTotal, setMovementsTotal] = useState(0)
  const [movementsPage, setMovementsPage] = useState(0)
  const [movementsPageSize, setMovementsPageSize] = useState(10)
  const [editingInfo, setEditingInfo] = useState(false)
  const [editNombre, setEditNombre] = useState(product.nombre ?? "")
  const [editCodigo, setEditCodigo] = useState(product.codigo ?? "")
  const [editColor, setEditColor] = useState(product.color ?? "")
  const [editDepartamentoId, setEditDepartamentoId] = useState<number | null>(product.departamento_id ?? null)
  const [editDepartamentoNombre, setEditDepartamentoNombre] = useState<string>(product.departamento ?? "")
  const [infoSaved, setInfoSaved] = useState(false)
  const [displayNombre, setDisplayNombre] = useState(product.nombre ?? "")
  const [displayCodigo, setDisplayCodigo] = useState(product.codigo ?? "")
  const [displayDepartamento, setDisplayDepartamento] = useState(product.departamento ?? "")
  const [imageError, setImageError] = useState(false)
  const [imageUrl, setImageUrl] = useState<string>(product.imageUrl ?? "")
  const [uploadingImage, setUploadingImage] = useState(false)
  const [addingTalla, setAddingTalla] = useState(false)
  const [newTallaInput, setNewTallaInput] = useState("")

  const { confirm, dialog } = useConfirm()

  const thresholds: StockThresholds = stockThresholds ?? { red: 2, orange: 5 }

  function stockColor(stock: number): { bg: string; color: string } {
    if (stock <= thresholds.red) return { bg: "#fee2e2", color: "#991b1b" }
    if (stock <= thresholds.orange) return { bg: "#ffedd5", color: "#c2410c" }
    return { bg: "#dcfce7", color: "#166534" }
  }

  async function reloadSizes() {
    const data = await getProductSizes(product.id)
    setSizes([...data].sort((a, b) => ordenarTallas(a.talla, b.talla)))
    const [movs, total] = await Promise.all([
      getProductMovements(product.id, movementsPageSize, 0),
      getProductMovementsCount(product.id),
    ])
    setMovements(movs as any[])
    setMovementsTotal(total)
    setMovementsPage(0)
    setEntrada({})
  }

  async function loadMovementsPage(page: number, pageSize = movementsPageSize) {
    const movs = await getProductMovements(product.id, pageSize, page * pageSize)
    setMovements(movs as any[])
    setMovementsPage(page)
  }

  async function reloadImage() {
    invalidateImageCache(product.id)
    const url = await getImageUrl(product.id)
    setImageUrl(url)
    setImageError(false)
  }

  useEffect(() => {
    setImageError(false)
    setImageUrl(product.imageUrl ?? "")
    reloadSizes()
    getImageUrl(product.id).then(url => setImageUrl(url))
  }, [product])

  const totalEntrada = Object.values(entrada).reduce((s: number, v) => s + (Number(v) || 0), 0)

  // Stepper helpers
  function getAjuste(id: number): number {
    return Number(entrada[id] ?? 0)
  }
  function setAjuste(id: number, val: number | "") {
    setEntrada(prev => ({ ...prev, [id]: val }))
  }
  function stepUp(id: number) {
    setAjuste(id, getAjuste(id) + 1)
  }
  function stepDown(id: number) {
    setAjuste(id, getAjuste(id) - 1)
  }

  async function handleAddTalla() {
    const partes = newTallaInput.split(",").map(t => t.trim()).filter(t => t.length > 0)
    if (partes.length === 0) { setAddingTalla(false); setNewTallaInput(""); return }

    const existentes = sizes.map(s => s.talla.trim().toUpperCase())
    const duplicadas = partes.filter(t => existentes.includes(t.toUpperCase()))
    if (duplicadas.length > 0) {
      await confirm(
        `La${duplicadas.length > 1 ? "s" : ""} talla${duplicadas.length > 1 ? "s" : ""} "${duplicadas.join(", ")}" ya existe${duplicadas.length > 1 ? "n" : ""} en este producto.`,
        { confirmLabel: "Entendido", danger: false }
      )
      return
    }
    for (const talla of partes) await addTallaToProduct(product.id, talla)
    setNewTallaInput(""); setAddingTalla(false)
    await reloadSizes()
  }

  async function handleDeleteTalla(talla: any) {
    const ok = await confirm(`¿Eliminar la talla ${talla.talla}?`, {
      confirmLabel: "Eliminar talla", danger: true,
      detail: talla.stock > 0
        ? `Tiene ${talla.stock} unidades en stock. Se eliminarán la talla y todos sus movimientos.`
        : "Se eliminarán también todos sus movimientos registrados.",
    })
    if (!ok) return
    await deleteTalla(talla.id)
    await reloadSizes()
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>

      <AppHeader
        page="inventory"
        onNavigate={onNavigate}
        onBack={onBack}
        title={product.nombre}
        draftCount={draftCount}
      />

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px 24px", display: "grid", gridTemplateColumns: "320px 1fr", gap: "20px", alignItems: "start" }}>

        {/* COLUMNA IZQUIERDA */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* FOTO */}
          <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "12px", padding: "24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            {!imageError && imageUrl ? (
              <img
                src={imageUrl}
                style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "8px", border: "1px solid #e0e0e0" }}
                onError={() => setImageError(true)}
              />
            ) : (
              <div style={{ width: "100%", aspectRatio: "1", backgroundColor: "#f0f0f0", borderRadius: "8px", border: "1px solid #e0e0e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "80px" }}>
                👕
              </div>
            )}
            <button
              onClick={async () => {
                setUploadingImage(true)
                try {
                  const saved = await pickAndSaveProductImage(product.id)
                  if (saved) await reloadImage()
                } finally {
                  setUploadingImage(false)
                }
              }}
              disabled={uploadingImage}
              style={{
                display: "block", width: "100%", padding: "9px 0", borderRadius: "7px",
                border: "1px solid #ddd", backgroundColor: uploadingImage ? "#f5f5f5" : "#fff",
                color: uploadingImage ? "#aaa" : "#444", fontSize: "13px", fontWeight: 500,
                cursor: uploadingImage ? "not-allowed" : "pointer", textAlign: "center", boxSizing: "border-box",
              }}
            >
              {uploadingImage ? "Guardando…" : "📷 Cambiar foto"}
            </button>
          </div>

          {/* INFO */}
          <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "12px", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Información
              </span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                {infoSaved && <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: 600 }}>✓ Guardado</span>}
                {editingInfo ? (
                  <>
                    <button
                      onClick={async () => {
                        if (!editNombre.trim()) return
                        await updateProduct(product.id, { nombre: editNombre.trim(), codigo: editCodigo.trim(), departamento_id: editDepartamentoId })
                        await updateProductColor(product.id, editColor)
                        product.nombre = editNombre.trim(); product.codigo = editCodigo.trim()
                        product.color = editColor; product.departamento_id = editDepartamentoId
                        product.departamento = editDepartamentoNombre
                        setDisplayNombre(editNombre.trim()); setDisplayCodigo(editCodigo.trim())
                        setDisplayDepartamento(editDepartamentoNombre)
                        setEditingInfo(false); setInfoSaved(true)
                        setTimeout(() => setInfoSaved(false), 2500)
                        onProductUpdated?.({ nombre: editNombre.trim(), codigo: editCodigo.trim(), color: editColor, departamento_id: editDepartamentoId, departamento: editDepartamentoNombre })
                      }}
                      style={{ padding: "5px 14px", borderRadius: "6px", border: "none", backgroundColor: "#111", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                    >✓ Guardar</button>
                    <button
                      onClick={() => { setEditNombre(product.nombre ?? ""); setEditCodigo(product.codigo ?? ""); setEditColor(product.color ?? ""); setEditDepartamentoId(product.departamento_id ?? null); setEditingInfo(false) }}
                      style={{ padding: "5px 12px", borderRadius: "6px", border: "1px solid #ddd", backgroundColor: "#fff", color: "#555", fontSize: "12px", cursor: "pointer" }}
                    >Cancelar</button>
                  </>
                ) : (
                  <button
                    onClick={() => { setEditNombre(product.nombre ?? ""); setEditCodigo(product.codigo ?? ""); setEditColor(product.color ?? ""); setEditDepartamentoId(product.departamento_id ?? null); setEditDepartamentoNombre(product.departamento ?? ""); setEditingInfo(true) }}
                    style={{ background: "none", border: "1px solid #e0e0e0", borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: "#888", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "#aaa")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#e0e0e0")}
                  >✏︎ Editar</button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <div style={fieldLabelStyle}>Nombre</div>
                {editingInfo ? <input autoFocus value={editNombre} onChange={e => setEditNombre(e.target.value)} style={fieldInputStyle} /> : <div style={fieldValueStyle}>{displayNombre}</div>}
              </div>
              <div>
                <div style={fieldLabelStyle}>Código</div>
                {editingInfo ? <input value={editCodigo} onChange={e => setEditCodigo(e.target.value)} placeholder="Opcional" style={fieldInputStyle} /> : <div style={{ ...fieldValueStyle, fontFamily: displayCodigo ? "monospace" : "inherit", color: displayCodigo ? "#555" : "#ccc" }}>{displayCodigo || "—"}</div>}
              </div>
              <div>
                <div style={fieldLabelStyle}>Departamento</div>
                {editingInfo
                  ? <DepartmentSelect value={editDepartamentoId} onChange={(id, nombre) => { setEditDepartamentoId(id); setEditDepartamentoNombre(nombre ?? "") }} />
                  : <div style={{ ...fieldValueStyle, color: displayDepartamento ? "#333" : "#ccc" }}>{displayDepartamento || "—"}</div>}
              </div>
              <div>
                <div style={fieldLabelStyle}>Color</div>
                {editingInfo
                  ? <ColorSelect value={editColor} onChange={value => setEditColor(value)} />
                  : <div style={{ ...fieldValueStyle, color: product.color ? "#333" : "#ccc" }}>{product.color || "—"}</div>}
              </div>
            </div>
          </div>

        </div>

        {/* COLUMNA DERECHA: TALLAS */}
        <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "12px", padding: "24px" }}>

          {/* Cabecera */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#111", margin: 0 }}>Stock por tallas</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {totalEntrada !== 0 && (
                <span style={{ fontSize: "13px", fontWeight: 500, color: totalEntrada > 0 ? "#16a34a" : "#dc2626" }}>
                  {totalEntrada > 0 ? `+${totalEntrada}` : totalEntrada} unidades a aplicar
                </span>
              )}
              {!addingTalla && (
                <button
                  onClick={() => { setAddingTalla(true); setNewTallaInput("") }}
                  style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 14px", borderRadius: "7px", border: "1px solid #2563eb", backgroundColor: "#eff6ff", color: "#2563eb", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                >
                  + Añadir talla
                </button>
              )}
            </div>
          </div>

          {/* Formulario añadir talla */}
          {addingTalla && (
            <div style={{ marginBottom: "16px", padding: "14px 16px", backgroundColor: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#0369a1", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Nueva talla</div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  autoFocus value={newTallaInput}
                  onChange={e => setNewTallaInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleAddTalla(); if (e.key === "Escape") { setAddingTalla(false); setNewTallaInput("") } }}
                  placeholder="Ej: XL  o  S, M, L  (separa con comas)"
                  style={{ flex: 1, minWidth: "200px", padding: "8px 12px", borderRadius: "7px", border: "1px solid #7dd3fc", fontSize: "14px", backgroundColor: "#fff", outline: "none", boxSizing: "border-box" }}
                />
                <button onClick={handleAddTalla} style={{ padding: "8px 18px", borderRadius: "7px", border: "none", backgroundColor: "#0284c7", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>✓ Añadir</button>
                <button onClick={() => { setAddingTalla(false); setNewTallaInput("") }} style={{ padding: "8px 14px", borderRadius: "7px", border: "1px solid #ddd", backgroundColor: "#fff", color: "#666", fontSize: "13px", cursor: "pointer" }}>Cancelar</button>
              </div>
              <div style={{ fontSize: "12px", color: "#0369a1", marginTop: "7px", opacity: 0.8 }}>
                Puedes añadir varias tallas a la vez separándolas con comas. Se crearán con stock 0.
              </div>
            </div>
          )}

          {/* Lista de tallas */}
          {sizes.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#aaa", fontSize: "14px", border: "1px dashed #e0e0e0", borderRadius: "8px" }}>
              Esta prenda no tiene tallas. Pulsa "+ Añadir talla" para empezar.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {sizes.map((s: any) => {
                const ajuste = getAjuste(s.id)
                const resultado = s.stock + ajuste
                const hayAjuste = entrada[s.id] !== undefined && entrada[s.id] !== "" && ajuste !== 0

                return (
                  <div
                    key={s.id}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "12px 14px", borderRadius: "10px",
                      backgroundColor: hayAjuste ? (ajuste > 0 ? "#f0fdf4" : "#fff5f5") : "#fafafa",
                      border: `1px solid ${hayAjuste ? (ajuste > 0 ? "#86efac" : "#fca5a5") : "#f0f0f0"}`,
                      transition: "background-color 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={e => {
                      const btn = e.currentTarget.querySelector<HTMLElement>(".del-talla-btn")
                      if (btn) btn.style.opacity = "1"
                    }}
                    onMouseLeave={e => {
                      const btn = e.currentTarget.querySelector<HTMLElement>(".del-talla-btn")
                      if (btn) btn.style.opacity = "0"
                    }}
                  >
                    {/* Talla */}
                    <div style={{ width: "44px", flexShrink: 0, fontWeight: 700, fontSize: "15px", color: hayAjuste ? (ajuste > 0 ? "#166534" : "#991b1b") : "#374151" }}>
                      {s.talla}
                    </div>

                    {/* Stock actual */}
                    <div style={{ width: "80px", flexShrink: 0 }}>
                      <span style={{
                        display: "inline-block", padding: "3px 10px", borderRadius: "20px",
                        fontSize: "12px", fontWeight: 600,
                        backgroundColor: stockColor(s.stock).bg,
                        color: stockColor(s.stock).color,
                      }}>
                        {s.stock} ud.
                      </span>
                    </div>

                    {/* Stepper de ajuste */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
                      <button
                        onClick={() => stepDown(s.id)}
                        style={stepperBtnStyle("left")}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f3f4f6")}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#fff")}
                      >−</button>
                      <input
                        type="number"
                        value={entrada[s.id] ?? ""}
                        placeholder="0"
                        onChange={e => setAjuste(s.id, e.target.value === "" ? "" : Number(e.target.value))}
                        style={{
                          width: "60px", height: "34px",
                          border: "1px solid #e0e0e0",
                          fontSize: "14px", fontWeight: hayAjuste ? 700 : 400,
                          textAlign: "center", outline: "none",
                          color: hayAjuste ? (ajuste > 0 ? "#166534" : "#991b1b") : "#374151",
                          backgroundColor: hayAjuste ? (ajuste > 0 ? "#f0fdf4" : "#fff5f5") : "#fff",
                          MozAppearance: "textfield" as any,
                        }}
                      />
                      <button
                        onClick={() => stepUp(s.id)}
                        style={stepperBtnStyle("right")}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f3f4f6")}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#fff")}
                      >+</button>
                    </div>

                    {/* Resultado */}
                    <div style={{ width: "80px", flexShrink: 0 }}>
                      {hayAjuste && (
                        <span style={{ fontSize: "13px", fontWeight: 700, color: resultado < 0 ? "#dc2626" : "#374151" }}>
                          {resultado < 0 ? "⚠️ " : "→ "}{resultado} ud.
                        </span>
                      )}
                    </div>

                    {/* Botón eliminar talla */}
                    <button
                      className="del-talla-btn"
                      onClick={() => handleDeleteTalla(s)}
                      title={`Eliminar talla ${s.talla}`}
                      style={{
                        opacity: 0, transition: "opacity 0.15s", marginLeft: "auto",
                        background: "none", border: "1px solid #fca5a5", color: "#dc2626",
                        borderRadius: "6px", padding: "4px 10px", fontSize: "12px",
                        cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                      }}
                    >
                      ✕ Eliminar
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Botón aplicar */}
          {sizes.length > 0 && (
            <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: "16px" }}>
              <button
                onClick={async () => {
                  for (const tallaId in entrada) {
                    const ajuste = Number(entrada[Number(tallaId)])
                    if (!ajuste) continue
                    const talla = sizes.find((s: any) => s.id === Number(tallaId))
                    if (talla && talla.stock + ajuste < 0) {
                      await confirm(
                        `La talla ${talla.talla} no tiene suficiente stock (stock actual: ${talla.stock}, intentas restar: ${Math.abs(ajuste)})`,
                        { confirmLabel: "Entendido", danger: false }
                      )
                      return
                    }
                  }
                  const ok = await confirm("¿Aplicar los cambios de stock?", { confirmLabel: "Aplicar" })
                  if (!ok) return
                  for (const tallaId in entrada) {
                    const ajuste = Number(entrada[Number(tallaId)])
                    if (!ajuste) continue
                    await addStock(Number(tallaId), ajuste)
                  }
                  await reloadSizes()
                }}
                style={{ padding: "10px 24px", backgroundColor: "#16a34a", color: "#fff", border: "none", borderRadius: "7px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
              >
                ✓ Aplicar ajuste de stock
              </button>
              <span style={{ fontSize: "12px", color: "#aaa" }}>
                Usa − para restar unidades
              </span>
            </div>
          )}
        </div>

      </main>

      {/* HISTORIAL DE MOVIMIENTOS */}
      {(movements.length > 0 || movementsTotal > 0) && (
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 24px 32px" }}>
          <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "12px", overflow: "hidden" }}>

            <div style={{ padding: "18px 24px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#111", margin: 0 }}>Historial de movimientos</h2>
                <span style={{ fontSize: "12px", color: "#aaa" }}>{movementsTotal} movimiento{movementsTotal !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "12px", color: "#aaa" }}>Mostrar:</span>
                  {[10, 25, 50].map(size => (
                    <button key={size} onClick={async () => { setMovementsPageSize(size); await loadMovementsPage(0, size) }}
                      style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer", border: movementsPageSize === size ? "1px solid #111" : "1px solid #e0e0e0", backgroundColor: movementsPageSize === size ? "#111" : "#fff", color: movementsPageSize === size ? "#fff" : "#555", fontWeight: movementsPageSize === size ? 600 : 400 }}>
                      {size}
                    </button>
                  ))}
                </div>
                {movementsTotal > movementsPageSize && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px", color: "#aaa" }}>{movementsPage + 1} / {Math.ceil(movementsTotal / movementsPageSize)}</span>
                    <button onClick={() => loadMovementsPage(movementsPage - 1)} disabled={movementsPage === 0}
                      style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #e0e0e0", backgroundColor: "#fff", fontSize: "13px", cursor: movementsPage === 0 ? "not-allowed" : "pointer", color: movementsPage === 0 ? "#ccc" : "#333" }}>←</button>
                    <button onClick={() => loadMovementsPage(movementsPage + 1)} disabled={(movementsPage + 1) * movementsPageSize >= movementsTotal}
                      style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #e0e0e0", backgroundColor: "#fff", fontSize: "13px", cursor: (movementsPage + 1) * movementsPageSize >= movementsTotal ? "not-allowed" : "pointer", color: (movementsPage + 1) * movementsPageSize >= movementsTotal ? "#ccc" : "#333" }}>→</button>
                  </div>
                )}
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                  <th style={thStyle}>Fecha</th>
                  <th style={thStyle}>Talla</th>
                  <th style={thStyle}>Movimiento</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Origen</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m: any, i: number) => {
                  const isEntrada = m.cambio > 0
                  const isPedido = m.origen === "pedido"
                  return (
                    <tr key={m.id ?? i} style={{ borderBottom: "1px solid #f5f5f5" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#fafafa")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "")}>
                      <td style={{ ...tdStyle, color: "#888", fontSize: "13px" }}>
                        {m.fecha ? new Date(m.fecha).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{m.talla}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, fontSize: "15px", color: isEntrada ? "#16a34a" : "#dc2626" }}>
                        {isEntrada ? "+" : ""}{m.cambio} ud.
                      </td>
                      <td style={tdStyle}>
                        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, backgroundColor: isEntrada ? "#dcfce7" : "#fee2e2", color: isEntrada ? "#166534" : "#991b1b" }}>
                          {isEntrada ? "Entrada" : "Salida"}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, backgroundColor: isPedido ? "#eff6ff" : "#f5f5f5", color: isPedido ? "#1d4ed8" : "#666" }}>
                          {isPedido ? "📦 Pedido" : "✏️ Manual"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

          </div>
        </div>
      )}

      {dialog}
    </div>
  )
}

// ── Stepper button style ──────────────────────────────────────────────────────

function stepperBtnStyle(side: "left" | "right"): React.CSSProperties {
  return {
    width: "34px", height: "34px",
    borderRadius: side === "left" ? "8px 0 0 8px" : "0 8px 8px 0",
    border: "1px solid #e0e0e0",
    borderLeft: side === "right" ? "none" : "1px solid #e0e0e0",
    borderRight: side === "left" ? "none" : "1px solid #e0e0e0",
    backgroundColor: "#fff", color: "#374151",
    fontSize: "18px", fontWeight: 500, lineHeight: 1,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "background-color 0.1s",
  }
}

// ── Static styles ─────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: "11px 16px", textAlign: "left", verticalAlign: "middle",
  fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em",
}

const tdStyle: React.CSSProperties = {
  padding: "11px 16px", fontSize: "14px", verticalAlign: "middle",
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 600, color: "#aaa",
  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px",
}

const fieldValueStyle: React.CSSProperties = {
  fontSize: "14px", color: "#333", fontWeight: 500, padding: "2px 0",
}

const fieldInputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: "7px",
  border: "1px solid #ddd", fontSize: "14px", boxSizing: "border-box",
}
