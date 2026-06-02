import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif", padding: "32px",
        }}>
          <div style={{
            backgroundColor: "#fff", borderRadius: "12px", padding: "40px 48px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)", maxWidth: "480px", width: "100%",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#111", margin: "0 0 8px" }}>
              Algo salió mal
            </h2>
            <p style={{ fontSize: "13px", color: "#666", margin: "0 0 24px", lineHeight: 1.6 }}>
              La aplicación encontró un error inesperado. Puedes recargar para intentarlo de nuevo.
              Si el problema persiste, anota el mensaje de error y contacta con soporte.
            </p>
            <div style={{
              backgroundColor: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: "8px",
              padding: "10px 14px", marginBottom: "24px", textAlign: "left",
            }}>
              <code style={{ fontSize: "11px", color: "#dc2626", fontFamily: "monospace", wordBreak: "break-all" }}>
                {this.state.error.message}
              </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 28px", borderRadius: "8px", border: "none",
                backgroundColor: "#111", color: "#fff", fontSize: "14px",
                fontWeight: 600, cursor: "pointer",
              }}
            >
              Recargar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
