/** External links on the public site. `null` hides the link. */
export const LINKS = {
  /** The repo is private. Set the URL here if it goes public. */
  github: null as string | null,
};

export type NavLink = { label: string; href: string; external?: boolean };

export function navLinks(github: string | null = LINKS.github): NavLink[] {
  const links: NavLink[] = [
    { label: "Home", href: "/" },
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Creators", href: "/creators" },
    { label: "Docs", href: "/docs" },
  ];
  if (github) links.push({ label: "GitHub", href: github, external: true });
  return links;
}

/** Where every call to action points. Becomes /signup once accounts land. */
export const CTA_HREF = "/simulator";
