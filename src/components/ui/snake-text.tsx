"use client";

import CurvedLoop from "./curved-loop";

export function SnakeText() {
  return (
    <section className="w-full overflow-hidden py-8 -mb-16">
      <CurvedLoop
        marqueeText="Socializer "
        speed={0.3}
        curveAmount={-400}
        direction="left"
        fillClass="fill-[#0A0A0A] dark:fill-white"
      />
      <CurvedLoop
        marqueeText="Socializer "
        speed={0.3}
        curveAmount={400}
        direction="right"
        fillClass="fill-[#0A0A0A] dark:fill-white"
      />
    </section>
  );
}
