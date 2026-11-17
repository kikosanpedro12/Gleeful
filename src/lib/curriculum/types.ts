export type Framework = "ccss-math" | "ccss-ela" | "ngss" | "deped-matatag";

/** One learning standard / competency. Data only; never code or URLs a model can follow. */
export interface Standard {
  id: string;
  fw: Framework;
  subject: string; // math | english | science | ap | gmrc ...
  grade: string; // K, 1..12 or a band like "9-10", "6-7-8"
  domain: string;
  cluster?: string;
  code: string;
  text: string;
  src: string; // official page for this standard or its guide
  quarter?: string;
}

export const FRAMEWORKS: readonly Framework[] = ["ccss-math", "ccss-ela", "ngss", "deped-matatag"];
