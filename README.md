# Strava AI Coach — Strava AI Coach

A premium React Native (Expo) training companion that connects to your Strava account and turns your activity data into actionable coaching insights, intelligent goals, and personalised AI plans.

---

## Features

### 🏠 Overview
- **Live activity heatmap** with streak counter, activity-type colour coding, and tap tooltips
- **This Week** progress ring with km / days / calories summary
- **Gradient stat cards** — runs, walks, rides, suffer score, elevation, steps
- **Training Load panel** — ATL (fatigue), CTL (fitness), TSB (form) computed from suffer scores
- **Best Efforts** — auto-detected 1 km / 5 km / 10 km personal records
- **Badges** — horizontal scroll of all 17 milestones (earned + locked), each tappable for detail
- **Recent Activities** — tap any card to open a full Activity Detail sheet

### 📊 Insights
- **8 switchable graph tabs**: Pace · Volume · HR Zones · Elevation · Steps · Time · Calories · Power
- Per-tab gradient summary pills and colour-coded chart top border
- Line/Bar/Pie charts via `react-native-gifted-charts` with animated tooltips
- 80/20 training rule coach tip on HR Zone tab
- "Manage Graphs" toggle sheet to show/hide any tab

### 🎯 Goals
- **AI Goals** — Gemini-generated structured training plans with phase breakdown, weekly targets, long run targets
- **Simple Goals** — weekly/monthly frequency, distance, time, or HR targets per activity type (Run / Walk / Ride / All)
- Auto-expiry & renewal every period with history archive (✅/❌ per period)
- Gradient progress cards that change colour as you approach 100%

### 👤 Profile
- Gradient hero banner (indigo→violet→pink) with avatar, name, age/level/terrain pills
- Mini stats row: current streak / badges earned / 5 km PR
- Gradient stat cards for total activities, distance, best streak
- Full athlete form: personal info, athletic profile, lifestyle & habits
- Badges quick-strip (earned first, locked at 40% opacity)
- Floating ✏️ FAB to toggle edit mode

### 🔔 Notifications
- **Weekly recap** — every Monday 8am: last week's km, days, streak
- **Streak at risk** — daily 8pm reminder if streak > 0
- **Goal deadline** — fires when an AI goal is ≤ 7 days away
- **Goal complete** — immediate local notification on simple goal achievement
- **Milestone unlocked** — badge unlock notifications

### 🏅 Milestones (17 badges)
| Category | Examples |
|---|---|
| Distance | First 10 km, Half Marathon, Marathon, 100/500/1000 km Club |
| Streak | 3-Day Streak, Week Warrior, Iron Habit (30 days) |
| Speed | Sub-6, Sub-5, Speed Demon (sub-4:30) |
| Elevation | Hill Climber (500 m), Mountain Goat (1000 m) |
| Frequency | 10 Runs, 50 Runs, Centurion (100 runs) |

### ⚙️ Settings
- Strava OAuth connection
- Gemini / OpenAI / Anthropic LLM provider + API key
- Units (metric / imperial), time format
- Coach personality (Strict · Encouraging · Data-Driven)
- Active graph management

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native + Expo SDK 54 |
| Navigation | React Navigation (bottom tabs) |
| State | Zustand + AsyncStorage persist |
| Charts | react-native-gifted-charts |
| Gradients | expo-linear-gradient |
| Notifications | expo-notifications |
| Auth | Strava OAuth via expo-auth-session |
| AI | Google Gemini 2.5 Flash (or OpenAI / Anthropic) |
| Animation | react-native-reanimated |
| Icons | lucide-react-native |

---

## Getting Started

### Prerequisites
- Node 18+
- Expo CLI (`npm i -g expo-cli`)
- Android Studio / Xcode for device builds
- Strava Developer account → [Create an app](https://www.strava.com/settings/api)
- Gemini API key → [Google AI Studio](https://aistudio.google.com)

### Setup

```bash
git clone https://github.com/gaurav25122000/strava-ai-coach
cd strava-ai-coach
npm install
```

### Configure

In **Settings** tab inside the app:
1. Enter your Strava Client ID + Client Secret
2. Tap **Connect Strava** and authorise
3. Enter your Gemini (or OpenAI) API key
4. Tap **Sync Activities**

### Run

```bash
# Android
npm run android

# iOS
npm run ios
```

> **Note**: `expo-notifications` requires a native build (`expo run:android` / `expo run:ios`). It will not work in Expo Go.

---

## Architecture

```
src/
├── screens/
│   ├── OverviewScreen.tsx      # Home dashboard
│   ├── InsightsScreen.tsx      # Graph tabs
│   ├── GoalsScreen.tsx         # AI + Simple goals
│   ├── ProfileScreen.tsx       # Athlete profile + badges
│   ├── SettingsScreen.tsx      # Auth + configuration
│   └── ActivityDetailScreen.tsx # Per-activity deep dive
├── services/
│   ├── strava.ts               # Strava API + activity sync
│   ├── ai.ts                   # LLM coaching prompts
│   ├── milestones.ts           # Badge detection + training load
│   └── notifications.ts        # Local notification scheduling
├── store/
│   └── useStore.ts             # Zustand global state
└── components/
    ├── HeatmapCalendar.tsx
    ├── Card.tsx
    └── Typography.tsx
```

---

## License

MIT