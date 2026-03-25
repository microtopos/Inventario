import { useDraft } from "./DraftContext"

export type Page =
  | "inventory"
  | "dashboard"
  | "orders"
  | "orderHistory"
  | "gasolina"
  | "productos"

interface AppHeaderProps {
  page: Page
  onNavigate: (page: Page) => void
  onBack?: () => void
  title?: string
  actions?: React.ReactNode
}

// orderHistory ya no aparece como ítem independiente en la nav.
// Se accede desde dentro de OrderPage.
const NAV_ITEMS: { key: Page; label: string; group: "ropa" | "gasolina" | "productos" }[] = [
  { key: "inventory", label: "📦 Inventario",  group: "ropa" },
  { key: "orders",    label: "🛒 Pedidos",      group: "ropa" },
  { key: "gasolina",  label: "🚗 Coches",       group: "gasolina" },
  { key: "productos", label: "🧴 Productos",    group: "productos" },
]

const GROUP_ACCENT: Record<string, string> = {
  ropa:      "#2563eb",
  gasolina:  "#ea580c",
  productos: "#16a34a",
}

export default function AppHeader({ page, onNavigate, onBack, title, actions }: AppHeaderProps) {
  const { draftCount } = useDraft()

  // "orderHistory" se considera parte del grupo "ropa" / página "orders" a efectos visuales
  const activePage = page === "orderHistory" ? "orders" : page

  return (
    <header style={{
      backgroundColor: "#fff",
      borderBottom: "1px solid #e0e0e0",
      padding: "0 32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: "64px",
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>

      {/* LADO IZQUIERDO */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "7px 14px", borderRadius: "8px",
              border: "1px solid #d1d5db", backgroundColor: "#f9fafb",
              color: "#374151", fontSize: "14px", fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
              transition: "background-color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = "#f3f4f6"
              e.currentTarget.style.borderColor = "#9ca3af"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = "#f9fafb"
              e.currentTarget.style.borderColor = "#d1d5db"
            }}
          >
            <span style={{ fontSize: "16px", lineHeight: 1 }}>←</span>
            Volver
          </button>
        )}

        <div style={{ display: "flex", alignItems: "center" }}>
          <h1 style={{
            fontSize: "18px", fontWeight: 700, color: "#111",
            margin: 0, letterSpacing: "-0.3px", whiteSpace: "nowrap",
          }}>
            Gestión de Almacén
          </h1>
          {title && (
            <div style={{ display: "flex", alignItems: "center", marginLeft: "12px" }}>
              <span style={{ color: "#ddd", fontSize: "20px", fontWeight: 300, margin: "0 8px" }}>/</span>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "#111" }}>{title}</span>
            </div>
          )}
        </div>
      </div>

      {/* LADO DERECHO */}
      <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
        {actions}

        {(["ropa", "gasolina", "productos"] as const).map((group, gi) => {
          const items = NAV_ITEMS.filter(i => i.group === group)
          const groupAccent = GROUP_ACCENT[group]

          return (
            <div
              key={group}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0px",
                marginLeft: gi === 0 ? "0" : "12px",
                paddingLeft: gi === 0 ? "0" : "12px",
                borderLeft: gi === 0 ? "none" : "1px solid #e5e7eb",
              }}
            >
              {items.map(({ key, label }) => {
                const isActive = activePage === key
                return (
                  <button
                    key={key}
                    onClick={() => onNavigate(key)}
                    style={{
                      position: "relative",
                      padding: "8px 14px",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: isActive ? `${groupAccent}08` : "transparent",
                      color: isActive ? groupAccent : "#666",
                      fontWeight: isActive ? 600 : 500,
                      fontSize: "14px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = `${groupAccent}08`
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "transparent"
                      }
                    }}
                  >
                    {label}

                    {/* Badge de borrador en pedidos */}
                    {key === "orders" && draftCount > 0 && (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "18px",
                        height: "18px",
                        padding: "0 5px",
                        borderRadius: "999px",
                        backgroundColor: isActive ? groupAccent : `${groupAccent}20`,
                        color: isActive ? "#fff" : groupAccent,
                        fontSize: "11px",
                        fontWeight: 700,
                        lineHeight: 1,
                      }}>
                        {draftCount}
                      </span>
                    )}

                    {/* Indicador activo */}
                    {isActive && (
                      <span style={{
                        position: "absolute",
                        bottom: "0",
                        left: "14px",
                        right: "14px",
                        height: "3px",
                        backgroundColor: groupAccent,
                        borderRadius: "3px 3px 0 0",
                      }} />
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </header>
  )
}
