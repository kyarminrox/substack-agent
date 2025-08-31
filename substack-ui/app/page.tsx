"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";

export default function Page() {
  const chat = useChat({ api: "/api/chat" } as any);
  const { messages, error, status, sendMessage } = chat as any;
  const [input, setInput] = React.useState("");
  const [tab, setTab] = React.useState<'answer' | 'steps' | 'logs'>("answer");
  const isLoading = status === "submitted" || status === "streaming";
  const renderText = (m: any) => {
    if (Array.isArray(m?.parts)) {
      return m.parts
        .filter((p: any) => p?.type === "text")
        .map((p: any) => p.text)
        .join("");
    }
    return (m as any).content ?? "";
  };

  const toolCards = (m: any) =>
    Array.isArray(m.parts)
      ? m.parts
          .filter((p: any) => typeof p?.type === "string" && p.type.startsWith("tool-"))
          .map((p: any, i: number) => (
            <div key={`${m.id}-tool-${i}`} style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, marginTop: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 12, opacity: 0.7 }}>{p.type}</div>
              <pre style={{ background: "#f7f7f7", padding: 8, borderRadius: 6, overflowX: "auto" }}>
                {JSON.stringify(p.output ?? p, null, 2)}
              </pre>
            </div>
          ))
      : null;

  // Collect step events and reconcile by id to avoid duplicates (in_progress -> success)
  const stepEvents: any[] = messages.flatMap((m: any) =>
    Array.isArray(m.parts)
      ? m.parts
          .filter((p: any) => p?.type === "data-step")
          .map((p: any) => p.data)
      : []
  );

  const grouped: Record<string, any> = {};
  const order: string[] = [];
  for (const ev of stepEvents) {
    const id: string = ev?.id ?? Math.random().toString(36).slice(2);
    const ts: number = ev?.ts ?? Date.now();
    if (!grouped[id]) {
      grouped[id] = { ...ev, tsFirst: ts };
      order.push(id);
    } else {
      // Update latest status/label/extra; keep first timestamp to preserve ordering
      grouped[id] = { ...grouped[id], ...ev };
    }
  }
  const stepItems: any[] = order.map((id) => grouped[id]).sort((a, b) => (a.tsFirst ?? 0) - (b.tsFirst ?? 0));
  const done = stepItems.find((s) => s.id === 'done' && s.status === 'success');

  return (
    <main style={{ maxWidth: 920, margin: "2rem auto", padding: 16 }}>
      {/* Local styles for color + spinner */}
      <style>{`
        :root {
          --brand: #6d28d9;      /* purple-700 */
          --brand-2: #2563eb;    /* blue-600 */
          --bg-soft: #f8fafc;    /* slate-50 */
          --line: #e5e7eb;       /* gray-200 */
          --text-dim: #6b7280;   /* gray-500 */
          --ok: #22c55e;         /* green-500 */
          --warn: #f59e0b;       /* amber-500 */
          --err: #ef4444;        /* red-500 */
        }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .spinner { width:12px; height:12px; border:2px solid #e5e7eb; border-top-color: var(--brand-2); border-radius:50%; animation: spin .8s linear infinite; }
        .shadow-card { box-shadow: 0 8px 20px rgba(0,0,0,.06); }
      `}</style>

      <div style={{
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 12,
        color: 'white',
        background: 'linear-gradient(90deg, var(--brand) 0%, var(--brand-2) 100%)'
      }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Substack Agent</div>
        <div style={{ fontSize: 12, opacity: .9 }}>Draft • Update • Publish</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {(['answer','steps','logs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 12px', borderRadius: 10,
            border: '1px solid var(--line)',
            background: tab===t? 'linear-gradient(90deg, #faf5ff 0%, #eff6ff 100%)':'#fff',
            color: tab===t? 'var(--brand-2)':'inherit',
            fontWeight: 600, cursor: 'pointer'
          }}>
            {t[0].toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      <div className="shadow-card" style={{ border: "1px solid var(--line)", background: 'var(--bg-soft)', borderRadius: 12, padding: 14, height: "56vh", overflowY: "auto" }}>
        {tab === 'answer' && (
          <>
            {messages.map((m: any) => (
              <div key={m.id} style={{ margin: "10px 0", background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6 }}>
                  {m.role === 'user' ? 'You' : 'Assistant'}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{renderText(m)}</div>
                {toolCards(m)}
              </div>
            ))}
            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.8 }}>
                <div className="spinner" />
                <span>Streaming…</span>
              </div>
            )}
            {error && <div style={{ color: "crimson", marginTop: 8 }}>Error: {String(error)}</div>}
          </>
        )}

        {tab === 'steps' && (
          <div>
            {stepItems.length === 0 && <div style={{ opacity: 0.7 }}>No steps yet.</div>}
            {done && (
              <div style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#065f46',
                padding: '8px 12px',
                borderRadius: 8,
                fontWeight: 700,
                marginBottom: 8
              }}>Finished working</div>
            )}
            {stepItems.map((s: any, i: number) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '20px 1fr', columnGap: 10,
                background:'#fff', border:'1px solid var(--line)', borderRadius: 10, padding: 10,
                marginBottom: 10, position: 'relative'
              }}>
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                  {s.status === 'in_progress' ? (
                    <div className="spinner" />
                  ) : (
                    <div style={{ width: 10, height: 10, borderRadius: 9999, marginTop: 3, background: s.status==='success'? 'var(--ok)': s.status==='error'? 'var(--err)' : 'var(--warn)' }} />
                  )}
                  {i < stepItems.length - 1 && (
                    <div style={{ position:'absolute', top: 18, width: 2, height: 24, background: 'var(--line)' }} />
                  )}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: 9999 }}>{s.phase}</div>
                  <div style={{ fontWeight: 700 }}>{s.label}</div>
                  {s.extra?.editUrl && (
                    <a href={s.extra.editUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--brand-2)' }}>open</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'logs' && (
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(messages, null, 2)}</pre>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const text = input.trim();
          if (!text) return;
          sendMessage({ text }).catch(() => {});
          setInput("");
        }}
        style={{ display: "flex", gap: 8, marginTop: 12 }}
      >
        <input
          name="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Try: draft a new substack post on the current recession fears and the leading causes'
          disabled={isLoading}
          style={{ flex: 1, padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8 }}
        />
        <button type="submit" disabled={isLoading} style={{ padding: "10px 16px", borderRadius: 8 }}>
          {isLoading ? "…" : "Send"}
        </button>
      </form>
    </main>
  );
}
