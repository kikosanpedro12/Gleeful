# Children's privacy and AI: briefing for the founder and the lawyer

Prepared 21 Nov 2026 by a research agent from public sources (list at the end, all read 21 Nov 2026). This is information, not legal advice. Web pages were read through a summarising fetch tool, so quotes should be checked against the primary text before anyone relies on them. Items marked **[UNVERIFIED]** come from general knowledge or a source I could not open; they are leads for the lawyer, not facts.

What Gleeful collects today comes from `SECURITY.md`, `docs/DATABASE.md`, `BACKLOG.md`, `PRODUCT_VISION.md` and `src/lib/voice/speech.ts`, `src/lib/brain/server/config.ts` (read 21 Nov 2026).

---

## 1. Executive summary (10 lines)

1. Gleeful is a tutor with animated characters, aimed at ages 5 to 18, so assume US regulators will treat it as **directed to children** (COPPA) and UK/EU/AU/CA regulators will treat it as a service **likely to be accessed by children**. A parent paying does not change that.
2. The amended COPPA Rule has been enforceable since **22 Apr 2026**. It covers a child's voice, persistent identifiers, written retention policy, written security program, and separate parental consent before sharing data with third parties for non-integral purposes such as AI training.
3. The biggest hole is the **anonymous landing taste**: a child can type or speak to an AI, with the audio going to Google/Apple/Microsoft, the question to Anthropic and the reply text to ElevenLabs, before any parent has consented.
4. Browser speech recognition is **not on-device by default**: MDN says audio may go to a server-based service, and the W3C TAG thread says Chrome's cloud recognition is a Google service. We cannot control or delete that audio, so we cannot rely on the COPPA audio-file exception for it.
5. **ElevenLabs** terms and privacy policy say the service is not for under-18s and it may train on content unless you opt out. Zero Retention Mode is Enterprise-only. Anthropic and Deepgram are workable (no-training / opt-out) but need the right settings.
6. The planned parent consent (a signed-in parent ticking a box) is **not by itself "verifiable parental consent"**. The trial's card step may qualify as one, but whether a card authorisation with no charge qualifies is a question for the lawyer.
7. The Philippines Data Privacy Act treats **age as sensitive personal information**. With 1,000+ learners you must register with the NPC, and profiling systems must be registered "in all instances". NPC advisories on children (Dec 2024) and AI (Dec 2024) add a child-friendly notice and a privacy impact assessment before launch.
8. Cheapest big wins: **no mic or ElevenLabs on the anonymous taste**, consent before any voice, vendor settings (opt-outs, DPAs, Pro plan), a written retention schedule with real deletion, and selling only where you have done the homework (PH, US first).
9. EU/UK/Brazil/Australia add real obligations (EU representative, DPIA, Brazil legal representative, AU code due 10 Dec 2026). Launch there later, or geo-limit checkout until a lawyer in each place has looked.
10. Anthropic's minors guidance requires age safeguards, content moderation, monitoring, public statement of legal compliance and AI disclosure, and it audits. You are mostly there on disclosure; a separate moderation layer and a public compliance statement are the gaps.

---

## 2. Risk-ranked table

Ranking is my judgement (likelihood times severity for a solo-founder launch), not a legal opinion.

