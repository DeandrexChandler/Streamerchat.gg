/** External links on the public site. */
export const LINKS = {
  /** The repo is private, so GitHub shows as "Soon". Set the URL here if it goes public. */
  github: null as string | null,
};

export const NAV_LINKS = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Creators", href: "/creators" },
  { label: "Docs", href: "/docs" },
];

/**
 * Where every call to action points. Signed in, /signup goes straight on to
 * the simulator; running locally it shows a button to it.
 */
export const CTA_HREF = "/signup";
