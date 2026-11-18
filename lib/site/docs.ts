/** The docs pages, in reading order. Sidebar, search, cards and prev/next all read this. */
export const DOC_PAGES = [
  { slug: "quickstart", title: "Quickstart", blurb: "Sign up, subscribe, press Play and talk." },
  { slug: "obs", title: "OBS setup", blurb: "Put chat on your stream as a browser source." },
  { slug: "regulars", title: "Regulars", blurb: "The people who keep coming back, and how to edit them." },
  { slug: "emotes", title: "Emotes", blurb: "Import your 7TV emotes and choose what they mean." },
  { slug: "screen-watching", title: "Screen watching", blurb: "Let chat react to what's on your screen." },
  { slug: "run-locally", title: "Run it locally", blurb: "Run it on your own computer with your own key." },
] as const;

export type DocPage = (typeof DOC_PAGES)[number];

/** The pages either side of `slug`, for the links at the bottom of a page. */
export function neighbours(slug: string): { prev: DocPage | null; next: DocPage | null } {
  const i = DOC_PAGES.findIndex((p) => p.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return { prev: DOC_PAGES[i - 1] ?? null, next: DOC_PAGES[i + 1] ?? null };
}
