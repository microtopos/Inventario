import { useState, useEffect } from "react"
import { useToast } from "./Toast"
import { useConfirm } from "./ConfirmDialog"
import {
  getCategorias,
  actualizarProducto,
  crearProducto,
  getUnidadesPresentacion,
  crearUnidadPresentacion,
  getPresentacionesDeProducto,
  upsertPresentacion,
  deletePresentacion,
  type CategoriaProducto,
  type ProductoAlmacen,
} from "./productosService"

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  backgroundColor: "#fff",
  fontSize: "14px",
  outline: "none",
  transition: "border-color 0.15s",
}

const btnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  backgroundColor: "#fff",
  color: "#374151",
  fontSize: "14px",
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 0.15s",
}

export function ModalProducto({
  producto,
  onClose,
  onSaved,
  categorias,
}: {
  producto: ProductoAlmacen | null
  onClose: () => void
  onSaved: () => void
  categorias: CategoriaProducto[]
}) {
  const toast = useToast()
  const [referencia, setReferencia] = useState(producto?.referencia ?? "")
  const [nombre, setNombre] = useState(producto?.nombre ?? "")
  const [categoriaId, setCategoriaId] = useState<number>(producto?.categoria_id ?? categorias[0]?.id ?? 0)
  const [unidadMedida, setUnidadMedida] = useState(producto?.unidad_medida ?? "")
  const [precio, setPrecio] = useState<string>(producto?.precio?.toString() ?? "")
  const [saving, setSaving] = useState(false)
  // Presentaciones
  const [unidades, setUnidades] = useState<Array<{id: number; nombre: string}>>([])
  const [presentaciones, setPresentaciones] = useState<Array<{id: number; unidad_id: number; nombre: string; precio: string | null}>>([])
  const [nuevaUnidadNombre, setNuevaUnidadNombre] = useState("")
  const [mostrarInputNuevaUnidad, setMostrarInputNuevaUnidad] = useState(false)
  const [editandoPresentacionId, setEditandoPresentacionId] = useState<number | null>(null)

  // Cargar unidades de presentación
  useEffect(() => {
    async function loadUnidades() {
      const unidades = await getUnidadesPresentacion();
      setUnidades(unidades);
    }
    loadUnidades();
  }, []);

  // Cargar presentaciones del producto cuando cambia
  useEffect(() => {
    async function loadPresentaciones() {
      if (producto) {
        const presentaciones = await getPresentacionesDeProducto(producto.id);
        // Formatear para mostrar precio como string o null
        const formatted = presentaciones.map(p => ({
          id: p.id,
          unidad_id: p.unidad_id,
          nombre: p.nombre,
          precio: p.precio !== null ? p.precio.toString() : null
        }));
        setPresentaciones(formatted);

        // Actualizar precio basado en la unidad_medida actual
        const pres = presentaciones.find(p => p.nombre === unidadMedida);
        if (pres) {
          setPrecio(pres.precio !== null ? pres.precio.toString() : "");
        } else {
          // Si no encontramos la presentación, buscar por unidad_id
          const presById = presentaciones.find(p => p.unidad_id === Number(unidadMedida));
          if (presById) {
            setPrecio(presById.precio !== null ? presById.precio.toString() : "");
          } else {
            setPrecio("");
          }
        }

        // Si es un producto nuevo y no tiene presentaciones, crear una vacía
        if (!producto.id && presentaciones.length === 0) {
          // Para producto nuevo, no podemos crear presentación aún porque no tiene ID
          // Se manejará en el submit
        }
      } else {
        // Producto nuevo - iniciar con una presentación vacía
        const defaultUnidadId = unidades.length > 0 ? unidades[0].id : 1;
        const defaultUnidadNombre = unidades.length > 0 ? unidades[0].nombre : "UNIDAD";
        setPresentaciones([{
          id: 0, // ID temporal
          unidad_id: defaultUnidadId,
          nombre: defaultUnidadNombre,
          precio: null
        }]);
        setUnidadMedida(defaultUnidadNombre);
        setPrecio("");
      }
    }
    loadPresentaciones();
  }, [producto, unidades, unidadMedida]);

  async function handleSubmit() {
    if (!referencia.trim() || !nombre.trim()) {
      toast.error("Error", "Referencia y nombre son obligatorios")
      return
    }

    // Validar presentaciones
    let hasValidPrecio = true;
    for (const pres of presentaciones) {
      if (pres.id !== 0 && pres.precio !== null && pres.precio.trim() !== "" && isNaN(parseFloat(pres.precio))) {
        hasValidPrecio = false;
        break;
      }
    }

    if (!hasValidPrecio) {
      toast.error("Error", "El precio debe ser un número válido")
      return;
    }

    setSaving(true)
    try {
      let productoId: number;

      if (producto) {
        // Actualizar producto existente
        await actualizarProducto(producto.id, {
          referencia: referencia.trim(),
          nombre: nombre.trim(),
          categoria_id: categoriaId,
          // Nota: unidad_medida y precio se gestionan por presentación ahora
          // Los mantenemos para compatibilidad pero podrían ser ignorados
          unidad_medida: unidadMedida.trim(),
          precio: (() => {
            const pres = presentaciones.find(p => p.unidad_id === Number(unidadMedida));
            if (pres && pres.precio !== null && pres.precio !== "") {
              return parseFloat(pres.precio);
            }
            return null;
          })()
        })
        productoId = producto.id;
        toast.success("Producto actualizado")
      } else {
        // Crear nuevo producto
        const selectedPres = presentaciones.find(p => p.nombre === unidadMedida) || presentaciones[0];
        productoId = await crearProducto(referencia.trim(), nombre.trim(), categoriaId,
          unidadMedida,
          selectedPres.precio !== null && selectedPres.precio !== "" ? parseFloat(selectedPres.precio) : null);
        toast.success("Producto creado")
      }

      // Ahora guardar/actualizar las presentaciones
      if (productoId > 0) {
        // Eliminar presentaciones existentes (excepto las que mantuvimos por compatibilidad)
        // Enfoque mejor: sincronizar presentaciones
        const existentes = await getPresentacionesDeProducto(productoId);
        const existentesMap = new Map(existentes.map(e => [e.unidad_id, e]));

        for (const pres of presentaciones) {
          if (pres.id === 0) {
            // Nueva presentación
            await upsertPresentacion(productoId, pres.unidad_id,
              pres.precio !== null && pres.precio.trim() !== "" ? parseFloat(pres.precio) : null);
          } else {
            // Presentación existente - actualizar si cambió
            const existente = existentesMap.get(pres.unidad_id);
            if (!existente || existente.precio !== (pres.precio !== null && pres.precio.trim() !== "" ? parseFloat(pres.precio) : null)) {
              await upsertPresentacion(productoId, pres.unidad_id,
                pres.precio !== null && pres.precio.trim() !== "" ? parseFloat(pres.precio) : null);
            }
          }
        }

        // Eliminar presentaciones que ya no están en la lista
        const presentesIds = new Map();
        for (const pres of presentaciones) {
          if (pres.id !== 0) {
            presentesIds.set(pres.unidad_id, true);
          }
        }

        for (const existente of existentes) {
          if (!presentesIds.has(existente.unidad_id)) {
            try {
              await deletePresentacion(existente.id);
            } catch (e) {
              // Si tiene salidas, no eliminarla - solo dejarla
              console.log(`No se puede eliminar presentación ${existente.id} porque tiene salidas`);
            }
          }
        }
      }

      onSaved()
      onClose()
    } catch (e: any) {
      toast.error("Error", e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 300 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        backgroundColor: "#fff", borderRadius: "14px", width: "420px",
        maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
        zIndex: 301, overflow: "hidden",
      }}>
        <div style={{ height: "4px", backgroundColor: "#16a34a" }} />
        <div style={{ padding: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 20px" }}>
            {producto ? "Editar producto" : "Nuevo producto"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Referencia
              </label>
              <input
                type="text"
                value={referencia}
                onChange={e => setReferencia(e.target.value)}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                placeholder="Ej: BOLSA-001"
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Nombre / Descripción
              </label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                placeholder="Ej: Bolsa de basura 50L"
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Categoría
              </label>
              <select
                value={categoriaId}
                onChange={e => setCategoriaId(Number(e.target.value))}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              >
                {categorias.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Unidad de medida
              </label>
              <select
                value={unidadMedida}
                onChange={(e) => {
                  const selectedValue = e.target.value;
                  setUnidadMedida(selectedValue);

                  // Actualizar precio basado en la presentación seleccionada
                  if (selectedValue !== "-1") {
                    const pres = presentaciones.find(p => p.nombre === selectedValue);
                    if (pres) {
                      setPrecio(pres.precio !== null ? pres.precio : "");
                    } else {
                      setPrecio("");
                    }
                  } else {
                    // Mostrar input para nueva unidad
                    setMostrarInputNuevaUnidad(true);
                  }
                }}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              >
                {unidades.map(unidad => (
                  <option key={unidad.id} value={unidad.nombre}>{unidad.nombre}</option>
                ))}
                {!mostrarInputNuevaUnidad && (
                  <option value="-1">+ Nueva unidad...</option>
                )}
              </select>
              {mostrarInputNuevaUnidad && (
                <div style={{ marginTop: "8px" }}>
                  <input
                    type="text"
                    value={nuevaUnidadNombre}
                    onChange={(e) => setNuevaUnidadNombre(e.target.value)}
                    onBlur={() => {
                      if (nuevaUnidadNombre.trim()) {
                        // Crear nueva unidad
                        crearUnidadPresentacion(nuevaUnidadNombre.trim()).then((newId) => {
                          setUnidades(prev => [...prev, { id: newId, nombre: nuevaUnidadNombre.trim() }]);
                          setMostrarInputNuevaUnidad(false);
                          setNuevaUnidadNombre("");
                          // Seleccionar la nueva unidad
                          setUnidadMedida(nuevaUnidadNombre.trim());
                          // Añadir presentación para esta nueva unidad
                          const nuevaPresentaciones = [...presentaciones];
                          nuevaPresentaciones.push({
                            id: 0, // ID temporal
                            unidad_id: newId,
                            nombre: nuevaUnidadNombre.trim(),
                            precio: null
                          });
                          setPresentaciones(nuevaPresentaciones);
                        });
                      } else {
                        setMostrarInputNuevaUnidad(false);
                        setNuevaUnidadNombre("");
                      }
                    }}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    placeholder="Nombre de la unidad"
                  />
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Precio (€) <span style={{ fontWeight: 400, color: "#999" }}>(opcional)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={precio}
                onChange={e => setPrecio(e.target.value)}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                placeholder="Ej: 4.99"
              />
            </div>

            {/* Presentaciones */}
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: "6px" }}>
                Presentaciones
              </label>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
                {presentaciones.map((pres, index) => (
                  <div key={pres.id} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", paddingBottom: "12px", borderBottom: index < presentaciones.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                    {/* Selector de unidad */}
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <label style={{ fontSize: "12px", fontWeight: 500, color: "#374151", marginBottom: "2px" }}>
                        Unidad
                      </label>
                      <select
                        value={pres.unidad_id}
                        onChange={(e) => {
                          const nuevaPresentaciones = [...presentaciones];
                          nuevaPresentaciones[index] = {
                            ...nuevaPresentaciones[index],
                            unidad_id: Number(e.target.value),
                            nombre: unidades.find(u => u.id === Number(e.target.value))?.nombre || ""
                          };
                          setPresentaciones(nuevaPresentaciones);
                        }}
                        style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                      >
                        {unidades.map(unidad => (
                          <option key={unidad.id} value={unidad.id}>{unidad.nombre}</option>
                        ))}
                        {!mostrarInputNuevaUnidad && (
                          <option value="-1">+ Nueva unidad...</option>
                        )}
                      </select>
                      {mostrarInputNuevaUnidad && pres.unidad_id === -1 && (
                        <input
                          type="text"
                          value={nuevaUnidadNombre}
                          onChange={(e) => setNuevaUnidadNombre(e.target.value)}
                          onBlur={() => {
                            if (nuevaUnidadNombre.trim()) {
                              // Crear nueva unidad
                              crearUnidadPresentacion(nuevaUnidadNombre.trim()).then((newId) => {
                                setUnidades(prev => [...prev, { id: newId, nombre: nuevaUnidadNombre.trim() }]);
                                setMostrarInputNuevaUnidad(false);
                                setNuevaUnidadNombre("");
                                // Actualizar la presentación para usar esta nueva unidad
                                const nuevaPresentaciones = [...presentaciones];
                                nuevaPresentaciones[index] = {
                                  ...nuevaPresentaciones[index],
                                  unidad_id: newId,
                                  nombre: nuevaUnidadNombre.trim()
                                };
                                setPresentaciones(nuevaPresentaciones);
                              });
                            } else {
                              setMostrarInputNuevaUnidad(false);
                              setNuevaUnidadNombre("");
                            }
                          }}
                          style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                          placeholder="Nombre de la unidad"
                        />
                      )}
                    </div>

                    {/* Input de precio */}
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label style={{ fontSize: "12px", fontWeight: 500, color: "#374151", marginBottom: "2px" }}>
                        Precio (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={pres.precio !== null ? pres.precio : ""}
                        onChange={(e) => {
                          const nuevaPresentaciones = [...presentaciones];
                          nuevaPresentaciones[index] = {
                            ...nuevaPresentaciones[index],
                            precio: e.target.value === "" ? null : e.target.value
                          };
                          setPresentaciones(nuevaPresentaciones);
                        }}
                        style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                        placeholder="0.00"
                      />
                    </div>

                    {/* Botón eliminar */}
                    <div style={{ display: "flex", alignItems: "center" }}>
                      {!editandoPresentacionId && (
                        <button
                          onClick={() => {
                            if (pres.id === 0) {
                              // Eliminar presentación temporal
                              const nuevaPresentaciones = presentaciones.filter((_, i) => i !== index);
                              setPresentaciones(nuevaPresentaciones);
                            } else {
                              // Intentar eliminar presentación real
                              deletePresentacion(pres.id).then(() => {
                                const nuevaPresentaciones = presentaciones.filter((_, i) => i !== index);
                                setPresentaciones(nuevaPresentaciones);
                              }).catch((error) => {
                                toast.error("Error", error?.message || "No se puede eliminar la presentación porque tiene salidas asociadas");
                              });
                            }
                          }}
                          disabled={pres.id !== 0 && false}
                          title={pres.id !== 0 && "Esta presentación tiene salidas asociadas" || ""}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid #d1d5db",
                            backgroundColor: "#fff",
                            color: "#ef4444",
                            fontSize: "14px",
                            cursor: pres.id !== 0 && false ? "not-allowed" : "pointer",
                            opacity: pres.id !== 0 && false ? 0.5 : 1
                          }}
                        >
                          ✕
                        </button>
                      )}
                      {editandoPresentacionId === pres.id && (
                        <button
                          onClick={() => setEditandoPresentacionId(null)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid #d1d5db",
                            backgroundColor: "#f3f4f6",
                            color: "#6b7280",
                            fontSize: "14px",
                            cursor: "pointer"
                          }}
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Botón para agregar nueva presentación */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
                  <button
                    onClick={() => {
                      // Agregar una nueva presentación vacía
                      const defaultUnidadId = unidades.length > 0 ? unidades[0].id : 1;
                      const defaultUnidadNombre = unidades.length > 0 ? unidades[0].nombre : "UNIDAD";
                      setPresentaciones(prev => [
                        ...prev,
                        {
                          id: 0, // ID temporal
                          unidad_id: defaultUnidadId,
                          nombre: defaultUnidadNombre,
                          precio: null
                        }
                      ]);
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      backgroundColor: "#fff",
                      color: "#2563eb",
                      fontSize: "14px",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.15s"
                    }}
                  >
                    + Añadir presentación
                  </button>
                </div>
              </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "24px", justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              style={{ ...btnStyle, backgroundColor: "#fff", border: "1px solid #ddd", color: "#666" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{ ...btnStyle, backgroundColor: saving ? "#f5f5f5" : "#16a34a", color: saving ? "#aaa" : "#fff", border: "none", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>
    </div>
  );
}
