# 🎮 StreamerChatAI

**Practice makes perfect streaming.** StreamerChatAI is an AI-powered chat simulator that helps streamers practice engaging with their audience before going live. Train your chat interaction skills with realistic, emotion-based chat messages powered by AI.

![Next.js](https://img.shields.io/badge/Next.js-16.0.0-black)
![React](https://img.shields.io/badge/React-19.2.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4.18-38bdf8)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📋 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Environment Setup](#-environment-setup)
- [Project Structure](#-project-structure)
- [Architecture](#-architecture)
- [API Integration](#-api-integration)
- [Adding Custom Emotes](#-adding-custom-emotes)
- [Deployment](#-deployment)
- [Acceptance Tests](#-acceptance-tests)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### Core Functionality

- **🤖 AI-Powered Chat Simulation**: Realistic chat messages with emotion-based responses
- **🎙️ Voice Recognition**: Practice responding to chat while talking (Whisper integration ready)
- **📊 Advanced Analytics**: Track sessions, engagement rates, and improvement over time
- **🎨 OBS Integration**: Browser source overlay for practicing with your actual stream setup
- **⚙️ Customizable Settings**: Chat speed, message length, emote frequency, profanity filters
- **😴 Bored Mode**: Simulates real viewer behavior when you go silent
- **🛡️ Profanity Filter**: Multi-level content moderation (off/replace/filter)

### User Experience

- **🌓 Dark Mode**: Full dark/light/system theme support
- **💾 Settings Persistence**: Save and load custom presets
- **📈 Session Analytics**: Detailed charts and CSV export
- **📱 Responsive Design**: Works on desktop, tablet, and mobile

### Pages & Routes

- **Marketing**: Landing, Features, Pricing, About, Contact
- **Authentication**: Login, Signup (JWT-based)
- **Dashboard**: Simulator, Analytics, OBS Integration
- **Settings**: Theme, Simulation, Preset Management
- **Help**: Help Center, FAQ, Privacy Policy, Terms of Service

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Git**

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/DeandrexChandler/streamer-chat-ai.git
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your configuration (see [Environment Setup](#-environment-setup))

4. **Run the development server**

   ```bash
   npm run dev
   ```

5. **Open your browser**
   ```
   http://localhost:3000
   ```

---

## 🔐 Environment Setup

Create a `.env.local` file in the root directory:

```env
# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# OpenAI API (Optional - for AI-powered chat generation)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Whisper API (Optional - for voice recognition)
WHISPER_API_KEY=your-whisper-api-key-here

# Database (Optional - for production persistence)
DATABASE_URL=postgresql://user:password@localhost:5432/streamerchatai

# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Required Environment Variables

| Variable          | Description                             | Required                                    |
| ----------------- | --------------------------------------- | ------------------------------------------- |
| `JWT_SECRET`      | Secret key for JWT token signing        | ✅ Yes                                      |
| `OPENAI_API_KEY`  | OpenAI API key for AI chat generation   | ⚠️ Optional (uses mock data if not set)     |
| `WHISPER_API_KEY` | Whisper API key for voice transcription | ⚠️ Optional (mic input disabled if not set) |
| `DATABASE_URL`    | PostgreSQL connection string            | ⚠️ Optional (uses localStorage if not set)  |

### Generating JWT Secret

```bash
# Generate a secure random string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📁 Project Structure

```
streamer-chat-ai/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Landing page
│   ├── layout.tsx                # Root layout
│   ├── globals.css               # Global styles
│   │
│   ├── login/                    # Authentication
│   │   └── page.tsx
│   ├── signup/
│   │   └── page.tsx
│   │
│   ├── pricing/                  # Marketing pages
│   │   └── page.tsx
│   ├── features/
│   │   └── page.tsx
│   ├── about/
│   │   └── page.tsx
│   ├── contact/
│   │   └── page.tsx
│   │
│   ├── dashboard/                # Protected dashboard
│   │   ├── layout.tsx            # Dashboard layout with sidebar
│   │   ├── simulator/            # Main chat simulator
│   │   │   └── page.tsx
│   │   ├── analytics/            # Analytics & charts
│   │   │   └── page.tsx
│   │   ├── obs/                  # OBS integration
│   │   │   └── page.tsx
│   │   ├── settings/             # Settings pages
│   │   │   ├── theme/
│   │   │   ├── simulation/
│   │   │   └── more/
│   │   ├── help/                 # Help center
│   │   │   └── page.tsx
│   │   ├── faq/
│   │   │   └── page.tsx
│   │   ├── privacy/
│   │   │   └── page.tsx
│   │   └── terms/
│   │       └── page.tsx
│   │
│   ├── overlay/                  # OBS overlay endpoint
│   │   └── page.tsx
│   │
│   └── api/                      # API routes
│       ├── auth/
│       │   ├── login/
│       │   └── signup/
│       ├── generate/             # AI chat generation
│       ├── transcribe/           # Voice transcription
│       ├── emotes/               # Emote management
│       └── analytics/            # Analytics data
│
├── lib/                          # Utility libraries
│   ├── emotes.ts                 # Emote cache & utilities
│   ├── chatGenerator.ts          # Chat message generator
│   ├── profanityFilter.ts        # Content moderation
│   ├── settings.ts               # Settings persistence
│   └── auth.ts                   # JWT authentication
│
├── components/                   # React components
│   ├── DashboardLayout.tsx       # Dashboard wrapper
│   ├── ChatFeed.tsx              # Chat message display
│   ├── MicInput.tsx              # Microphone controls
│   ├── SettingsPanel.tsx         # Settings sidebar
│   └── SimulatorInterface.tsx    # Main simulator UI
│
├── .emote_cache.json             # Emote definitions
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── tailwind.config.ts            # Tailwind CSS config
├── next.config.ts                # Next.js config
└── README.md                     # This file
```

---

## 🏗️ Architecture

### Frontend Architecture

- **Framework**: Next.js 16 with App Router
- **UI Library**: React 19 with Server & Client Components
- **Styling**: Tailwind CSS v3 with custom theme
- **State Management**: React hooks + localStorage
- **Icons**: Lucide React
- **Charts**: Recharts
- **Notifications**: Sonner (toast notifications)

### Backend Architecture

- **API**: Next.js API Routes (REST)
- **Authentication**: JWT with jose library
- **Password Hashing**: bcryptjs
- **Data Storage**:
  - Development: localStorage
  - Production: PostgreSQL (ready for Prisma)

### Key Utilities

#### Chat Generator (`lib/chatGenerator.ts`)

Generates realistic chat messages with:

- Random usernames from pool
- Emotion-based message selection
- Emote integration based on emotion
- Message length variation (1-20 words)
- Bored mode (idle detection)

#### Profanity Filter (`lib/profanityFilter.ts`)

Three-level filtering system:

- **Off**: No filtering
- **Replace**: Replace bad words with asterisks
- **Filter**: Remove messages entirely

#### Settings Manager (`lib/settings.ts`)

Handles:

- Theme preferences (dark/light/system)
- Simulation settings (speed, emotes, filters)
- Preset save/load/delete
- Import/export settings as JSON

---

## 🔌 API Integration

### Integrating OpenAI for Chat Generation

Replace the mock chat generator with real AI:

1. **Install OpenAI SDK**

   ```bash
   npm install openai
   ```

2. **Update `app/api/generate/route.ts`**

   ```typescript
   import OpenAI from "openai";

   const openai = new OpenAI({
     apiKey: process.env.OPENAI_API_KEY,
   });

   export async function POST(request: Request) {
     const { emotion, context } = await request.json();

     const completion = await openai.chat.completions.create({
       model: "gpt-4",
       messages: [
         {
           role: "system",
           content: `You are a Twitch chat viewer. Generate short, casual chat messages with ${emotion} emotion.`,
         },
         {
           role: "user",
           content: context || "Generate a chat message",
         },
       ],
       max_tokens: 50,
     });

     return Response.json({
       message: completion.choices[0].message.content,
     });
   }
   ```

3. **Update Chat Generator**
   In `lib/chatGenerator.ts`, replace mock logic with API call:
   ```typescript
   const response = await fetch("/api/generate", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ emotion, context }),
   });
   const data = await response.json();
   return data.message;
   ```

### Integrating Whisper for Voice Recognition

1. **Install Dependencies**

   ```bash
   npm install @whisper/sdk
   ```

2. **Update `app/api/transcribe/route.ts`**

   ```typescript
   import { Whisper } from "@whisper/sdk";

   const whisper = new Whisper({
     apiKey: process.env.WHISPER_API_KEY,
   });

   export async function POST(request: Request) {
     const formData = await request.formData();
     const audioFile = formData.get("audio") as File;

     const transcription = await whisper.transcribe(audioFile);

     return Response.json({
       text: transcription.text,
       confidence: transcription.confidence,
     });
   }
   ```

3. **Update Mic Input Component**
   In `components/MicInput.tsx`, send audio to API:
   ```typescript
   const sendAudioToAPI = async (audioBlob: Blob) => {
     const formData = new FormData();
     formData.append("audio", audioBlob);

     const response = await fetch("/api/transcribe", {
       method: "POST",
       body: formData,
     });
     const data = await response.json();
     handleTranscription(data.text);
   };
   ```

---

## 🎭 Adding Custom Emotes

Emotes are stored in `.emote_cache.json` with emotion tags.

### Emote Structure

```json
{
  "emotes": [
    {
      "code": "PogChamp",
      "url": "https://static-cdn.jtvnw.net/emoticons/v2/305954156/default/dark/1.0",
      "emotions": ["happy", "excited"]
    },
    {
      "code": "Sadge",
      "url": "https://cdn.7tv.app/emote/61c8be38e96a69bcf8d86e58/1x.webp",
      "emotions": ["sad"]
    }
  ]
}
```

### Adding New Emotes

1. **Open `.emote_cache.json`**

2. **Add emote object**

   ```json
   {
     "code": "YourEmote",
     "url": "https://your-cdn.com/emote.png",
     "emotions": ["happy", "toxic", "neutral"]
   }
   ```

3. **Available Emotions**
   - `happy` - Positive, excited messages
   - `sad` - Disappointed, upset messages
   - `toxic` - Aggressive, negative messages
   - `thinking` - Confused, questioning messages
   - `neutral` - Generic, casual messages

### Emote Sources

- **Twitch**: https://static-cdn.jtvnw.net/emoticons/v2/{emote_id}/default/dark/1.0
- **7TV**: https://cdn.7tv.app/emote/{emote_id}/1x.webp
- **BTTV**: https://cdn.betterttv.net/emote/{emote_id}/1x
- **FFZ**: https://cdn.frankerfacez.com/emote/{emote_id}/1

---

## 🚢 Deployment

### Vercel (Recommended)

1. **Push to GitHub**

   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Import to Vercel**

   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Add environment variables
   - Click "Deploy"

3. **Environment Variables in Vercel**
   - Go to Project Settings → Environment Variables
   - Add all variables from `.env.local`

### Netlify

1. **Build Settings**

   - Build command: `npm run build`
   - Publish directory: `.next`

2. **Deploy**
   ```bash
   npm install -g netlify-cli
   netlify deploy --prod
   ```

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t streamerchatai .
docker run -p 3000:3000 --env-file .env.local streamerchatai
```

---

## ✅ Acceptance Tests

Run through these tests before deploying:

### Authentication

- [ ] Sign up with new account
- [ ] Log in with existing account
- [ ] JWT token persists in localStorage
- [ ] Protected routes redirect to login
- [ ] Logout clears token

### Simulator

- [ ] Chat messages generate at configured speed
- [ ] Pause/resume controls work
- [ ] Manual "Send Message" input works
- [ ] Emotes render correctly in messages
- [ ] Bored mode triggers after silence
- [ ] Auto-scroll keeps latest messages visible

### Settings

- [ ] Theme changes (light/dark/system) apply immediately
- [ ] Chat speed slider updates simulation
- [ ] Profanity filter blocks/replaces bad words
- [ ] Settings persist after page reload
- [ ] Presets save and load correctly
- [ ] Export settings downloads JSON
- [ ] Import settings loads from file

### Analytics

- [ ] Charts display mock data correctly
- [ ] Bar chart shows 7-day usage
- [ ] Line chart shows message trends
- [ ] CSV export downloads data
- [ ] Stats cards show correct metrics

### OBS Integration

- [ ] Overlay settings update preview in real-time
- [ ] Browser source URL copies to clipboard
- [ ] Overlay page displays at /overlay with URL params
- [ ] CSS download generates valid stylesheet
- [ ] Setup instructions are clear

### Responsiveness

- [ ] Works on mobile (375px width)
- [ ] Works on tablet (768px width)
- [ ] Works on desktop (1920px width)
- [ ] Sidebar collapses on mobile
- [ ] All buttons are clickable on touch devices

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Use TypeScript for all new code
- Follow existing code style (Prettier + ESLint)
- Add comments for complex logic
- Test on multiple browsers
- Ensure mobile responsiveness

---

## 📄 License

This project is licensed under the MIT License. See `LICENSE` file for details.

---

## 🙏 Acknowledgments

- **OpenAI** - GPT models for chat generation
- **Whisper** - Voice recognition technology
- **Twitch** - Inspiration and emote sources
- **Vercel** - Hosting and deployment platform
- **Streaming Community** - Feedback and feature ideas

---

## 📞 Support

- **Email**: support@streamerchatai.com
- **Discord**: [Join our community](#)
- **GitHub Issues**: [Report bugs](https://github.com/DeandrexChandler/streamer-chat-ai/issues)
- **Documentation**: [Help Center](/dashboard/help)

---

**Built with ❤️ by streamers, for streamers.**

Practice makes perfect. Start training today! 🎮
├── Footer.tsx
├── Navigation.tsx
└── ui/
├── Button.tsx
├── Card.tsx
└── Modal.tsx

- random questions for engagement
- mic sensitivity, threshold bar for loudness detection (4 uppercase in chat; like screaming)
- ignore words filter (n*er, f*g, etc)
- backgroun noise suprresion (advanced settings for premium)
- 2 emotes modes for now (W community, Poggers community)
- 7tv emotes on/off, emote only mode (need to add personality to emotes for proper usage)
- mic transcription to include slang (bruh, SAJ, KEKW, etc.)
- if nothing said: initiate "bored" mode where ai makes random comments/questions to streamer to keep engagement
- ai mood settings (happy, serious, funny, sarcastic, clipfarming, etc.)
