import { useDraft } from "./DraftContext"

type Page = "inventory" | "dashboard" | "orders" | "orderHistory"

interface AppHeaderProps {
  page: Page
  onNavigate: (page: Page) => void
  onBack?: () => void
  title?: string
  actions?: React.ReactNode
  // draftCount ya no es necesario como prop — lo lee del contexto
}

export default function AppHeader({ page, onNavigate, onBack, title, actions }: AppHeaderProps) {
  const { draftCount } = useDraft()

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
            Gestión de Ropa
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
      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
        {actions}
        {([
          { key: "inventory",    label: "📦 Inventario" },
          { key: "dashboard",    label: "📊 Estadísticas" },
          { key: "orders",       label: "🛒 Pedidos" },
          { key: "orderHistory", label: "📋 Historial" },
        ] as { key: Page; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            style={{
              position: "relative", padding: "8px 14px", borderRadius: "6px",
              border: "none", backgroundColor: "transparent",
              color: page === key ? "#2563eb" : "#666",
              fontWeight: page === key ? 600 : 500,
              fontSize: "14px", cursor: "pointer",
              transition: "color 0.15s, background-color 0.15s",
              display: "flex", alignItems: "center", gap: "6px",
            }}
            onMouseEnter={e => { if (page !== key) e.currentTarget.style.backgroundColor = "#f5f7ff" }}
            onMouseLeave={e => { if (page !== key) e.currentTarget.style.backgroundColor = "transparent" }}
          >
            {label}
            {key === "orders" && draftCount > 0 && (
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                minWidth: "18px", height: "18px", padding: "0 5px", borderRadius: "999px",
                backgroundColor: page === "orders" ? "#2563eb" : "#e0e7ff",
                color: page === "orders" ? "#fff" : "#2563eb",
                fontSize: "11px", fontWeight: 700, lineHeight: 1,
              }}>
                {draftCount}
              </span>
            )}
            {page === key && (
              <span style={{
                position: "absolute", bottom: "2px", left: "14px", right: "14px",
                height: "2px", backgroundColor: "#2563eb", borderRadius: "2px",
              }} />
            )}
          </button>
        ))}
      </div>
    </header>
  )
}
