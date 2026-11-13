import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { FAQItem, Tag } from "@/components/site/ui";
import { PLANS, priceLabel, type Plan } from "@/lib/site/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "StreamerChat.gg has one plan, Pro.",
};

/** No subscribe button until the owner sets a live price. */
function PricingCard({ plan }: { plan: Plan }) {
  return (
    <section className="site-card site-plan-featured flex flex-col gap-5 p-9">
      <h2 className="site-h3 !text-2xl">{plan.name}</h2>
      <p className="text-[40px] font-medium tracking-[-0.03em]">{priceLabel(plan)}</p>
      <p className="site-muted">{plan.blurb}</p>
      <ul className="flex flex-col gap-3 border-t border-white/[0.09] pt-5">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <Check size={18} className="site-check mt-1 flex-none" aria-hidden />
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PricingPage() {
  return (
    <>
      <section className="flex min-h-[50vh] flex-col items-start justify-center py-20">
        <Tag>Pricing</Tag>
        <h1 className="site-display mt-8">
          One plan. <em>Everything</em> in it.
        </h1>
        <p className="site-lede mt-8">
          Pro is how you run StreamerChat.gg. The price is on its way.
        </p>
      </section>

      <div className="max-w-[480px]">
        {PLANS.map((plan) => (
          <PricingCard key={plan.id} plan={plan} />
        ))}
      </div>

      <section className="site-reveal grid grid-cols-[1fr_2fr] gap-20 pb-20 pt-36">
        <h2 className="site-h2">Questions</h2>
        <div className="border-t border-white/[0.09]">
          <FAQItem q="Is there a free tier?">
            No. Every line chat says is written by an AI model, and that costs money each time,
            so chat runs on a Pro subscription.
          </FAQItem>
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
            Pro isn&apos;t on sale yet. This answer will be here when it is.
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
