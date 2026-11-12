// Mutation test for the database security tests: weaken the migration in one
// way at a time and confirm the RLS suite FAILS for each. A test suite that
// still passes against a broken policy is not protecting anything.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const SRC = path.join(ROOT, "supabase/migrations/20261112051808_init_learning_schema.sql");
const OUT = path.join(ROOT, "scripts/out/mutants");
const base = fs.readFileSync(SRC, "utf8");
const MUTANTS = [
  ["learners readable by everyone", "for select to authenticated using ((select auth.uid()) = parent_id);\ncreate policy \"parents add own learners\"", "for select to authenticated using (true);\ncreate policy \"parents add own learners\""],
  // (Dropping WITH CHECK entirely is NOT a hole: Postgres then reuses USING for the new row.)
  ["update WITH CHECK (true)", "for update to authenticated using ((select auth.uid()) = parent_id) with check ((select auth.uid()) = parent_id);\ncreate policy \"parents delete own learners\"", "for update to authenticated using ((select auth.uid()) = parent_id) with check (true);\ncreate policy \"parents delete own learners\""],
  ["attempts editable by clients", "grant select, insert, delete         on table public.attempts        to authenticated;", "grant all on table public.attempts to authenticated;"],
  ["RLS off on brain_usage", "alter table public.brain_usage     enable row level security;", ""],
  ["anon keeps default access", "revoke all on table public.learners, public.lesson_sessions, public.attempts, public.brain_usage from public, anon, authenticated;", "revoke all on table public.learners, public.lesson_sessions, public.attempts, public.brain_usage from public, authenticated;"],
  ["session FK not tied to learner", "    foreign key (session_id, learner_id, parent_id)\n    references public.lesson_sessions (id, learner_id, parent_id)\n    on delete set null (session_id)", "    foreign key (session_id) references public.lesson_sessions (id) on delete set null"],
  ["client can back-date evidence", "create trigger attempts_force_created_at\n  before insert on public.attempts\n  for each row execute function private.force_created_at();", ""],
  ["brain_usage writable by parents", "grant select                         on table public.brain_usage     to authenticated;", "grant select, insert, update on table public.brain_usage to authenticated;\ncreate policy \"oops\" on public.brain_usage for all to authenticated using (true) with check (true);"],
];
let survived = 0;
MUTANTS.forEach(([name, from, to], i) => {
  if (!base.includes(from)) { console.log(`SKIP (pattern not found): ${name}`); survived++; return; }
  const dir = path.join(OUT, String(i));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "m.sql"), base.replace(from, to));
  let killed = false;
  try { execSync("npx vitest run tests/db", { cwd: ROOT, env: { ...process.env, MIGRATIONS_DIR: dir }, stdio: "pipe" }); }
  catch { killed = true; }
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
  if (!killed) survived++;
});
console.log(survived ? `\n${survived} mutant(s) survived: the tests miss a hole.` : `\nAll ${MUTANTS.length} mutants killed.`);
process.exit(survived ? 1 : 0);
