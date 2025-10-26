- landing, features, about, creators, pricing, signup, login, dashboard, settings, help, faq, contact, terms, privacy, report a bug, billing, getting started, analytics, obs integration (guide) page, cookie notice, roadmap page (peep daisyai)

app/
├── layout.tsx                    # Root layout (header, footer, metadata)
├── page.tsx                      # Landing page (/)
├── globals.css                   # Global Tailwind styles
│
├── product/
│   └── page.tsx                  # Product page (/product)
│
├── about/
│   └── page.tsx                  # About page (/about)
│
├── pricing/
│   └── page.tsx                  # Pricing page (/pricing)
│
├── creators/
│   ├── page.tsx                  # Featured creators list (/creators)
│   └── [id]/
│       └── page.tsx              # Individual creator profile (/creators/:id)
│
├── signin/
│   └── page.tsx                  # Sign in page (/signin)
│
├── contact/
│   └── page.tsx                  # Contact us (/contact)
│
├── faq/
│   └── page.tsx                  # FAQ page (/faq)
│
├── help/
│   ├── page.tsx                  # Help center home (/help)
│   └── [topic]/
│       └── page.tsx              # Help article (/help/:topic)
│
├── billing/
│   └── page.tsx                  # Billing page (/billing)
│
├── getting-started/
│   └── page.tsx                  # Getting started guide (/getting-started)
│
├── dashboard/
│   ├── layout.tsx                # Dashboard-specific layout (sidebar, auth check)
│   ├── page.tsx                  # Dashboard home (/dashboard)
│   ├── analytics/
│   │   └── page.tsx              # Chat analytics (/dashboard/analytics)
│   └── streams/
│       └── page.tsx              # Stream history (/dashboard/streams)
│
├── obs/
│   └── page.tsx                  # OBS integration guide (/obs)
│
├── settings/
│   ├── layout.tsx                # Settings layout (tabs/sidebar)
│   ├── page.tsx                  # Settings home - redirect to /settings/profile
│   ├── profile/
│   │   └── page.tsx              # Profile settings (/settings/profile)
│   ├── preferences/
│   │   └── page.tsx              # Preferences (/settings/preferences)
│   ├── integrations/
│   │   └── page.tsx              # API keys, webhooks (/settings/integrations)
│   └── notifications/
│       └── page.tsx              # Notification settings (/settings/notifications)
│
├── privacy-policy/
│   └── page.tsx                  # Privacy policy (/privacy-policy)
│
├── terms-of-service/
│   └── page.tsx                  # Terms of service (/terms-of-service)
│
├── cookie-notice/
│   └── page.tsx                  # Cookie notice (/cookie-notice)
│
├── api/                          # API routes (backend endpoints)
│   ├── chat/
│   │   └── route.ts              # POST /api/chat (AI chat endpoint)
│   ├── auth/
│   │   └── route.ts              # Authentication endpoints
│   └── webhooks/
│       └── route.ts              # External webhooks (Stripe, Twitch, etc.)
│
└── components/                   # Reusable components (optional org)
    ├── Header.tsx
    ├── Footer.tsx
    ├── Navigation.tsx
    └── ui/
        ├── Button.tsx
        ├── Card.tsx
        └── Modal.tsx