| # | Risk | Law / rule | What triggers it | Cheapest mitigation | Who decides |
|---|---|---|---|---|---|
| 1 | Anonymous child talks to AI (typed or spoken) with no parental consent; text goes to Anthropic, reply text to ElevenLabs, audio to the browser vendor | COPPA (collection from a child under 13, voice = personal information); PH DPA; GDPR/UK GDPR; Brazil ECA Digital | `/` landing taste: typed 140 chars, mic, ElevenLabs voice, no sign-in | Anonymous taste = typed only, no mic, no ElevenLabs, no stored text, parent-addressed copy; or parent-led taste; mic and cloud voice only after parent sign-in plus consent. See section 6 | Lawyer (is the page child-directed?), then founder |
| 2 | Consent is not "verifiable" | COPPA (verifiable parental consent before collecting from under-13s) | `parental_consents` table is a signed-in tick box; Google sign-in proves an adult has a Google account, not that they are the child's parent | Use the paid trial card step (via Paddle) as the verification method if the lawyer agrees; otherwise add knowledge-based or text-plus or ID methods the new rule lists | Lawyer, founder |
| 3 | ElevenLabs terms: under-18 prohibition, training default, no zero retention below Enterprise | ElevenLabs ToS and privacy policy; COPPA third-party disclosure; GDPR processor terms | Tutor reply text (may paraphrase a child's question) is sent to ElevenLabs | Opt out of training in the account; strip names/PI from TTS text; or swap to a vendor with per-request opt-out (Deepgram `mip_opt_out=true`) or self-hosted voice; or buy Enterprise ZRM at scale | Founder (spend), lawyer |
| 4 | Browser speech recognition sends a child's voice to Google/Apple/Microsoft, retention unknown, no DPA with us | COPPA (voice = PI; audio-file exception needs immediate deletion); GDPR (processor/controller roles unclear) | `listenOnce` uses `SpeechRecognition`, `lang="en-US"` | Hide mic until consent; try `processLocally`; disclose by name; or move to a server STT vendor under our DPA with no retention | Founder, lawyer |
| 5 | No retention schedule, deletion or export that actually works end to end | COPPA (no indefinite retention; written policy in notice); GDPR Art. 5/17 **[UNVERIFIED article numbers]**; PH DPA (rights) | Attempts, sessions, learner profile, backups, Vercel/Supabase logs | Written retention table (section 5), cascade deletes tested, export, backup window documented | Founder |
| 6 | PH registration, DPO, child PIA missing | PH DPA; NPC Circular 2022-04; NPC Advisories 2024-03 and 2024-04 | Age is sensitive personal information; 1,000+ individuals; learner profiling | Name a DPO (the founder can be one), do a child PIA now, register before launch | Founder, PH counsel |
| 7 | No written information security program; no written assurances from vendors | COPPA amended Rule | Rule requires both | Convert `SECURITY.md` into a one-page written program, annual review date, keep the vendor DPAs on file | Founder |
| 8 | Persona + cross-session memory could look like a "companion chatbot"; learner profile could be "high-risk" education AI | California SB 243; Maine/Utah AI disclosure laws; EU AI Act Annex III (education) | Named teachers (Leo, Mia), memory, adaptive profile, minors | Keep AI disclosure, self-harm referral, no emotional-bonding hooks, no "friend" framing; legal read on SB 243 scope; AI Act date 2 Dec 2027 | Lawyer |
| 9 | Selling to EU/UK/BR/AU/CA/IN/ID before local steps | GDPR, UK Children's Code, ECA Digital, AU Children's Online Privacy Code, DPDP, GR 17/2025 | Open global checkout and open landing taste | Geo-limit checkout to PH and US (plus SG, CA, AU after review) until each is cleared | Founder |
| 10 | Child safety content gaps (no separate moderation, distress disclosures, CSAM handling) | Anthropic minors guidelines and Usage Policy; US NCMEC duty **[from Anthropic guidance, see S28]** | Open-ended chat with minors | Moderation layer, escalation script, crisis lines per country, run the 10-question real-model safety set already in the backlog | Founder |
| 11 | Privacy claims that are not true | FTC Act Section 5 (cited in S7); PH DPA | `SECURITY.md` says "never stored" while Vercel logs, Supabase logs and vendors keep data | Make the public notice match the vendor facts below word for word | Founder |
| 12 | Anthropic retention statements conflict | Contract / COPPA written assurances | Platform docs vs privacy center disagree (section 4) | Ask Anthropic for written confirmation; consider ZDR | Founder |
| 13 | App stores later | Google Play Families, Apple Kids Category **[UNVERIFIED, not read]** | Capacitor release | Read both policies before building the Android release | Founder |

---

## 3. Law by law

### 3.1 US federal: COPPA (16 CFR Part 312)

- **Dates.** Amended Rule published 22 Apr 2025, effective 23 Jun 2025, compliance date **22 Apr 2026** for most provisions (S1, S3, S4). It is now enforceable. Some safe-harbor reporting dates were earlier (S4).
- **Who is covered.** FTC FAQ B.7: foreign-based sites must comply if directed to US children or if they knowingly collect from them (S5). A Philippines operator is covered for US kids.
- **Child-directed vs mixed audience.** Mixed audience is a subset of child-directed where children are not the primary audience (FAQ D.4). Age screening is allowed only if no personal information is collected before age is asked, the screen is neutral, and you cannot block children from participating (D.4, D.6, D.7, D.8) (S5). The amended definition makes mixed audience its own category (S1). A tutor with animated characters, grade levels and child-appealing worlds is, in my reading, child-directed. Decision for the lawyer. If child-directed, you treat every user as a child.
- **Personal information.** Includes a photograph, video or audio file containing a child's image or voice (S1 fn.151), persistent identifiers that recognise a user over time (FAQ A.3) (S5), and now biometric identifiers (voiceprints, faceprints, gait) "that can be used for the automated or semi-automated recognition of an individual" (S1). Gleeful does not make voiceprints; keep it that way (do not use voice to identify or profile).
- **Persistent identifiers.** Cookies, IP addresses and device ids must be disclosed unless used only for "support for the internal operations" and nothing else is collected (FAQ C.5, I.2) (S5). Our per-address counters and the `gl_taste` cookie fit that exception, but the lawyer should confirm.
- **Audio-file exception.** If audio of a child's voice is collected only to respond to a specific request, with no other personal information, no consent or direct notice is needed, the audio must be deleted immediately after responding, and the online notice must say how audio is used and that it is deleted (S4, S2). The FAQ says the older enforcement policy does not apply if you ask by voice for things like a name (F.6) (S5). I could not read the codified text of the exception **[UNVERIFIED wording]**. It cannot cover browser speech recognition, because we cannot make Google delete the audio.
- **Verifiable parental consent methods (new).** Text message plus an extra step (confirmation text, letter or call), knowledge-based authentication with dynamic multiple-choice questions a child 12 or under could not answer, and photo ID matched to a face image with prompt deletion (S4). Older methods (signed form, card transaction, video call, government ID) exist **[UNVERIFIED: I could not open the current CFR list; check whether a card "transaction with notice to the account holder" is still listed and whether a trial with no charge counts]**.
- **Separate consent for third-party disclosure.** Parents must be able to consent to collection without consenting to disclosure to third parties, unless the disclosure is integral to the service. Disclosure to train or develop AI is not integral (S4, S3). Direct notices must name the third parties or their categories (S4).
- **Retention.** No indefinite retention; delete when no longer reasonably necessary for the purpose; the online notice must contain a written data retention policy (S4, S1 fn.338).
- **Security.** Written information security program with a designated employee, annual risk assessment, testing and annual update; written (not oral) assurances from service providers (S4, S3).
- **Safe harbor.** Programs now publish member lists and report to the FTC (S4). I could not retrieve the current approved list; start at https://www.ftc.gov/safe-harbor-program (named in S5). Joining one is optional and is something to price once there is revenue.
- **Age verification policy statement (25 Feb 2026).** The FTC will not enforce COPPA against general or mixed-audience services that collect data solely to verify age, if limited use, minimisation, deletion, third-party diligence, notice and security conditions are met. It does not help a primarily child-directed service, state attorneys general can still sue, and age checks can create "actual knowledge" (S6).
- **Politics.** COPPA 2.0 (extend to under 17) passed the Senate 5 Mar 2026 and is stalled in the House. KOSA and chatbot bills are stalled or unclear (S7). Watch, do not build for.
- **Penalties.** Civil penalties per violation; the current dollar figure is **[UNVERIFIED]**.

### 3.2 US states and other US rules

- **California Age-Appropriate Design Code.** On 12 Mar 2026 the Ninth Circuit rejected the facial challenge to the "likely to be accessed by children" coverage definition, vacated the injunction against the age-estimation provision, and kept the DPIA requirement, the data-use restrictions and the dark-pattern provision enjoined. The case returned to the district court (S8). Practical reading: high-privacy defaults, child-appropriate notices, and tools for parents and children to exercise rights are the live pieces. This changes quickly; ask the lawyer for the status on the day.
- **California SB 243 (companion chatbots).** Covers chatbots with adaptive human-like responses that can sustain a relationship across interactions. Exclusions listed in S9 do not mention educational tools. Duties when the operator knows the user is a minor: AI disclosure, a break reminder every three hours, and steps to prevent sexually explicit content; for all users, a self-harm protocol and crisis referral; private right of action (S9). Effective date **[UNVERIFIED]**. Gleeful's named teachers plus cross-session memory are the features that make a "companion" argument. Maine (disclosure, enacted) and Utah SB 452 (disclosure, enacted) are named in S9 as possible reach.
- **Other state children's/teen privacy laws and the state AG route.** **[UNVERIFIED: not researched in this pass.]** Ask the lawyer for a short list of states with minors' data amendments.
- **FERPA and state student-data laws** (relevant only if sold to schools or used under school direction). **[UNVERIFIED: not read; FTC FAQ section N on schools was beyond the retrieved text.]** Out of scope for the parent-pays launch; start this analysis before any school pilot.

### 3.3 Philippines (home market and where the operator sits)

- **Statute.** RA 10173 (S13). Section 3(l) lists **age** among sensitive personal information. Section 6 gives extraterritorial reach where there is a link to the Philippines. Section 20 requires reasonable and appropriate organisational, physical and technical security. Section 21: the controller stays responsible for data it gives to third parties for processing, at home or abroad, and must use contractual or other reasonable means for comparable protection. No data localisation rule appears in what I read. Criminal penalties in Sections 25 to 32 run from months to several years with fines from PHP 100,000 up to PHP 4,000,000 depending on the offence and whether the data is sensitive (S13).
- **Not read:** Sections 12 and 13 (lawful bases, and the conditions for processing sensitive information) and the IRR. Get these confirmed **[UNVERIFIED]**. I recall an exemption for data collected from foreign residents under their own laws and merely processed in the Philippines **[UNVERIFIED, from memory; lawyer to confirm; it matters because it may change what applies to US/EU kids]**.
- **Consent of minors.** I found no digital age of consent in the DPA. Parent/guardian involvement is addressed in the NPC advisory (below). Whether the law expects parental consent for under-18s generally is a question for PH counsel **[UNVERIFIED]**.
- **Registration and DPO (NPC Circular 2022-04).** A controller or processor must register if it has 250+ employees, processes sensitive personal information of 1,000+ individuals, or its processing is likely to pose a risk to data subjects. Systems with automated decision-making or profiling must be registered "in all instances" (Section 5). New systems register within 20 days of commencement. The DPO must be an employee unless the Commission allows otherwise. One DPO per entity (S12). Gleeful's learner profile and adaptive teaching probably count as profiling; ask PH counsel.
- **NPC Advisory 2024-03, Child-Oriented Transparency (17 Dec 2024).** Applies to all controllers and processors of children's data (under 18), including products likely to be accessed by children. Requires child-friendly privacy notices in addition to the standard one, child privacy impact assessments before launch, privacy settings defaulting to the highest level, breach notices to children and parents, and says self-declaration alone may be inadequate for high-risk processing. It prohibits deceptive design, including using characters children trust to push them to share more than necessary (S10). Directly relevant to Leo, Mia and Glee.
- **NPC Advisory 2024-04, AI (19 Dec 2024).** Applies when personal data is used to develop or deploy AI. Transparency, accountability including PIAs and privacy by design, human intervention for significant automated decisions, data subject rights, lawful basis for each use, minimisation of training data (S11). Does not address children specifically.
- **Not found:** an NPC rule specifically for voice recordings of children, or a Philippine ed-tech law. **[UNVERIFIED]** that none exists. The 72-hour breach notification rule is **[UNVERIFIED]**; not read this session.

### 3.4 EU and UK

- **GDPR Art. 8.** Where consent is the legal basis for an information society service offered directly to a child, the child must be at least 16, or the age a member state sets between 13 and 16; below that, a parent must authorise (S15). Parental consent applies only where consent is the legal basis, so if the legal basis is contract with the parent, Art. 8 does not apply (S15). Ages from a secondary source updated 15 Oct 2026 (S14): 13 BE DK EE FI LV MT PT SE (and UK); 14 AT BG CY IT LT ES; 15 CZ FR GR; 16 HR DE HU IE LU NL PL RO SK; Slovenia 16 now, 15 proposed. **Verify each country before selling there**; an older FRA page (2017/2018 vintage) was out of date and I did not use it.
- **Other GDPR points [UNVERIFIED: general knowledge, not retrieved].** A DPIA is very likely for children plus innovative technology plus profiling; an EU/UK representative is needed when targeting EU/UK residents without an establishment there; voice is not "biometric data" under Art. 9 unless used for identification, but never use it that way.
- **UK Children's Code.** 15 standards for services likely to be accessed by under-18s, including DPIA, age-appropriate notices, high-privacy defaults. The Data (Use and Access) Act 2025 s.81 amends UK GDPR Art. 25 to require "children's higher protection matters" in design (S17). ICO fined Reddit £14.47m and MediaLab (Imgur) £247,590 in Feb 2026, citing weak age assurance and no DPIA; self-declaration was called easy to bypass (S17). Where there is no reliable age information, the ICO expects the Code's standards for all users (S17).
- **EU AI Act.** The Digital Omnibus on AI is in force. Annex III high-risk obligations now apply from **2 Dec 2027** instead of 2 Aug 2026 (S16). Education is an Annex III category; **I did not read the Annex text** and cannot confirm whether a tutor that adapts teaching or evaluates learning outcomes is listed **[UNVERIFIED]**. Chatbot disclosure (Art. 50) **[UNVERIFIED dates]**; S16 only confirms a grace period to 2 Dec 2026 for Art. 50(2) synthetic-content duties. Do not infer emotions from a child's voice or face; the Act bans emotion recognition in education **[UNVERIFIED, from memory]**.
- **DSA.** Art. 28 guidelines (July 2025) apply to online platforms accessible to minors, exclude micro and small enterprises, say self-declared age is not enough, and recommend safeguards for chatbots integrated in platforms (S18). Gleeful is not a platform that hosts user content, so I expect it to be out of scope. Lawyer to confirm.

### 3.5 Other likely markets (brief)

| Market | Status (as read) | What it means for Gleeful | Source |
|---|---|---|---|
| Canada (PIPEDA) | OPC Children's Privacy Code published 20 Oct 2026 as guidance (not legislation). Under 13: parental consent except narrow cases; 13 to 17: assess understanding; opt-in for non-essential uses; AI should not encourage children to share more than needed; discourages emotional analytics (S24) | Notice, opt-in extras, best-interests test, PIA. Quebec Law 25 (minors under 14 need a parent) **[UNVERIFIED, search did not confirm]** | S24 |
| Australia | Children's Online Privacy Code: exposure draft 31 Mar 2026, must be registered by **10 Dec 2026**. Covers services likely to be accessed by children; the explanatory statement example includes school performance systems. Age ascertainment, under-15 parent consent, PIAs and a published register, small-business exemption (AUD 3m turnover) (S19, S20) | Likely in scope when you sell there unless the small-business exemption applies; revisit after the final code | S19, S20 |
| India (DPDP) | Rules notified Nov 2025; children's provisions start 18 months after publication (about mid-2027, **verify the date**). Verifiable parental consent; exemptions for educational institutions (not private apps) (S21) | Plan verifiable parental consent; check the Act for the under-18 definition and the ban on tracking/behavioural monitoring **[UNVERIFIED]** | S21 |
| Singapore | PDPC children's guidelines (Mar 2024): under 13 parental consent; 13 to 17 may consent if they understand; children's data treated as sensitive; DPIA encouraged (S25) | Parent-consent design already fits | S25 |
| Indonesia | GR 17/2025: under-18s need parental agreement for certain services; risk assessments, age verification, abuse reporting; fines and suspension possible. Deadline and foreign-provider reach not found (S23) | Do not market there until a local lawyer has read it | S23 |
| Brazil | ECA Digital (Law 15.211/2025) in force 17 Mar 2026; covers services likely to be accessed by minors, foreign providers included; reliable age verification (self-declaration prohibited); under-16 accounts linked to a guardian; privacy by default; fines up to 10% of Brazilian revenue; sanctions from Nov 2026, formal enforcement from Jan 2027; foreign providers need a Brazilian legal representative (S22) | Highest-friction market; do not open checkout there yet. LGPD specifics **[UNVERIFIED]** | S22 |

---

## 4. Vendor findings (what each says, as read 21 Nov 2026)

| Vendor | What I found | Action |
|---|---|---|
| **Chrome/Edge/Safari speech recognition** | MDN: "the browser decides where speech recognition is performed. Depending on the browser, your audio might be sent to a server-based recognition service" (S40). W3C TAG review: developers want on-device so audio is not sent to Google; Chrome's cloud recognition is a Google service and Chrome plans to phase it out over time (S41, secondary quote). `SpeechRecognition.processLocally = true` keeps audio on device but needs a one-time language pack; if missing, it fails with `service-not-allowed`; gated by the `on-device-speech-recognition` Permissions-Policy (default `self`) (S40). Safari needs Siri enabled; where audio goes was not answered (S43). Chrome's developer page only points to its privacy policy (S42). A Chromium thread found no statement of retention (S44). **Verified:** Google receives audio in Chrome's cloud mode by default. **Not verified:** retention period, Apple/Microsoft behaviour, any contract with us (none exists). | Try `processLocally` first; otherwise gate behind consent; name the vendor in the notice |
| **Anthropic (tutor)** | Commercial Terms (17 Jun 2025): "Anthropic may not train models on Customer Content"; the DPA applies (S29). Usage Policy (effective 12 Nov 2026): minor = under 18 regardless of jurisdiction; operators letting minors interact directly must follow the minors guidance; consumer chatbots must disclose AI at least at the start of each session or in the interface (S27). Minors guidance: age verification systems, content moderation and filtering, monitoring and reporting, education for minors, comply with child safety and privacy law (COPPA named) and say so publicly, disclose AI; Anthropic audits and can suspend (S26). Developer page (26 Jun 2026): you are responsible for safeguards, CSAM reporting to NCMEC for US platforms, optional Tech Coalition Pathways program (S28). **Retention conflict:** the API docs say prompts and outputs are not retained by default except for "Covered Models" that need 30 days (S30), while the privacy center says inputs and outputs are deleted within 30 days (S31); flagged chats may be kept up to 2 years (S30, S31). ZDR is per organisation via sales (S30). Our models (`claude-haiku-5-5`, `claude-sonnet-5-5`) are not in the covered list in S30, which names other models. | Get written retention confirmation; keep the AI disclosure; add moderation; publish the compliance statement; consider ZDR |
| **ElevenLabs (voice)** | ToS (updated 9 Oct 2026): "If you are under 18 ... you may not use our Services"; opt-out of training under "Data use" in account settings; content no longer used to improve Services in one clause but a licence to improve in another, so the position is unclear (S32). Privacy policy (updated 9 Oct 2026): "Our Services are not intended for, and we do not knowingly process personal information of, anyone under 18"; users must not provide voice data; US data storage; voice-derived data kept up to 3 years after last interaction; no DPA mentioned, points to a Trust Center subprocessor list (S33). Zero Retention Mode is Enterprise-only; enabled with `enable_logging=false` on text-to-speech calls (S34). | Training opt-out now; do not send child text; ask ElevenLabs sales about a DPA and ZRM; decide on cost |
| **Deepgram (TTS, lab only today)** | Terms (6 Aug 2026): customer must be 18+; no children/COPPA language; may use your content to improve services; per-request opt-out (S36). Model Improvement Partnership Program: included unless you set `mip_opt_out=true`, which also applies to text-to-speech; opted-out data is kept only as long as needed to process the request (S35). DPA/MSA not verified. | Set `mip_opt_out=true` on every call if used |
| **Supabase** | DPA version 1 dated 1 Aug 2026, part of the Terms; Supabase is a processor; EU SCCs and UK addendum; security incidents reported within 48 hours where feasible; no mention of children (S37). Project is in `ap-southeast-1` (S45). | Keep the DPA on file; add to subprocessor list |
| **Vercel** | DPA last updated 17 Mar 2026, effective 31 Mar 2026; **applies to Enterprise and Pro plans**; Vercel is processor of Customer Data; SCCs; customer is solely responsible for consents and notices; no children text (S38). | Move to Pro before launch (also in `BACKLOG.md`) so the DPA covers you |
| **Paddle** | Buyer terms: Paddle is an "authorised reseller" for suppliers; no minimum age stated in the terms I read; no child terms; refers to a separate privacy notice (S39). | The buyer is the parent, which is the right design. Lawyer to confirm Paddle's role as controller of buyer data |
| **Google sign-in** | Not researched. **[UNVERIFIED]** | Allow parents only; never offer Google sign-in to a child |

---

## 5. Design answers

**Do parents or children sign in?** Parents only, which is the right design (`docs/DATABASE.md`: children have no accounts). Add an "I am the parent or legal guardian, 18 or older" attestation at sign-up, and never let a learner profile have its own credentials.

**Collect as little as possible.** Keep: parent email (Supabase Auth), learner nickname (tell parents not to use the real name), grade band instead of birth date, language, teacher. Do not add: birth date, surname, school, photo, location, device ids, free-text profile fields, advertising ids, any analytics SDK in the lesson area. Keep voice and typed text out of the database (already true per `SECURITY.md`). Add a server-side filter that strips emails, phone numbers and addresses before text goes to Anthropic or a TTS vendor.

**Retention (proposal, for the lawyer to set).**

| Data | Keep | Delete |
|---|---|---|
| Raw voice | Not stored by us | n/a (and none to vendors we control) |
| Child typed text and model replies | Not stored by us | Vendor retention listed in notice (Anthropic up to 30 days, 2 years if flagged; ElevenLabs per account setting) |
| Attempts and sessions | While the account is active | 90 days after the account lapses or is closed, and on parent request |
| Learner profile | While the account is active | Same |
| Consent records | Life of the account plus the limitation period the lawyer sets | Then delete |
| Backups and logs | Document the window | Let them age out; say so in the notice |
| Anonymous taste counters | In memory only | Day end |

**Taste before consent: options.** This is the hot spot.

| Option | What it does | Residual risk | Effect on conversion | My view |
|---|---|---|---|---|
| A. Keep as is | Typed + mic + ElevenLabs + Claude, no gate | High: child-directed service collecting voice and text without consent; vendor chain includes an under-18-restricted voice vendor | Highest | Do not launch publicly |
| B. Text only, no mic, no ElevenLabs, no storage, parent-addressed copy | Child's typed text still goes to Anthropic; browser or bundled voice only | Medium-low. Still "collection" arguably; mitigated by no names, no storage, in-memory counters, notice at the box | Slightly lower | **Recommended default** pending the lawyer |
| C. Parent-led taste (parent ticks "I am the parent", then asks, child watches) | A tick box is not verification, but it shows intent and supports a "not knowingly collecting from children" story | Medium: relabelling does not make a child-appealing page adult-directed (the FTC looks at overall content) | Lower | Add on top of B, not instead |
| D. Pre-scripted taste (no model) | Scripted replies and bundled voice | Lowest | Lowest fidelity | Fallback if the lawyer says B is not enough |
| E. Parent sign-in and consent before any mic or cloud voice | Voice features unlock only after verified consent | Low (consent covers it; notice names Google/Apple/Microsoft or our STT vendor) | Fine: the paid trial already needs a parent | **Required for voice** |

I could not verify whether a typed question without identifiers is "personal information" under COPPA when it reaches our server, beyond FAQ A.10 saying the Rule applies even when children volunteer information and the IP address being a persistent identifier (S5). That is question 1 for the lawyer.

---

## 6. What to build into the product before first customers

Mapped to the repo as of 21 Nov 2026.

**Consent and parent gate**
- [ ] Parent sign-up: 18+ attestation, notice link, nothing collected about a child before consent. (`/sign-in`, `/parent`)
- [ ] Verifiable parental consent step. Candidate: the trial's card step via Paddle, plus a consent screen recording method, notice version, time, and the vendors listed. Lawyer to confirm the method. Extend `parental_consents` with `method`, `notice_version`, `evidence_ref`, and re-consent when the notice or a vendor changes materially. (Migration `20261113083000_parental_consent.sql` is written but not applied.)
- [ ] Direct notice to the parent at consent: what is collected, what each vendor receives, how to revoke, and that they can consent to collection without consenting to non-integral third-party disclosure.
- [ ] Separate "voice" consent switch (default off) that unlocks the mic and cloud voice.
- [ ] Parent PIN or re-sign-in gate on the parent view and on settings, so a child cannot reach consent, deletion or billing.

**Anonymous taste (`/api/taste`, landing)**
- [ ] Remove mic and ElevenLabs from the anonymous taste (option B). Keep browser or bundled voice.
- [ ] Parent-addressed copy and a visible "no names, no private details, a grown-up should type" prompt at the box.
- [ ] Keep: no storage, in-memory IP counters, signed cookie with no personal data (already built). Make the `/privacy` text match exactly.
- [ ] Run the already-planned real-model safety set (BACKLOG) before public traffic.

**Voice**
- [ ] Try `processLocally = true` and check availability first; fall back to typing, not to cloud recognition, when no consent exists.
- [ ] If cloud recognition is used after consent, notice names Google, Microsoft and Apple and states we get text only.
- [ ] Permissions-Policy: confirm `on-device-speech-recognition` is not blocked (S40) and the mic stays `self`.
- [ ] Do not store audio; do not use voice to identify or profile a child.

**Data minimisation and filters**
- [ ] Strip emails, phone numbers and addresses from child text before the model and before TTS.
- [ ] TTS gets only the sanitised tutor line; never the child's name or words.
- [ ] Grade band instead of date of birth. Nickname hint: "not your child's real name".
- [ ] No analytics or ad SDKs in the lesson. Keep CSP strict (already).

**Retention, deletion, export**
- [ ] Publish the retention table above in the notice (COPPA written policy).
- [ ] "Delete this child" and "Delete my account" in `/parent`, with tested cascade across `learners`, `lesson_sessions`, `attempts`, `brain_usage`, `parental_consents` (note: `attempts` is append-only for clients; deletion needs a defined path) and Supabase Auth.
- [ ] Export (JSON/CSV) for a parent. Document backup and log windows.

**Vendor settings (founder checklist)**
- [ ] ElevenLabs: training opt-out ("Data use" menu, S32); credit cap; ask for DPA and ZRM; stop sending anything derived from child text until resolved.
- [ ] Anthropic: confirm retention in writing; keep AI disclosure; decide on ZDR; read the minors guidance against the product; publish the compliance statement; ask if they want to be told.
- [ ] Deepgram (if used): `mip_opt_out=true` on every request.
- [ ] Vercel: Pro plan so the DPA applies; Supabase: DPA on file; add both to the notice.
- [ ] Paddle: confirm what buyer data you receive; no card data in our systems.
- [ ] Geo-limit checkout and the live taste to the launch markets.

**Safety and governance**
- [ ] Moderation layer on model output and distress/abuse escalation script with crisis lines per country (Anthropic S26, S28; SB 243 pattern S9).
- [ ] Written information security program (one page, annual review), written vendor assurances on file, incident/breach contact and process (`SECURITY.md` lists it as not started).
- [ ] Philippines: DPO named, NPC registration, child privacy impact assessment, child-friendly notice in English and Filipino, breach plan that reaches parents.
- [ ] Mascot rule: no pressure, flattery or "stay with me" hooks (NPC Advisory 2024-03, S10).
- [ ] Update `SECURITY.md` and `/privacy` so every "never stored" claim is true including vendor and platform logs.

---

## 7. Questions for the lawyer

1. Is the landing page "directed to children" (COPPA) or mixed audience? What design or copy changes would genuinely make it adult-directed, if any?
2. Does a child's typed question (no name) reaching our server, plus the IP address, count as collecting personal information? Does the internal-operations exception cover our counters?
3. Is Gleeful the "operator" for audio the browser sends to Google, Apple or Microsoft? Can we use the audio-file exception at all with browser recognition?
4. Which verifiable consent method do you accept for a paid trial: card authorisation with no charge, a small charge, knowledge-based, text-plus? Does Google sign-in help or hurt?
5. Which vendor disclosures need separate consent under the amended Rule (Anthropic, ElevenLabs, Deepgram, Supabase, Vercel, Paddle)? Are our processors "integral"? How should the direct notice name them?
6. Is ElevenLabs acceptable if we send only tutor-generated text, given its under-18 terms and no-knowing-processing statement? Do we need Enterprise and a DPA before launch?
7. Can a Philippines operator rely on any exemption for data of foreign residents? What does the DPA require for the data of US and EU children we process in the Philippines?
8. Is our learner profile "profiling" requiring NPC registration? Who should be the DPO? What goes in the child PIA?
9. Does the Philippine DPA require parental consent for under-18s, and is the NPC's 72-hour breach rule as I understand it?
10. Which EU countries' Art. 8 ages apply if a parent signs a contract (Art. 6 contract basis) rather than consent? Do we need an EU/UK representative, a DPIA, and a UK/EU notice?
11. Does the tutor fall into the EU AI Act education high-risk category from 2 Dec 2027?
12. Is Gleeful a "companion chatbot" under California SB 243, or covered by the Maine/Utah laws?
13. What is the status of the California Age-Appropriate Design Code today and do its live parts apply to us?
14. Which other US states have minors' privacy or AI-chatbot rules that reach a tutor?
15. Do we need FERPA/state student-data terms before any school pilot?
16. Are we reading Anthropic's retention terms correctly (30-day default vs not retained by default, 2 years if flagged)? Should we get ZDR in writing?
17. Is the public compliance statement Anthropic expects enough, and are we required to notify Anthropic that minors use the product?
18. Do we want a COPPA safe-harbor program at this stage?
19. Which markets should we not sell into until later (Brazil, EU members, Indonesia, Australia)? Can checkout geo-blocking be our control?
20. Review the consent wording, privacy notice, child-friendly notice and retention table.
21. Terms of service for the parent, liability caps, and what we say to parents about AI error.
22. Marketing claims (e.g. "safe", "private", "no data selling") and FTC Section 5.

---

## 8. Things I could not verify

- The codified CFR text of the consent-method list, the audio-file exception, the retention section and the security section (CFR pages were blocked by the tool; the Federal Register fetch returned footnotes).
- Safe-harbor program list, civil penalty amount, FTC FAQ section on schools.
- Whether Chrome retains speech audio and for how long; Safari and Edge server behaviour; Google/Apple/Microsoft retention terms.
- ElevenLabs and Deepgram DPAs (existence and terms); how the two ElevenLabs clauses on training reconcile.
- Anthropic's actual default retention for our models (two documents disagree).
- Philippine DPA Sections 4, 12 and 13, the IRR, DPO rules, breach-notice timing, any NPC rule on voice.
- EU AI Act Annex III wording and Art. 50 dates; GDPR article numbers other than Art. 8 and 28-type references; DPDP Act age and tracking ban; Quebec Law 25 age.
- California SB 243 effective date, other state laws, FERPA, Google Play Families and Apple Kids Category.
- Secondary sources only for: EU Art. 8 ages (S14), DPDP timeline (S21), Indonesia (S23), Brazil (S22), Australia exposure draft (S20).
- Several sources are only days or weeks old (Anthropic Usage Policy 12 Nov 2026, ElevenLabs 9 Oct 2026, OPC code 20 Oct 2026). Recheck before the lawyer meeting.

---

## 9. Sources (all read 21 Nov 2026)

- S1 FTC final rule, Federal Register 2025-05904 (partial: dates, definitions, footnotes): https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule
- S2 White & Case summary: https://www.whitecase.com/insight-alert/unpacking-ftcs-coppa-amendments-what-you-need-know
- S3 Loeb & Loeb, May 2025: https://www.loeb.com/en/insights/publications/2025/05/childrens-online-privacy-in-2025-the-amended-coppa-rule
- S4 Davis Wright Tremaine: https://www.dwt.com/blogs/privacy--security-law-blog/2025/05/coppa-rule-ftc-amended-childrens-privacy
- S5 FTC COPPA FAQ (first ~100k of ~144k characters): https://ftc.gov/tips-advice/business-center/guidance/complying-coppa-frequently-asked-questions
- S6 Cooley on the FTC age-verification policy statement: https://www.cooley.com/news/insight/2026/2026-03-02-ftc-issues-coppa-enforcement-discretion-policy-to-incentivize-use-of-age-verification-technologies
- S7 Loeb & Loeb, June 2026: https://www.loeb.com/en/insights/publications/2026/06/childrens-online-privacy-in-2026-congress-stalls-again-ftc-signals-priorities
- S8 Cooley on NetChoice v. Bonta: https://www.cooley.com/news/insight/2026/2026-03-30-netchoice-v-bonta-ninth-circuit-narrows-injunction-against-californias-ageappropriate-design-code-act
- S9 Future of Privacy Forum on SB 243: https://fpf.org/blog/understanding-the-new-wave-of-chatbot-legislation-california-sb-243-and-beyond/
- S10 NPC Advisory 2024-03 (Child-Oriented Transparency): https://privacy.gov.ph/wp-content/uploads/2024/12/Advisory-2024.12.17-Guidelines-on-Child-Oriented-Transparency-w-SGD.pdf
- S11 NPC Advisory 2024-04 (AI): https://privacy.gov.ph/wp-content/uploads/2024/12/Advisory-2024.12.19-Guidelines-on-Artificial-Intelligence-w-SGD.pdf
- S12 NPC Circular 2022-04: https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04.pdf
- S13 RA 10173 text: https://privacy.gov.ph/wp-content/uploads/2017/03/DPA-of-2012.pdf
- S14 GDPR Local, digital age of consent (secondary, updated 15 Oct 2026): https://gdprlocal.com/digital-age-of-consent-under-the-gdpr/
- S15 Bird & Bird, Children in the Digital World (EU): https://childreninthedigitalworld.twobirds.com/home/eu
- S16 Orrick on the Digital Omnibus on AI: https://www.orrick.com/en/Insights/2026/07/EU-AI-Act-Update-Digital-Omnibus-Finalizes-8-Compliance-Changes
- S17 DLA Piper on UK children's regulation: https://privacymatters.dlapiper.com/2026/06/uk-protecting-children-online-a-changing-regulatory-landscape/
- S18 Taylor Wessing on DSA minors guidelines: https://www.taylorwessing.com/en/insights-and-events/insights/2025/07/rd-european-commission-guidelines-on-protection-of-minors-under-the-digital-services-act
- S19 OAIC Children's Online Privacy Code page: https://www.oaic.gov.au/privacy/privacy-registers/privacy-codes/childrens-online-privacy-code
- S20 Baker McKenzie on the Australian exposure draft: https://www.bakermckenzie.com/en/insight/publications/2026/05/australia-childrens-online-privacy-code-exposure-draft
- S21 Baker Botts on India DPDP Rules: https://ourtake.bakerbotts.com/post/102lund/india-notifies-final-rules-for-digital-data-protection-act
- S22 Mayer Brown on Brazil ECA Digital: https://www.mayerbrown.com/en/insights/publications/2026/04/enforcement-of-brazils-eca-digital-introduces-new-obligations-for-companies
- S23 DFDL on Indonesia GR 17/2025: https://www.dfdl.com/insights/legal-and-tax-updates/indonesia-new-regulation-sets-ground-rules-for-child-safety-in-online-platforms-pp-no-17-2025/
- S24 OPC Canada Children's Privacy Code: https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/protection-of-children-for-businesses/childrens-privacy-code/children-code-final-report-2026/
- S25 Norton Rose Fulbright on Singapore PDPC guidelines: https://www.nortonrosefulbright.com/en/knowledge/publications/9a61f19c/the-protection-of-childrens-personal-data-in-the-digital-environment
- S26 Anthropic, guidelines for organisations serving minors: https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors
- S27 Anthropic Usage Policy (effective 12 Nov 2026): https://www.anthropic.com/legal/aup
- S28 Anthropic, child safety guidance for developers (26 Jun 2026): https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers
- S29 Anthropic Commercial Terms: https://www.anthropic.com/legal/commercial-terms
- S30 Anthropic API and data retention: https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention
- S31 Anthropic privacy center, organisation data retention: https://privacy.claude.com/en/articles/7996866-how-long-does-anthropic-store-my-organizations-data
- S32 ElevenLabs Terms of Service (updated 9 Oct 2026): https://elevenlabs.io/terms-of-use
- S33 ElevenLabs Privacy Policy (updated 9 Oct 2026): https://elevenlabs.io/privacy-policy
- S34 ElevenLabs Zero Retention Mode: https://elevenlabs.io/docs/developers/resources/zero-retention-mode
- S35 Deepgram Model Improvement Partnership Program: https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program
- S36 Deepgram Terms (6 Aug 2026): https://deepgram.com/terms
- S37 Supabase DPA: https://supabase.com/legal/customer-resources/data-processing-addendum
- S38 Vercel DPA: https://vercel.com/legal/dpa.md
- S39 Paddle Buyer Terms: https://www.paddle.com/legal/buyer-terms
- S40 MDN, Using the Web Speech API: https://developer.mozilla.org/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API
- S41 W3C TAG review 1038, on-device Web Speech API: https://tag-github-bot.w3.org/gh/w3ctag/design-reviews/1038
- S42 Chrome for Developers, Web Speech API: https://developer.chrome.com/blog/voice-driven-web-apps-introduction-to-the-web-speech-api
- S43 Apple Developer Forums, Safari Web Speech: https://developer.apple.com/forums/thread/690575
- S44 Chromium html5 group thread: https://groups.google.com/a/chromium.org/g/chromium-html5/c/EJl8kE52MyI
- S45 Internal: `CLAUDE.md`, `PRODUCT_VISION.md`, `SECURITY.md`, `docs/DATABASE.md`, `BACKLOG.md`, `src/lib/voice/speech.ts`, `src/lib/brain/server/config.ts`

Blocked or unreadable: Cornell LII and eCFR pages for 16 CFR 312 (access not granted / robots), Official Gazette and privacy.gov.ph DPA page (fetch failed), Google Play Families page (redirect not followed).
