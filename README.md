# GCSE revision command centre

A personal revision dashboard: topics for every subject marked red / amber / green,
a daily plan built from priorities, exam countdowns, working grades, mistakes and weekly hours.

**Setting it up for the first time? Follow [SETUP.md](SETUP.md).**
**Connecting Microsoft Teams? Follow [TEAMS_SETUP.md](TEAMS_SETUP.md).**

## Subjects

| Subject | Board & spec | Target |
| --- | --- | --- |
| Maths | Edexcel GCSE Higher, 1MA1 (finals summer 2027, a year early) | 9 |
| Biology, Chemistry, Physics | Edexcel GCSE, 1BI0 / 1CH0 / 1PH0 | 9 |
| Business | Edexcel GCSE, 1BS0 | 9 |
| Economics | Edexcel iGCSE, 4EC1 | 8 (stretch 9) |
| Geography | Edexcel iGCSE, 4GE1 | 9 |
| English Literature | Edexcel iGCSE, 4ET1 | 9 |
| English Language | Edexcel iGCSE Spec A, 4EA1 | 9 |

## How it decides what to revise

- **Priority** for each topic = marks weighting × weakness × urgency.
  - Weakness: red 1, amber 0.6, green 0.25, not rated 0.8.
  - Urgency rises as that subject's next mock or exam gets closer.
  - A class test boosts the topics it covers.
- **Spaced repetition:** red topics come back in 2 days, amber in 5, green in 14 (21 for a second cold retest).
  Topics that aren't due yet are held back.
- **Today's plan:** homework due within 2 days comes first, then the highest-priority topics (3–4 items,
  max 2 per subject). The plan is saved for the day so it doesn't reshuffle while you work.
- **Weekly hours:** 8–12 h in normal weeks, 20–24 h when a mock or final is within 4 weeks.
  Extra hours go to the subject with the nearest exam. All of these numbers can be changed in Settings.
- **Working grade:** your recent scores (the most recent count most) against the grade boundaries, nudged slightly
  by topic colours. Confidence is low with 1–2 scores, medium with 3–5, and high with 6 or more.

## Project map

| Where | What |
| --- | --- |
| `src/app/` | Pages: `page.tsx` (Today), `subjects/`, `topics/`, `log/`, `coming-up/`, `mistakes/`, `week/`, `settings/`, `quiz/` |
| `src/app/actions.ts` | Everything that saves data |
| `src/lib/revision.ts` | Priority, spaced repetition, weekly hours |
| `src/lib/plan.ts` | Builds today's plan |
| `src/lib/grades.ts` | Working grade, confidence, gap to target |
| `src/lib/seed-data.ts` | Starting subjects, topics, grade boundaries and dates |
| `src/lib/schema.ts` | Database tables (created automatically) |
| `src/proxy.ts`, `src/lib/auth.ts` | Password protection |
| `src/lib/teams.ts`, `src/app/api/teams/` | Microsoft Teams connection and homework sync |
| `src/app/api/cron/daily/` | Daily background job: syncs Teams, then prepares today's plan |
| `src/app/api/status/` | Health check you can open without logging in |

## Running it on a computer (optional)

```bash
npm install
cp .env.example .env.local   # then fill in APP_PASSWORD and POSTGRES_URL
npm run dev                  # open http://localhost:3000
npm test                     # run the tests
```

## Roadmap

1. **Dashboard** (done)
2. **Teams sync** (done): reads homework from Microsoft Teams every morning and puts it in the plan
3. **Claude connector:** an MCP server so Claude study chats can read your plan, log sessions, and add homework or tests from screenshots
4. **Weekly review report**
5. **OneDrive lesson files** (only when asked)
