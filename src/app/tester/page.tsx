"use client";
import { useEffect, useState } from "react";
import { clearTesterCode, getTesterCode, setTesterCode } from "@/lib/brain/tester";

/**
 * Private-test passcode screen. The code is kept in this tab only and checked
 * by the server on every AI turn. Nothing here tells you whether a code is
 * right: start a lesson and look at the badge ("AI · test" = the AI answered).
 */
export default function TesterPage() {
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setSaved(!!getTesterCode()); }, []);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (setTesterCode(code)) { setCode(""); setSaved(true); }
  };
  return (
    <main className="tester">
      <h1>Private test access</h1>
      <p>Enter the tester passcode once. It stays in this browser tab only and is cleared when you close it.</p>
      {saved ? (
        <>
          <p className="ok" role="status" data-testid="tester-saved">Passcode saved for this tab.</p>
          <a className="primary" href="/">Start a lesson</a>
          <button className="ghost" onClick={() => { clearTesterCode(); setSaved(false); }}>Forget passcode</button>
        </>
      ) : (
        <form onSubmit={save}>
          <label htmlFor="tester-code">Passcode</label>
          <input id="tester-code" data-testid="tester-code" type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={200} value={code} onChange={(e) => setCode(e.target.value)} required />
          <button className="primary" type="submit" disabled={!code.trim()}>Save passcode</button>
        </form>
      )}
      <small className="fine">If the passcode is wrong, the lesson still works: it uses the scripted lesson instead of the AI.</small>
    </main>
  );
}
