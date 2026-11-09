import type { Metadata } from "next";
import Link from "next/link";
import { CTA_HREF } from "@/lib/site/links";
import { PLANS, priceLabel } from "@/lib/site/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Plans for StreamerChat.gg.",
};

export default function PricingPage() {
  return (
    <div className="site-page">
      <p className="site-kicker">Pricing</p>
      <h1>Pricing</h1>
      <p className="site-lede">Prices are on their way. You can try the simulator today.</p>
      <div className="site-plans">
        {PLANS.map((plan) => (
          <section key={plan.id} className="site-plan">
            <h2>{plan.name}</h2>
            <p className={plan.price ? "site-price" : "site-price site-price-soon"}>
              {priceLabel(plan)}
            </p>
            <p>{plan.blurb}</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Link href={CTA_HREF} className="site-btn">
              Open the simulator
            </Link>
          </section>
        ))}
      </div>
    </div>
  );
}
