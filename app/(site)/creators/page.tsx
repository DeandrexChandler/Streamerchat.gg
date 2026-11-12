import type { Metadata } from "next";
import { Tag } from "@/components/site/ui";
import { CREATORS } from "@/lib/site/creators";

export const metadata: Metadata = {
  title: "Creators",
  description: "Streamers using StreamerChat.gg.",
};

export default function CreatorsPage() {
  return (
    <>
      <section className="flex min-h-[50vh] flex-col items-start justify-center py-20">
        <Tag>Creators</Tag>
        <h1 className="site-display mt-8 max-w-[12ch]">
          Streamers using <em>it</em>.
        </h1>
      </section>
      {CREATORS.length === 0 ? (
        <p className="site-card site-muted mb-24 max-w-[640px] p-10 text-lg">
          This is for streamers whose chat is still small. The first ones will be listed here.
        </p>
      ) : (
        <ul className="mb-24 grid grid-cols-3 gap-5">
          {CREATORS.map((creator) => (
            <li key={creator.url}>
              <a
                href={creator.url}
                target="_blank"
                rel="noreferrer"
                className="site-card site-card-lift block h-full p-7"
              >
                <h2 className="site-h3">{creator.name}</h2>
                <p className="site-muted mt-2">{creator.blurb}</p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
