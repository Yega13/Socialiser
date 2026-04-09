"use client";

import { useEffect, useState } from "react";
import ClickSpark from "./click-spark";

export function SparkWrapper({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    setIsDark(html.classList.contains("dark"));

    const observer = new MutationObserver(() => {
      setIsDark(html.classList.contains("dark"));
    });
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return (
    <ClickSpark sparkColor={isDark ? "#FFFFFF" : "#0A0A0A"} sparkSize={10} sparkRadius={15} sparkCount={8} duration={400}>
      {children}
    </ClickSpark>
  );
}
