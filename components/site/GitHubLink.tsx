import { Github } from "lucide-react";
import { LINKS } from "@/lib/site/links";

/** The repo link, or a greyed "Soon" placeholder while `LINKS.github` is null. */
export function GitHubLink() {
  if (LINKS.github) {
    return (
      <a href={LINKS.github} target="_blank" rel="noreferrer" className="site-gh">
        <Github size={16} aria-hidden />
        GitHub
      </a>
    );
  }
  return (
    <span className="site-gh site-gh-soon" title="The code isn't public yet">
      <Github size={16} aria-hidden />
      GitHub
      <span className="site-soon">Soon</span>
    </span>
  );
}
