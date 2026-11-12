// Mutation test for the database security tests: weaken the migration in one
// way at a time and confirm the RLS suite FAILS for each. A test suite that
// still passes against a broken policy is not protecting anything.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = path.join(ROOT, "supabase/migrations/20261112051808_init_learning_schema.sql");
const OUT = path.join(ROOT, "scripts/out/mutants");
const base = fs.readFileSync(SRC, "utf8");
const LEARNER_UPDATE_POLICY = 'for update to authenticated using ((select auth.uid()) = parent_id) with check ((select auth.uid()) = parent_id);\ncreate policy "parents delete own learners"';
const LEARNER_UPDATE_GRANT = "grant update (nickname, grade, language, preferred_teacher)\n                             on table public.learners        to authenticated;";
const MUTANTS = [
  ["learners readable by everyone", 'for select to authenticated using ((select auth.uid()) = parent_id);\ncreate policy "parents add own learners"', 'for select to authenticated using (true);\ncreate policy "parents add own learners"'],
  ["sessions readable by everyone", 'for select to authenticated using ((select auth.uid()) = parent_id);\ncreate policy "parents add own sessions"', 'for select to authenticated using (true);\ncreate policy "parents add own sessions"'],
  ["attempts readable by everyone", 'for select to authenticated using ((select auth.uid()) = parent_id);\ncreate policy "parents add own attempts"', 'for select to authenticated using (true);\ncreate policy "parents add own attempts"'],
  ["attempts deletable by everyone", 'create policy "parents delete own attempts" on public.attempts\n  for delete to authenticated using ((select auth.uid()) = parent_id);', 'create policy "parents delete own attempts" on public.attempts\n  for delete to authenticated using (true);'],
  ["sessions deletable by everyone", 'create policy "parents delete own sessions" on public.lesson_sessions\n  for delete to authenticated using ((select auth.uid()) = parent_id);', 'create policy "parents delete own sessions" on public.lesson_sessions\n  for delete to authenticated using (true);'],
  ["learner update grant widened to every column", LEARNER_UPDATE_GRANT, "grant update on table public.learners to authenticated;"],
  // Defense in depth: WITH CHECK alone is shielded by the column grant, so break both.
  ["grant widened AND update WITH CHECK (true)", null, null, (b) => b.replace(LEARNER_UPDATE_GRANT, "grant update on table public.learners to authenticated;").replace(LEARNER_UPDATE_POLICY, LEARNER_UPDATE_POLICY.replace("with check ((select auth.uid()) = parent_id)", "with check (true)"))],
  ["attempts editable by clients", "grant select, insert, delete on table public.attempts        to authenticated;  -- no update: evidence is append-only", "grant all on table public.attempts to authenticated;"],
  ["RLS off on brain_usage", "alter table public.brain_usage     enable row level security;", ""],
  ["anon keeps default access", "revoke all on table public.learners, public.lesson_sessions, public.attempts, public.brain_usage from public, anon, authenticated;", "revoke all on table public.learners, public.lesson_sessions, public.attempts, public.brain_usage from public, authenticated;"],
  ["sequence keeps default grants", "revoke all on sequence public.attempts_id_seq from public, anon, authenticated;", ""],
  ["session FK not tied to learner", "    foreign key (session_id, learner_id, parent_id)\n    references public.lesson_sessions (id, learner_id, parent_id)\n    on delete set null (session_id)", "    foreign key (session_id) references public.lesson_sessions (id) on delete set null"],
  ["client can back-date evidence", "create trigger attempts_force_created_at\n  before insert on public.attempts\n  for each row execute function private.force_created_at();", ""],
  ["client can back-date a session", "create trigger lesson_sessions_force_started_at\n  before insert on public.lesson_sessions\n  for each row execute function private.force_started_at();", ""],
  ["brain_usage writable by parents", "grant select                 on table public.brain_usage     to authenticated;  -- server writes only", "grant select, insert, update on table public.brain_usage to authenticated;\ncreate policy \"oops\" on public.brain_usage for all to authenticated using (true) with check (true);"],
];
const TESTS = process.env.RLS_TESTS || "tests/db";
// Baseline: the unmutated migration must PASS, otherwise every mutant is "killed" for free.
try { execSync(`npx vitest run ${TESTS}`, { cwd: ROOT, stdio: "pipe" }); }
catch { console.log(`BASELINE FAILS: ${TESTS} is red on the real migration; mutation results would be meaningless.`); process.exit(2); }
let survived = 0;
MUTANTS.forEach(([name, from, to, fn], i) => {
  const mutated = fn ? fn(base) : base.includes(from) ? base.replace(from, to) : null;
  if (!mutated || mutated === base) { console.log(`SKIP (pattern not found): ${name}`); survived++; return; }
  const dir = path.join(OUT, String(i));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "m.sql"), mutated);
  let killed = false;
  try { execSync(`npx vitest run ${TESTS}`, { cwd: ROOT, env: { ...process.env, MIGRATIONS_DIR: dir }, stdio: "pipe" }); }
  catch { killed = true; }
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
  if (!killed) survived++;
});
console.log(survived ? `\n${survived} mutant(s) survived: the tests miss a hole.` : `\nAll ${MUTANTS.length} mutants killed.`);
process.exit(survived ? 1 : 0);
