"use client";

import ClickSpark from "./click-spark";

export function SparkWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ClickSpark sparkColor="#C8FF00" sparkSize={10} sparkRadius={15} sparkCount={8} duration={400}>
      {children}
    </ClickSpark>
  );
}
