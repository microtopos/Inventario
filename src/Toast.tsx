import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"

export type ToastType = "success" | "error" | "info"

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  detail?: string
  duration?: number   // ms, default 3000
  action?: ToastAction
  createdAt: number
}

type ToastInput = Omit<ToastItem, "id" | "createdAt">

interface ToastContextValue {
  push: (t: ToastInput) => void
  success: (title: string, detail?: string) => void
  error: (title: string, detail?: string) => void
  info: (title: string, detail?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<Record<string, number>>({})

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    const handle = timers.current[id]
    if (handle) window.clearTimeout(handle)
    delete timers.current[id]
  }, [])

  const push = useCallback(
    (t: ToastInput) => {
      const id = uid()
      const duration = t.duration ?? 3000
      const item: ToastItem = { id, createdAt: Date.now(), ...t, duration }
      setItems((prev) => [item, ...prev].slice(0, 6))
      timers.current[id] = window.setTimeout(() => remove(id), duration)
    },
    [remove]
  )

  const value = useMemo<ToastContextValue>(() => {
    return {
      push,
      success: (title, detail) => push({ type: "success", title, detail }),
      error: (title, detail) => push({ type: "error", title, detail }),
      info: (title, detail) => push({ type: "info", title, detail }),
    }
  }, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} onClose={remove} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>")
  return ctx
}

function ToastViewport({ items, onClose }: { items: ToastItem[]; onClose: (id: string) => void }) {
  return (
    <div
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        zIndex: 1500,
        width: 360,
        maxWidth: "calc(100vw - 24px)",
      }}
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onClose={onClose} />
      ))}
    </div>
  )
}

function ToastCard({ item: t, onClose }: { item: ToastItem; onClose: (id: string) => void }) {
  // Progress bar: animates from 100% → 0% over `duration` ms
  const duration = t.duration ?? 3000

  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "12px",
        border: `1px solid ${t.type === "success" ? "#bbf7d0" : t.type === "error" ? "#fecaca" : "#e5e7eb"}`,
        boxShadow: "0 12px 36px rgba(0,0,0,0.14)",
        overflow: "hidden",
      }}
      role="status"
      aria-live="polite"
    >
      {/* Top color stripe */}
      <div style={{ height: 4, backgroundColor: t.type === "success" ? "#16a34a" : t.type === "error" ? "#dc2626" : "#111" }} />

      {/* Body */}
      <div style={{ padding: "12px 14px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
        <div
          style={{
            width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            backgroundColor: t.type === "success" ? "#f0fdf4" : t.type === "error" ? "#fff5f5" : "#f3f4f6",
            border: `1px solid ${t.type === "success" ? "#bbf7d0" : t.type === "error" ? "#fecaca" : "#e5e7eb"}`,
            color: t.type === "success" ? "#15803d" : t.type === "error" ? "#dc2626" : "#111",
          }}
        >
          {t.type === "success" ? "✓" : t.type === "error" ? "⚠️" : "i"}
        </div>
        <div style={{ flex: 1, paddingTop: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111", lineHeight: 1.25 }}>{t.title}</div>
          {t.detail && (
            <div style={{ fontSize: 12.5, color: "#666", marginTop: 4, lineHeight: 1.35, whiteSpace: "pre-wrap" }}>
              {t.detail}
            </div>
          )}
          {/* Action button */}
          {t.action && (
            <button
              onClick={() => { t.action!.onClick(); onClose(t.id) }}
              style={{
                marginTop: 8,
                padding: "5px 12px",
                borderRadius: "6px",
                border: "1px solid #e0e0e0",
                backgroundColor: "#fff",
                color: "#111",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f3f4f6")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#fff")}
            >
              {t.action.label}
            </button>
          )}
        </div>
        <button
          onClick={() => onClose(t.id)}
          title="Cerrar"
          style={{
            background: "none", border: "none", color: "#888",
            cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "4px 6px",
          }}
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, backgroundColor: "#f0f0f0" }}>
        <div
          style={{
            height: "100%",
            backgroundColor: t.type === "success" ? "#86efac" : t.type === "error" ? "#fca5a5" : "#d1d5db",
            transformOrigin: "left",
            animation: `toastProgress ${duration}ms linear forwards`,
          }}
        />
      </div>

      <style>{`
        @keyframes toastProgress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  )
}
