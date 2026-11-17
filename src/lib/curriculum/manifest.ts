/** What has and has not been pulled in yet. Honest status, shown in the founder report. */
export interface SourceStatus { id: string; label: string; url: string; status: "in" | "partial" | "pending"; note: string }

export const SOURCES: readonly SourceStatus[] = [
  { id: "ccss-math", label: "Common Core Math K–12", url: "https://www.thecorestandards.org/Math/", status: "partial", note: "From open npm package; ~524 lines, fewer than the full standard. Check completeness." },
  { id: "ccss-ela", label: "Common Core ELA K–12", url: "https://www.thecorestandards.org/ELA-Literacy/", status: "in", note: "~1,056 lines from open npm package." },
  { id: "ngss", label: "NGSS Science K–12", url: "https://www.nextgenscience.org/", status: "partial", note: "Topic level K–5 and HS; performance expectations for middle school only." },
  { id: "c3", label: "C3 Framework social studies", url: "https://www.socialstudies.org/standards/c3", status: "pending", note: "Not pulled yet." },
  { id: "deped-math", label: "DepEd MATATAG Math G1, 4, 7", url: "https://www.deped.gov.ph/wp-content/uploads/MATATAG-Mathematics-CG-Grades1-4-and-7.pdf", status: "partial", note: "Whole guide read, but summaries are unverified by a person." },
  { id: "deped-ap", label: "DepEd MATATAG Araling Panlipunan G4, 7", url: "https://www.deped.gov.ph/wp-content/uploads/ARALING-PANLIPUNAN-GRADES-4-7.pdf", status: "partial", note: "Whole guide read, but summaries are unverified by a person." },
  { id: "deped-english", label: "DepEd MATATAG English G4, 7", url: "https://www.deped.gov.ph/wp-content/uploads/MATATAG-ENGLISH-CG-G4-and-7.pdf", status: "partial", note: "Grade 4 done; Grade 7 first three quarters summarised, rest pending." },
  { id: "deped-gmrc", label: "DepEd MATATAG GMRC/VE G1, 4, 7", url: "https://www.deped.gov.ph/wp-content/uploads/MATATAG-GMRC-and-VE-Grades-1-4-and-7.pdf", status: "partial", note: "Grade 1 and Grade 4 Q1–Q3 done; Grade 4 Q4 and Grade 7 pending." },
  { id: "deped-science", label: "DepEd MATATAG Science G4, 7", url: "https://www.deped.gov.ph/wp-content/uploads/MATATAG-Science-CG-Grade-4-and-7.pdf", status: "pending", note: "Download failed twice; retry or add by hand." },
  { id: "deped-filipino", label: "DepEd MATATAG Filipino G4, 7", url: "https://www.deped.gov.ph/wp-content/uploads/MATATAG-FILIPINO-CG-Grades-4-at-7-.pdf", status: "pending", note: "Download failed." },
  { id: "deped-k1", label: "DepEd Kindergarten, Language, Reading and Literacy, Makabansa G1", url: "https://www.deped.gov.ph/matatagcurriculumk147/", status: "pending", note: "Official PDFs found, not read yet." },
  { id: "deped-mapeh-epp", label: "DepEd Music & Arts, PE & Health, EPP/TLE", url: "https://www.deped.gov.ph/matatagcurriculumk147/", status: "pending", note: "Not read yet." },
  { id: "deped-other-grades", label: "DepEd MATATAG G2, 3, 5, 6, 8, 9, 10 and Senior High core", url: "https://www.deped.gov.ph/revised-k-to-10-curriculum/", status: "pending", note: "Only K, 1, 4, 7 guides are on the public Phase 1 page; the full K–10 set is on a separate DepEd link." },
];
