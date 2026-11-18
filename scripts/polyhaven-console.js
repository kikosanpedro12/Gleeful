// Paste into the browser console on https://polyhaven.com (F12 -> Console), press Enter.
// Downloads each starter model as ONE .glb (1k textures) into your Downloads folder. All CC0.
(async () => {
  const IDS = ["SchoolDesk_01","SchoolChair_01","standing_chalkboard_01","alarm_clock_01","wall_clock","wooden_bookshelf_worn","marble_bust_01","pocket_watch","vintage_grandfather_clock_01","vintage_oil_lamp","seadogs_compass","vintage_microscope","jug_01","wicker_basket_01","wooden_crate_02","wooden_bucket_01","wooden_bowl_01","food_apple_01","potted_plant_01","tree_stump_01","rock_moss_set_01","boulder_01","fir_tree_01","moon_rock_01"];
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
  for (const id of IDS) {
    try {
      const out = await pack(id);
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([out], { type: "model/gltf-binary" })); a.download = "ph_" + id + ".glb";
      document.body.appendChild(a); a.click(); a.remove(); console.log("done", id, out.length);
      await new Promise((r) => setTimeout(r, 700));
    } catch (err) { console.log("FAILED", id, String(err)); }
  }
  console.log("ALL DONE");
})();
