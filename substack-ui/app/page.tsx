"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";

export default function Page() {
  const chat = useChat({ api: "/api/chat" } as any);
  const { messages, error, status, sendMessage } = chat as any;
  const [input, setInput] = React.useState("");
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

  return (
    <main style={{ maxWidth: 800, margin: "2rem auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>Substack Agent</h1>

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, height: "50vh", overflowY: "auto" }}>
        {messages.map((m: any) => (
          <div key={m.id} style={{ margin: "8px 0" }}>
            <b>{m.role === "user" ? "You" : "Assistant"}:</b>{" "}
            <span style={{ whiteSpace: "pre-wrap" }}>{renderText(m)}</span>
            {Array.isArray(m.parts)
              ? m.parts
                  .filter((p: any) => typeof p?.type === "string" && p.type.startsWith("tool-"))
                  .map((p: any, i: number) => (
                    <pre key={i} style={{ background: "#f7f7f7", padding: 8, borderRadius: 6, overflowX: "auto" }}>
                      {JSON.stringify(p.output ?? p, null, 2)}
                    </pre>
                  ))
              : null}
          </div>
        ))}
        {isLoading && <div style={{ opacity: 0.7, fontStyle: "italic" }}>Streaming…</div>}
        {error && <div style={{ color: "crimson", marginTop: 8 }}>Error: {String(error)}</div>}
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
