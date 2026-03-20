"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F9F9F7" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "3.75rem", fontWeight: 900, color: "#0A0A0A", margin: 0 }}>500</h1>
            <p style={{ marginTop: "0.5rem", fontSize: "1.125rem", color: "#5C5C5A" }}>Something went wrong</p>
            <button
              onClick={reset}
              style={{
                marginTop: "1.5rem",
                display: "inline-block",
                background: "#0A0A0A",
                color: "#F9F9F7",
                padding: "0.75rem 1.5rem",
                fontWeight: 700,
                fontSize: "0.875rem",
                border: "none",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
