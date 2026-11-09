import type { Metadata } from "next";
import { CREATORS } from "@/lib/site/creators";

export const metadata: Metadata = {
  title: "Creators",
  description: "Streamers using StreamerChat.gg.",
};

export default function CreatorsPage() {
  return (
    <div className="site-page">
      <p className="site-kicker">Creators</p>
      <h1>Streamers using it</h1>
      {CREATORS.length === 0 ? (
        <p className="site-empty">
          This is for streamers whose chat is still small. The first ones will be listed
          here.
        </p>
      ) : (
        <div className="site-creators">
          {CREATORS.map((creator) => (
            <a
              key={creator.url}
              href={creator.url}
              target="_blank"
              rel="noreferrer"
              className="site-creator"
            >
              <h3>{creator.name}</h3>
              <p>{creator.blurb}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
