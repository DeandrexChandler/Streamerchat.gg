import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button, FAQItem, Tag } from "@/components/site/ui";
import { CTA_HREF } from "@/lib/site/links";
import { COMPARISON, PLANS, priceLabel, type Plan } from "@/lib/site/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Plans for StreamerChat.gg.",
};

function PricingCard({ plan, featured }: { plan: Plan; featured: boolean }) {
  return (
    <section
      className={`site-card flex flex-col gap-5 p-9 ${featured ? "site-plan-featured" : ""}`}
    >
      <div className="flex items-center justify-between">
        <h2 className="site-h3 !text-2xl">{plan.name}</h2>
        {featured && <Tag dot>More chat</Tag>}
      </div>
      <p className="text-[40px] font-medium tracking-[-0.03em]">{priceLabel(plan)}</p>
      <p className="site-muted">{plan.blurb}</p>
      <ul className="flex flex-1 flex-col gap-3 border-t border-white/[0.09] pt-5">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <Check size={18} className="site-check mt-1 flex-none" aria-hidden />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <Button href={CTA_HREF} variant={featured ? "primary" : "ghost"}>
          Open the simulator
        </Button>
      </div>
    </section>
  );
}

function Cell({ value }: { value: true | string }) {
  return value === true ? (
    <Check size={18} className="site-check inline" aria-label="Included" />
  ) : (
    <span className="site-mono">{value}</span>
  );
}

export default function PricingPage() {
  return (
    <>
      <section className="flex min-h-[50vh] flex-col items-start justify-center py-20">
        <Tag>Pricing</Tag>
        <h1 className="site-display mt-8">
          Simple pricing. <em>Scale</em> the crowd.
        </h1>
        <p className="site-lede mt-8">
          Prices are on their way. You can try the simulator today.
        </p>
      </section>

      <div className="grid max-w-[900px] grid-cols-2 gap-5">
        {PLANS.map((plan, i) => (
          <PricingCard key={plan.id} plan={plan} featured={i === PLANS.length - 1} />
        ))}
      </div>

      <section className="site-reveal pt-36">
        <h2 className="site-h2">Compare plans</h2>
        <table className="site-table mt-10">
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Free</th>
              <th scope="col">Pro</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="!font-normal !text-[#f5f5f3]">
                  {row.label}
                </th>
                <td>
                  <Cell value={row.free} />
                </td>
                <td>
                  <Cell value={row.pro} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="site-reveal grid grid-cols-[1fr_2fr] gap-20 pb-20 pt-36">
        <h2 className="site-h2">Questions</h2>
        <div className="border-t border-white/[0.09]">
          <FAQItem q="Is the chat AI-generated?">
            Yes. Every line is written for your stream by Google&apos;s Gemini model. There are
            no canned lines. The app decides who speaks, when, and how often; the model decides
            what they say.
          </FAQItem>
          <FAQItem q="Can it react to my voice and my game?">
            Your voice, yes: speech recognition works in Chrome and Edge, and typing works
            anywhere. Your game too, if you turn on screen watching. It&apos;s off until you
            switch it on.
          </FAQItem>
          <FAQItem q="Does it work with OBS or Streamlabs?">
            It&apos;s a browser source URL. We set it up and test it with OBS; any streaming app
            with a browser source takes the same URL.
          </FAQItem>
          <FAQItem q="Can viewers tell it's simulated?">
            It looks like a Twitch chat. Be upfront about it: the terms ask you not to pass it
            off as real viewers to your audience, sponsors or platforms.
          </FAQItem>
          <FAQItem q="Can I cancel anytime?">
            Paid plans aren&apos;t on sale yet. This answer will be here when they are.
          </FAQItem>
          <FAQItem q="What happens to my voice and screen?">
            What you say and, if you turn it on, pictures of the window you share go to Google
            to write chat. The <Link href="/privacy" className="underline">privacy page</Link> has
            the details.
          </FAQItem>
        </div>
      </section>
    </>
  );
}
