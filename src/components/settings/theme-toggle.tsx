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
    <button
      type="button"
      onClick={toggle}
      className="relative w-14 h-8 border border-[var(--color-base-black)] bg-[var(--color-base-100)] cursor-pointer transition-colors"
      aria-label="Toggle theme"
    >
      <span
        className="absolute top-1 left-1 w-6 h-6 bg-[var(--color-brand-lime)] border border-[var(--color-base-black)] transition-transform duration-200"
        style={{ transform: dark ? "translateX(22px)" : "translateX(0)" }}
      />
      <span className="absolute left-1.5 top-1.5 text-xs leading-none select-none pointer-events-none">
        {dark ? "" : "\u2600"}
      </span>
      <span className="absolute right-1.5 top-1.5 text-xs leading-none select-none pointer-events-none">
        {dark ? "\u263E" : ""}
      </span>
    </button>
  );
}
