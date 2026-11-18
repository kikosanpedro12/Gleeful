// Paste into the browser console on https://polyhaven.com (F12 -> Console), press Enter.
// Packs each starter model as a .glb (1k textures) and downloads ONE zip (gleeful-polyhaven.zip). All CC0.
(async () => {
  const IDS = ["SchoolDesk_01","SchoolChair_01","standing_chalkboard_01","alarm_clock_01","wall_clock","wooden_bookshelf_worn","marble_bust_01","pocket_watch","vintage_grandfather_clock_01","vintage_oil_lamp","seadogs_compass","vintage_microscope","jug_01","wicker_basket_01","wooden_crate_02","wooden_bucket_01","wooden_bowl_01","food_apple_01","potted_plant_01","tree_stump_01","rock_moss_set_01","boulder_01","moon_rock_01"];
  const pad = (n) => (4 - (n % 4)) % 4;
  async function pack(id, res = "1k") {
    const f = await (await fetch("https://api.polyhaven.com/files/" + id)).json();
    const e = f.gltf[res].gltf, gj = await (await fetch(e.url)).json();
    const get = async (u) => new Uint8Array(await (await fetch(e.include[u].url)).arrayBuffer());
    const parts = [], bufOff = []; let off = 0;
    for (const b of gj.buffers) { const d = await get(b.uri); bufOff.push(off); parts.push(d); off += d.length; const p = pad(off); if (p) { parts.push(new Uint8Array(p)); off += p; } }
    gj.bufferViews.forEach((v) => { v.byteOffset = (v.byteOffset || 0) + bufOff[v.buffer]; v.buffer = 0; });
    for (const im of gj.images || []) { const d = await get(im.uri); im.mimeType = /\.png$/i.test(im.uri) ? "image/png" : "image/jpeg"; gj.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: d.length }); im.bufferView = gj.bufferViews.length - 1; delete im.uri; parts.push(d); off += d.length; const p = pad(off); if (p) { parts.push(new Uint8Array(p)); off += p; } }
    gj.buffers = [{ byteLength: off }];
    let js = new TextEncoder().encode(JSON.stringify(gj)); const jp = pad(js.length); if (jp) { const t = new Uint8Array(js.length + jp); t.set(js); t.fill(32, js.length); js = t; }
    const total = 12 + 8 + js.length + 8 + off, out = new Uint8Array(total), dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(js, 20);
    let p = 20 + js.length; dv.setUint32(p, off, true); dv.setUint32(p + 4, 0x004e4942, true); p += 8; for (const q of parts) { out.set(q, p); p += q.length; }
    return out;
  }
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (d) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = crcT[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), chunks = [], central = []; let off = 0;
    for (const [name, data] of files) {
      const nm = enc.encode(name), c = crc(data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, c, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
      chunks.push(new Uint8Array(h.buffer), nm, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, c, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nm);
      off += 30 + nm.length + data.length;
    }
    const csize = central.reduce((n, x) => n + x.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
  }
  const files = [];
  for (const id of IDS) {
    try { const out = await pack(id); if (out.length > 8e6) { console.log("SKIPPED (too big)", id, out.length); continue; } files.push(["ph_" + id + ".glb", out]); console.log("packed", id, out.length); }
    catch (err) { console.log("FAILED", id, String(err)); }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(zip(files)); a.download = "gleeful-polyhaven.zip";
  document.body.appendChild(a); a.click(); a.remove();
  console.log("ALL DONE: one zip downloaded,", files.length, "models");
})();
