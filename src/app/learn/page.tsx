"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import Hud from "@/components/Hud";
import DevPanel from "@/components/DevPanel";

const Stage = dynamic(() => import("@/components/Stage"), { ssr: false, loading: () => <div className="loading">Getting the classroom ready…</div> });

export default function Page() {
  const [dev, setDev] = useState(false);
  const [quality, setQuality] = useState<"high" | "low">("high");
  const [webgl, setWebgl] = useState(true);
  const flash = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setDev(new URLSearchParams(location.search).has("dev"));
    try {
      const c = document.createElement("canvas");
      if (!(c.getContext("webgl2") || c.getContext("webgl"))) setWebgl(false);
    } catch { setWebgl(false); }
  }, []);
  return (
    <main className="app">
      {webgl ? <Stage onQuality={setQuality} flash={flash} /> : <div className="loading">This device cannot show the 3D classroom. You can still talk or type to your teacher.</div>}
      <div ref={flash} className="flash" aria-hidden />
      <Hud />
      {dev && <DevPanel quality={quality} />}
    </main>
  );
}
