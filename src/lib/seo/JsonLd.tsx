import { jsonLd, serialiseJsonLd } from "./site";

/**
 * schema.org data block. The ONLY allowed dangerouslySetInnerHTML in the app:
 * the content is built on the server from constants in site.ts (never from
 * user, model or network input) and `<`, `>`, `&` are escaped, so it cannot
 * close the tag. type="application/ld+json" is data and is never executed;
 * it still carries the request nonce so the strict CSP stays uniform.
 */
export function JsonLd({ nonce }: { nonce?: string }) {
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: serialiseJsonLd(jsonLd()) }} />;
}
