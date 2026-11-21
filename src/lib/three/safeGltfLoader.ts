import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * three's GLTFLoader reads embedded textures through a blob: URL fetch, which our CSP (connect-src 'self') rightly
 * refuses. Without createImageBitmap it falls back to an <img> (img-src allows blob:), so hide it during parse only.
 * The check happens synchronously when the parser is built, so the restore below is safe.
 * Shared by the story panel (props, figures) and the GLB teachers (src/lib/teacher/glbRig.ts).
 * No Draco / meshopt decoder is registered on purpose: both are WebAssembly and the CSP has no 'wasm-unsafe-eval'.
 */
export class SafeGLTFLoader extends GLTFLoader {
  override parse(data: ArrayBuffer | string, path: string, onLoad: Parameters<GLTFLoader["parse"]>[2], onError?: Parameters<GLTFLoader["parse"]>[3]) {
    const g = globalThis as { createImageBitmap?: unknown };
    const saved = g.createImageBitmap;
    g.createImageBitmap = undefined;
    try { super.parse(data, path, onLoad, onError); } finally { g.createImageBitmap = saved; }
  }
}
