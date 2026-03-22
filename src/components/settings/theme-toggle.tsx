"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        className="group flex items-center gap-2 px-4 py-2 border border-[var(--color-base-black)] shadow-[var(--shadow-hard)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_var(--color-base-black)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all cursor-pointer select-none font-semibold text-sm"
        style={{ background: dark ? "#C8FF00" : "#0A0A0A", color: dark ? "#0A0A0A" : "#F9F9F7" }}
      >
        <span className="text-base">{dark ? "\u2600\uFE0F" : "\uD83C\uDF19"}</span>
        {dark ? "Light mode" : "Dark mode"}
      </button>
    </div>
  );
}
