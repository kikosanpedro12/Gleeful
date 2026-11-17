// Builds src/lib/curriculum/data/*.json from the open standards packages.
// Usage: node scripts/build-curriculum.mjs <dir with weo-standards/ and ngss-mcp/>
// Sources: Common Core (NGA/CCSSO public license: attribution, not endorsed), NGSS (CC BY 4.0, NGSS Lead States). See ASSET_LICENSES.md.
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) throw new Error("usage: build-curriculum.mjs <dir>");
const W = path.join(root, "weo-edu-standards-0.1.6/package/subjects");
const N = path.join(root, "ngss-mcp-1.2.2/package/data/ngss-ms-standards.json");
const out = path.resolve("src/lib/curriculum/data");
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const gradeOf = (file) => {
  const m = path.basename(file, ".json").replace("grades-", "").replace("grade-", "");
  return m.toUpperCase(); // K, 1..8, 9-10, 11-12, 9-10-11-12, 6-7-8
};
const clean = (s) => String(s).replace(/<sup>(.*?)<\/sup>/g, "^($1)").replace(/<sub>(.*?)<\/sub>/g, "_($1)").replace(/<\/?[a-z][^>]*>/gi, "").replace(/\s+/g, " ").trim();

function fromCcss(dir, fw, subject, srcFor) {
  const rows = [];
  for (const f of fs.readdirSync(path.join(W, dir)).filter((x) => x.endsWith(".json"))) {
    const grade = gradeOf(f);
    const d = read(path.join(W, dir, f));
    for (const [domain, list] of Object.entries(d)) {
      for (const s of list) {
        rows.push({
          id: `${fw}:${s.displayName}`,
          fw, subject, grade,
          domain: clean(s.meta?.[s.meta.length - 1] ?? domain),
          cluster: s.meta?.length > 1 ? clean(s.meta[0]) : undefined,
          code: s.displayName,
          text: clean(s.content),
          src: srcFor(grade),
        });
      }
    }
  }
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.id) ? false : seen.add(r.id)));
}

const ccssMath = fromCcss("mathematics", "ccss-math", "math",
  (g) => `https://www.thecorestandards.org/Math/Content/${/^\d$/.test(g) ? g : g === "K" ? "K" : "HSN"}/`);
const ccssEla = fromCcss("english-language-arts-and-literacy", "ccss-ela", "english",
  () => "https://www.thecorestandards.org/ELA-Literacy/");

// NGSS: topic level from the package (K-5, MS, HS), plus MS performance expectations.
const ngss = [];
for (const f of fs.readdirSync(path.join(W, "science")).filter((x) => /^grade/.test(x))) {
  const grade = gradeOf(f);
  const d = read(path.join(W, "science", f));
  for (const list of Object.values(d)) for (const s of list) {
    ngss.push({ id: `ngss:${s.displayName}`, fw: "ngss", subject: "science", grade,
      domain: clean(s.displayName.replace(/^[\w-]*?(PS|LS|ESS|ETS)/, "$1").split("-")[0] ?? ""),
      code: s.displayName, text: clean(s.content), src: "https://www.nextgenscience.org/topic-arrangement/" });
  }
}
for (const s of read(N).standards) {
  ngss.push({ id: `ngss:${s.code}`, fw: "ngss", subject: "science", grade: "6-7-8",
    domain: clean(s.domain), cluster: clean(s.topic), code: s.code,
    text: clean(s.performance_expectation),
    src: `https://www.nextgenscience.org/pe/${s.code.toLowerCase()}` });
}
const fixPe = (r) => (/^MS-\w+-\d+$/.test(r.code) ? { ...r, src: `https://www.nextgenscience.org/pe/${r.code.toLowerCase()}` } : r);
const uniq = (rows) => { const seen = new Set(); return rows.filter((r) => (seen.has(r.id) ? false : seen.add(r.id))); };

for (const [name, rows] of Object.entries({ "ccss-math": ccssMath, "ccss-ela": ccssEla, ngss: uniq(ngss).map(fixPe) })) {
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(rows));
  console.log(name, rows.length);
}

// DepEd MATATAG: parse the hand-saved text files in data/deped/*.txt (see header lines in each file).
const deped = [];
const dir = path.join(out, "deped");
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt")).sort()) {
  const area = path.basename(f, ".txt");
  const lines = fs.readFileSync(path.join(dir, f), "utf8").split("\n");
  const srcLine = lines.find((l) => /Source:\s*https?:\/\//.test(l)) ?? "";
  const src = srcLine.match(/https?:\/\/\S+/)?.[0] ?? "https://www.deped.gov.ph/matatagcurriculumk147/";
  let grade = "", quarter = "", n = 0;
  for (const l of lines) {
    if (!l.trim() || l.startsWith("#") && !l.startsWith("##")) continue;
    if (l.startsWith("## ")) { [grade, quarter] = l.slice(3).trim().split("|"); continue; }
    const [topic, ...rest] = l.split("|");
    const text = clean(rest.join("|"));
    if (!grade || !topic || !text) throw new Error(`bad line in ${f}: ${l}`);
    deped.push({ id: `deped:${area}:${grade}:${quarter}:${++n}`, fw: "deped-matatag", subject: area, grade,
      domain: clean(topic), code: `${area}-G${grade}-Q${quarter}-${n}`, text, src, quarter });
  }
}
fs.writeFileSync(path.join(out, "deped-matatag.json"), JSON.stringify(deped));
console.log("deped-matatag", deped.length);
