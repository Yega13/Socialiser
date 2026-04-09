"use client";

import { useRef, useEffect, useState, useMemo, useId, FC, PointerEvent } from "react";

const SnakeLoop: FC = () => {
  const text = "Socializer Socializer Socializer\u00A0";
  const measureRef = useRef<SVGTextElement | null>(null);
  const textPathRef = useRef<SVGTextPathElement | null>(null);
  const [spacing, setSpacing] = useState(0);
  const [offset, setOffset] = useState(0);
  const uid = useId();
  const pathId = `snake-${uid}`;

  // S-curve: left side curves down (+200), right side curves up (-200)
  const pathD = "M-100,200 Q360,400 720,200 Q1080,0 1540,200";

  const dragRef = useRef(false);
  const lastXRef = useRef(0);
  const dirRef = useRef<"left" | "right">("left");
  const velRef = useRef(0);
  const speed = 0.3;

  const totalText = spacing > 0
    ? Array(Math.ceil(3000 / spacing) + 2).fill(text).join("")
    : text;
  const ready = spacing > 0;

  useEffect(() => {
    if (measureRef.current) setSpacing(measureRef.current.getComputedTextLength());
  }, [text]);

  useEffect(() => {
    if (!spacing || !textPathRef.current) return;
    const initial = -spacing;
    textPathRef.current.setAttribute("startOffset", initial + "px");
    setOffset(initial);
  }, [spacing]);

  useEffect(() => {
    if (!spacing || !ready) return;
    let frame = 0;
    const step = () => {
      if (!dragRef.current && textPathRef.current) {
        const delta = dirRef.current === "right" ? speed : -speed;
        const cur = parseFloat(textPathRef.current.getAttribute("startOffset") || "0");
        let next = cur + delta;
        if (next <= -spacing) next += spacing;
        if (next > 0) next -= spacing;
        textPathRef.current.setAttribute("startOffset", next + "px");
        setOffset(next);
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [spacing, ready]);

  const onPointerDown = (e: PointerEvent) => {
    dragRef.current = true;
    lastXRef.current = e.clientX;
    velRef.current = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragRef.current || !textPathRef.current) return;
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    velRef.current = dx;
    const cur = parseFloat(textPathRef.current.getAttribute("startOffset") || "0");
    let next = cur + dx;
    if (next <= -spacing) next += spacing;
    if (next > 0) next -= spacing;
    textPathRef.current.setAttribute("startOffset", next + "px");
    setOffset(next);
  };

  const endDrag = () => {
    dragRef.current = false;
    dirRef.current = velRef.current > 0 ? "right" : "left";
  };

  return (
    <section className="w-full overflow-hidden py-8">
      <div
        className="flex items-center justify-center w-full"
        style={{ visibility: ready ? "visible" : "hidden", cursor: dragRef.current ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <svg
          className="select-none w-full overflow-visible block text-[3rem] font-bold uppercase leading-none"
          viewBox="0 0 1440 400"
          preserveAspectRatio="xMidYMid meet"
        >
          <text ref={measureRef} xmlSpace="preserve" style={{ visibility: "hidden", opacity: 0, pointerEvents: "none" }}>
            {text}
          </text>
          <defs>
            <path id={pathId} d={pathD} fill="none" stroke="transparent" />
          </defs>
          {ready && (
            <text xmlSpace="preserve" className="fill-[#0A0A0A] dark:fill-white">
              <textPath ref={textPathRef} href={`#${pathId}`} startOffset={offset + "px"} xmlSpace="preserve">
                {totalText}
              </textPath>
            </text>
          )}
        </svg>
      </div>
    </section>
  );
};

export { SnakeLoop as SnakeText };
