"use client";
import { glbEnabled } from "@/lib/teacher/glbFlag";
import { useGlbLoading } from "@/lib/teacher/glbStatus";
import { useEffect, useState } from "react";

/**
 * "Getting your teacher ready": shown only while the GLB teachers load (flag on). The live region is always present
 * so a screen reader hears the text when it appears; there is no animation, so reduced motion needs nothing special.
 * It is gone as soon as the teachers (or the procedural fallback after a failure or 8 s) are on screen.
 */
export default function TeacherLoadingNote() {
  const [flag, setFlag] = useState(false);
  useEffect(() => setFlag(glbEnabled()), []);
  const loading = useGlbLoading();
  if (!flag) return null;
  return (
    <p role="status" aria-live="polite" data-testid="teacher-loading"
      style={{ position: "absolute", left: "50%", top: "22%", transform: "translateX(-50%)", margin: 0, padding: "8px 16px", whiteSpace: "nowrap", borderRadius: 999, background: "rgba(255,247,234,.95)", color: "#14213D", border: "2px solid #14213D", font: "700 1rem/1.3 inherit", pointerEvents: "none", zIndex: 3, visibility: loading ? "visible" : "hidden" }}>
      {loading ? "Getting your teacher ready…" : ""}
    </p>
  );
}
