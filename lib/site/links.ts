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
 * The site's main call to action. There's no free tier, so it goes to
 * pricing rather than into a simulator that stays silent without a plan.
 */
export const CTA_HREF = "/pricing";
export const CTA_LABEL = "See pricing";
