"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Hud from "@/components/Hud";
import DevPanel from "@/components/DevPanel";

const Stage = dynamic(() => import("@/components/Stage"), { ssr: false, loading: () => <div className="loading">Getting the classroom ready…</div> });

export default function Page() {
  const [dev, setDev] = useState(false);
  const [quality, setQuality] = useState<"high" | "low">("high");
  const [webgl, setWebgl] = useState(true);
  useEffect(() => {
    setDev(new URLSearchParams(location.search).has("dev"));
    try {
      const c = document.createElement("canvas");
      if (!(c.getContext("webgl2") || c.getContext("webgl"))) setWebgl(false);
    } catch { setWebgl(false); }
  }, []);
  return (
    <main className="app">
      {webgl ? <Stage onQuality={setQuality} /> : <div className="loading">This device cannot show the 3D classroom. You can still talk or type to Leo.</div>}
      <Hud />
      {dev && <DevPanel quality={quality} />}
    </main>
  );
}
