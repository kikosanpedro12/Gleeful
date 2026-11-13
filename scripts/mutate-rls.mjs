// Mutation test for the database security tests: weaken the migration in one
// way at a time and confirm the RLS suite FAILS for each. A test suite that
// still passes against a broken policy is not protecting anything.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIG_DIR = path.join(ROOT, "supabase/migrations");
const INIT = "20261112051808_init_learning_schema.sql";
const KINDERGARTEN = "20261113071456_learners_allow_kindergarten.sql";
const CONSENT = "20261113083000_parental_consent.sql";
const OUT = path.join(ROOT, "scripts/out/mutants");
const FILES = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const read = (f) => fs.readFileSync(path.join(MIG_DIR, f), "utf8");
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
  // Other migrations: the 5th field names the migration file to mutate.
  ["kindergarten still refused", "check (grade between 0 and 12)", "check (grade between 1 and 12)", null, KINDERGARTEN],
  ["grade range widened too far", "check (grade between 0 and 12)", "check (grade between 0 and 99)", null, KINDERGARTEN],
  ["brain_usage writable by parents", "grant select                 on table public.brain_usage     to authenticated;  -- server writes only", "grant select, insert, update on table public.brain_usage to authenticated;\ncreate policy \"oops\" on public.brain_usage for all to authenticated using (true) with check (true);"],
  // parental_consents (20261113083000): every weakening must turn tests/db/consent.test.ts red.
  ["consent readable by everyone", 'for select to authenticated using ((select auth.uid()) = parent_id);\ncreate policy "parents give own consent"', 'for select to authenticated using (true);\ncreate policy "parents give own consent"', null, CONSENT],
  ["consent insertable for anyone", 'for insert to authenticated with check ((select auth.uid()) = parent_id);\ncreate policy "parents withdraw own consent"', 'for insert to authenticated with check (true);\ncreate policy "parents withdraw own consent"', null, CONSENT],
  ["consent update grant widened to every column", "grant update (withdrawn_at) on table public.parental_consents to authenticated;  -- withdraw only", "grant update on table public.parental_consents to authenticated;", null, CONSENT],
  ["consent deletable by parents", "grant select, insert on table public.parental_consents to authenticated;", "grant select, insert, delete on table public.parental_consents to authenticated;\ncreate policy \"oops\" on public.parental_consents for delete to authenticated using (true);", null, CONSENT],
  ["RLS off on parental_consents", "alter table public.parental_consents enable row level security;", "", null, CONSENT],
  ["anon keeps default access to consent", "revoke all on table public.parental_consents from public, anon, authenticated;", "revoke all on table public.parental_consents from public, authenticated;", null, CONSENT],
  ["client can back-date agreeing", "create trigger parental_consents_force_accepted_at\n  before insert on public.parental_consents\n  for each row execute function private.force_accepted_at();", "", null, CONSENT],
  ["client can un-withdraw or re-date withdrawing", "create trigger parental_consents_guard_update\n  before update on public.parental_consents\n  for each row execute function private.guard_consent_update();", "", null, CONSENT],
  ["consent version not checked", "check (consent_text_version ~ '^[A-Za-z0-9._-]{1,32}$')", "check (true)", null, CONSENT],
  ["duplicate active consent allowed", "create unique index parental_consents_one_active_per_version\n  on public.parental_consents (parent_id, consent_text_version) where withdrawn_at is null;", "", null, CONSENT],
  ["withdrawal can precede agreeing", "constraint parental_consents_withdrawn_after_accepted check (withdrawn_at is null or withdrawn_at >= accepted_at)", "constraint parental_consents_withdrawn_after_accepted check (true)", null, CONSENT],
];
const TESTS = process.env.RLS_TESTS || "tests/db";
// Baseline: the unmutated migration must PASS, otherwise every mutant is "killed" for free.
try { execSync(`npx vitest run ${TESTS}`, { cwd: ROOT, stdio: "pipe" }); }
catch { console.log(`BASELINE FAILS: ${TESTS} is red on the real migration; mutation results would be meaningless.`); process.exit(2); }
let survived = 0;
MUTANTS.forEach(([name, from, to, fn, file = INIT], i) => {
  const base = read(file);
  const mutated = fn ? fn(base) : base.includes(from) ? base.replace(from, to) : null;
  if (!mutated || mutated === base) { console.log(`SKIP (pattern not found): ${name}`); survived++; return; }
  const dir = path.join(OUT, String(i));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // Every migration runs, in order; only the target file is mutated.
  for (const f of FILES) fs.writeFileSync(path.join(dir, f), f === file ? mutated : read(f));
  let killed = false;
  try { execSync(`npx vitest run ${TESTS}`, { cwd: ROOT, env: { ...process.env, MIGRATIONS_DIR: dir }, stdio: "pipe" }); }
  catch { killed = true; }
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
  if (!killed) survived++;
});
console.log(survived ? `\n${survived} mutant(s) survived: the tests miss a hole.` : `\nAll ${MUTANTS.length} mutants killed.`);
process.exit(survived ? 1 : 0);
