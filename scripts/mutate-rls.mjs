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
const INTERESTS = "20261123064826_learner_interests_name_say.sql";
const BILLING = "20261123120000_billing.sql";
const BSTATS = "20261123150000_billing_stats_feedback.sql";
const APPEV = "20261123210909_app_events.sql";
const CAP = "cap"; // not a migration: src/lib/events/cap.ts
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
  // learner interests + name_say (20261123064826): every weakening must turn tests/db/interests.test.ts red.
  ["interests: more than 5 allowed", "and cardinality(interests) <= 5", "and cardinality(interests) <= 6", null, INTERESTS],
  ["interests: any text allowed", null, null, (b) => b.replace(/  and interests <@ array\[[\s\S]*?\]::text\[\]\n/, ""), INTERESTS],
  ["interests: duplicates allowed", "  and (interests[1] is null or not (interests[1] = any (interests[2:5])))\n  and (interests[2] is null or not (interests[2] = any (interests[3:5])))\n  and (interests[3] is null or not (interests[3] = any (interests[4:5])))\n  and (interests[4] is null or interests[4] is distinct from interests[5])\n", "", null, INTERESTS],
  ["interests: last pair may repeat", "and (interests[4] is null or interests[4] is distinct from interests[5])", "and true", null, INTERESTS],
  ["interests: custom array bounds allowed", "  and (array_lower(interests, 1) is null or array_lower(interests, 1) = 1)\n", "", null, INTERESTS],
  ["interests: multi-dimensional arrays allowed", "(array_ndims(interests) is null or array_ndims(interests) = 1)", "true", null, INTERESTS],
  ["name_say: any characters allowed", "name_say ~ '^[A-Za-z][A-Za-z '' -]*$'", "true", null, INTERESTS],
  ["name_say: no length cap", "char_length(name_say) between 1 and 40", "char_length(name_say) >= 1", null, INTERESTS],
  ["new columns not updatable by the parent", "grant update (interests, name_say) on table public.learners to authenticated;", "", null, INTERESTS],
  ["update grant widened to every column (new migration)", "grant update (interests, name_say) on table public.learners to authenticated;", "grant update on table public.learners to authenticated;", null, INTERESTS],
  // billing (20261123120000): every weakening must turn tests/db/billing.test.ts red.
  ["billing: subscriptions RLS off", "alter table public.subscriptions  enable row level security;", "", null, BILLING],
  ["billing: usage RLS off", "alter table public.billing_usage  enable row level security;", "", null, BILLING],
  ["billing: anon keeps default access", "revoke all on table public.subscriptions, public.billing_events, public.billing_usage from public, anon, authenticated;", "revoke all on table public.subscriptions, public.billing_events, public.billing_usage from public;", null, BILLING],
  ["billing: authenticated keeps default access", "revoke all on table public.subscriptions, public.billing_events, public.billing_usage from public, anon, authenticated;", "revoke all on table public.subscriptions, public.billing_events, public.billing_usage from public, anon;", null, BILLING],
  ["billing: parents may read subscriptions", "revoke all on table public.subscriptions, public.billing_events, public.billing_usage from public, anon, authenticated;", "revoke all on table public.subscriptions, public.billing_events, public.billing_usage from public, anon, authenticated;\ngrant select on public.subscriptions to authenticated;\ncreate policy \"oops\" on public.subscriptions for select to authenticated using (true);", null, BILLING],
  ["billing: writer may re-key subscriptions", "grant update (plan, status, period_end, freemius_user_id, freemius_subscription_id, last_event_at, updated_at) on table public.subscriptions to billing_writer;", "grant update on table public.subscriptions to billing_writer;", null, BILLING],
  ["billing: writer may delete subscriptions", "grant select, insert on table public.subscriptions to billing_writer;", "grant select, insert, delete on table public.subscriptions to billing_writer;\ncreate policy \"oops\" on public.subscriptions for delete to billing_writer using (true);", null, BILLING],
  ["billing: writer may rewrite events", "grant select, insert on table public.billing_events to billing_writer;", "grant select, insert, update, delete on table public.billing_events to billing_writer;\ncreate policy \"oops\" on public.billing_events for all to billing_writer using (true) with check (true);", null, BILLING],
  ["billing: writer may edit usage period", "grant update (turns) on table public.billing_usage to billing_writer;", "grant update on table public.billing_usage to billing_writer;", null, BILLING],
  ["billing: writer may delete usage", "grant select, insert on table public.billing_usage to billing_writer;", "grant select, insert, delete on table public.billing_usage to billing_writer;\ncreate policy \"oops\" on public.billing_usage for delete to billing_writer using (true);", null, BILLING],
  ["billing: writer bypasses RLS and sees everything", "create role billing_writer nologin noinherit nobypassrls;", "create role billing_writer nologin noinherit bypassrls superuser;", null, BILLING],
  ["billing: events RLS off", "alter table public.billing_events enable row level security;", "", null, BILLING],
  // feedback + billing stats (20261123150000)
  ["feedback: RLS off", "alter table public.feedback enable row level security;", "", null, BSTATS],
  ["feedback: anon keeps default access", "revoke all on table public.feedback from public, anon, authenticated;", "revoke all on table public.feedback from public;", null, BSTATS],
  ["feedback: parents may read everyone's messages", "revoke all on table public.feedback from public, anon, authenticated;", "revoke all on table public.feedback from public, anon;", null, BSTATS],
  ["feedback: writer may edit and delete messages", "grant select, insert on table public.feedback to billing_writer;", "grant select, insert, update, delete on table public.feedback to billing_writer;\ncreate policy \"oops\" on public.feedback for all to billing_writer using (true) with check (true);", null, BSTATS],
  ["feedback: unlimited message size", "check (length(btrim(message)) between 1 and 2000)", "check (true)", null, BSTATS],
  ["feedback: any e-mail text", "contact_email text check (contact_email is null or (length(contact_email) between 3 and 254 and contact_email ~ '^[^@[:space:],;<>\"]+@[^@[:space:],;<>\"]+\\.[^@[:space:],;<>\"]+$'))", "contact_email text", null, BSTATS],
  ["feedback: any page text", "page          text check (page is null or page ~ '^/[a-z0-9/_-]{0,58}$')", "page          text", null, BSTATS],
  ["billing events: any status", "add column status      text check (status is null or status in ('trialing', 'active', 'past_due', 'canceled', 'refunded')),", "add column status      text,", null, BSTATS],
  // product events (20261123210909): every weakening must turn tests/db/appEvents.test.ts red.
  ["events: RLS off", "alter table public.app_events enable row level security;", "", null, APPEV],
  ["events: anon keeps default access", "revoke all on table public.app_events from public, anon, authenticated;", "revoke all on table public.app_events from public;", null, APPEV],
  ["events: authenticated keeps default access", "revoke all on table public.app_events from public, anon, authenticated;", "revoke all on table public.app_events from public, anon;", null, APPEV],
  ["events: parents may read everyone's events", "revoke all on table public.app_events from public, anon, authenticated;", "revoke all on table public.app_events from public, anon, authenticated;\ngrant select on public.app_events to authenticated;\ncreate policy \"oops\" on public.app_events for select to authenticated using (true);", null, APPEV],
  ["events: writer may edit and delete events", "grant select, insert on table public.app_events to billing_writer;", "grant select, insert, update, delete, truncate on table public.app_events to billing_writer;\ncreate policy \"oops\" on public.app_events for all to billing_writer using (true) with check (true);", null, APPEV],
  ["events: checkout clicks can repeat in a day", "create unique index app_events_checkout_once_a_day on public.app_events (parent_id, day) where code = 'checkout_clicked';", "", null, APPEV],
  ["events: API roles keep the id sequence", "revoke all on sequence public.app_events_id_seq from public, anon, authenticated;", "", null, APPEV],
  ["events: any code", "check (code in ('signup', 'consent_given', 'learner_added', 'active_day', 'checkout_clicked', 'brain_error', 'brain_fallback', 'voice_error')),", "check (true),", null, APPEV],
  ["events: error codes may carry a parent id", "check ((code in ('brain_error', 'brain_fallback', 'voice_error') and parent_id is null)\n      or (code not in ('brain_error', 'brain_fallback', 'voice_error') and parent_id is not null))", "check (true)", null, APPEV],
  ["events: parent events may lack a parent id", "or (code not in ('brain_error', 'brain_fallback', 'voice_error') and parent_id is not null))", "or (code not in ('brain_error', 'brain_fallback', 'voice_error')))", null, APPEV],
  ["events: utm_source any text", "utm_source   text check (utm_source   is null or utm_source   ~ '^[a-z0-9_.-]{1,40}$'),", "utm_source   text,", null, APPEV],
  ["events: utm_medium any text", "utm_medium   text check (utm_medium   is null or utm_medium   ~ '^[a-z0-9_.-]{1,40}$'),", "utm_medium   text,", null, APPEV],
  ["events: utm_campaign any text", "utm_campaign text check (utm_campaign is null or utm_campaign ~ '^[a-z0-9_.-]{1,40}$'),", "utm_campaign text,", null, APPEV],
  ["events: referrer any text", "referrer_host text check (referrer_host is null or (length(referrer_host) between 3 and 100 and referrer_host ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$')),", "referrer_host text,", null, APPEV],
  ["events: signup and consent can repeat", "create unique index app_events_once_per_parent on public.app_events (code, parent_id) where code in ('signup', 'consent_given');", "", null, APPEV],
  ["events: active day can repeat", "create unique index app_events_active_day_once on public.app_events (parent_id, day) where code = 'active_day';", "", null, APPEV],
  ["events: the app can choose the day", "day          date generated always as ((created_at at time zone 'Asia/Manila')::date) stored,", "day          date not null default current_date,", null, APPEV],
  ["events: a SECURITY DEFINER function appears", null, null, (b) => b + "\ncreate function public.leak_events() returns bigint language sql security definer as 'select count(*) from public.app_events';\n", APPEV],
  ["events: a trigger appears on the table", null, null, (b) => b + "\ncreate function public.noop_ev() returns trigger language plpgsql as $$ begin return new; end $$;\ncreate trigger noop_ev before insert on public.app_events for each row execute function public.noop_ev();\n", APPEV],
  // the INSERT's own caps (src/lib/events/cap.ts, swapped in through a vitest alias): every weakening must turn tests/db red.
  ["cap: no per-code hourly cap", null, null, (b) => b.replace(/  and \(select count\(\*\) from public\.app_events where code = \$1::text and created_at[^\n]*\n/, ""), CAP],
  ["cap: one shared hourly bucket for all codes", "where code = $1::text and created_at > now()", "where created_at > now()", null, CAP],
  ["cap: no lifetime cap", "  and (select count(*) from public.app_events) < ${Math.floor(lifetime)}\n", "", null, CAP],
  ["cap: lifetime cap by max(id)", "(select count(*) from public.app_events) < ${Math.floor(lifetime)}", "(select coalesce(max(id), 0) from public.app_events) < ${Math.floor(lifetime)}", null, CAP],
  ["cap: repeats are not looked for before inserting", null, null, (b) => b.replace(/where not exists \(select 1 from public\.app_events e[\s\S]*?'Asia\/Manila'\)::date\)\)\)\n  and/, "where true\n  and"), CAP],
  ["cap: checkout cap huge", "checkout_clicked: 200,", "checkout_clicked: 200000,", null, CAP],
  ["cap: signup cap huge", "signup: 500,", "signup: 500000,", null, CAP],
  ["cap: error cap huge", "brain_error: 2000,", "brain_error: 2000000,", null, CAP],
  ["billing: any plan allowed", "check (plan in ('solo', 'family'))", "check (true)", null, BILLING],
  ["billing: any status allowed", "check (status in ('trialing', 'active', 'past_due', 'canceled', 'refunded'))", "check (true)", null, BILLING],
  ["billing: e-mail key not normalised", "check (email_norm = lower(email_norm) and length(email_norm) between 3 and 254 and email_norm ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')", "check (true)", null, BILLING],
  ["billing: events can repeat", "event_id    text primary key check", "event_id    text check", null, BILLING],
  ["billing: negative usage allowed", "check (turns >= 0)", "check (true)", null, BILLING],
  ["billing: event id unbounded", "check (length(event_id) between 1 and 80)", "check (true)", null, BILLING],
];
const TESTS = process.env.RLS_TESTS || "tests/db";
// Baseline: the unmutated migration must PASS, otherwise every mutant is "killed" for free.
if (!process.env.MUTATE_DRY) try { execSync(`npx vitest run ${TESTS}`, { cwd: ROOT, stdio: "pipe" }); }
catch { console.log(`BASELINE FAILS: ${TESTS} is red on the real migration; mutation results would be meaningless.`); process.exit(2); }
let survived = 0;
MUTANTS.forEach(([name, from, to, fn, file = INIT], i) => {
  const isCap = file === CAP;
  const base = isCap ? fs.readFileSync(path.join(ROOT, "src/lib/events/cap.ts"), "utf8") : read(file);
  const mutated = fn ? fn(base) : base.includes(from) ? base.replace(from, to) : null;
  if (!mutated || mutated === base) { console.log(`SKIP (pattern not found): ${name}`); survived++; return; }
  if (process.env.MUTATE_DRY) return; // pattern check only
  const dir = path.join(OUT, String(i));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // Every migration runs, in order; only the target file is mutated.
  for (const f of FILES) fs.writeFileSync(path.join(dir, f), f === file ? mutated : read(f));
  let cfg = "";
  if (isCap) {
    // The mutated cap.ts replaces the real one through a vitest alias (production code gets no test switch).
    fs.writeFileSync(path.join(dir, "cap.ts"), mutated.replace('from "./codes"', 'from "@/lib/events/codes"'));
    fs.writeFileSync(path.join(dir, "vitest.config.mjs"), `export default { test: { include: ["tests/**/*.test.ts"], environment: "node", root: ${JSON.stringify(ROOT)} }, resolve: { alias: [{ find: /^@\\/lib\\/events\\/cap$/, replacement: ${JSON.stringify(path.join(dir, "cap.ts"))} }, { find: "@", replacement: ${JSON.stringify(path.join(ROOT, "src"))} }, { find: "server-only", replacement: ${JSON.stringify(path.join(ROOT, "tests/stubs/server-only.ts"))} }] } };\n`);
    cfg = ` --config ${path.join(dir, "vitest.config.mjs")}`;
  }
  let killed = false;
  try { execSync(`npx vitest run ${TESTS}${cfg}`, { cwd: ROOT, env: { ...process.env, MIGRATIONS_DIR: dir }, stdio: "pipe" }); }
  catch { killed = true; }
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
  if (!killed) survived++;
});
console.log(survived ? `\n${survived} mutant(s) survived: the tests miss a hole.` : `\nAll ${MUTANTS.length} mutants killed.`);
process.exit(survived ? 1 : 0);
