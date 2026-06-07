# Supabase Setup

This app uses Supabase as the future cloud source of truth while IndexedDB remains the local offline cache.

## 1. Create Project

Create a free Supabase project, then copy:

- Project URL
- Public anon key

Create `.env.local` in the project root:

```sh
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Do not commit `.env.local`; `.gitignore` already excludes `*.local`.

## 2. Configure Auth

In Supabase Auth settings:

- Enable email sign-in.
- For local testing, add `http://127.0.0.1:5173/workout-app/` as an allowed redirect URL.
- For deployed PWA testing, add the deployed app URL as an allowed redirect URL.

The current app only tests sign-in/session persistence. Cloud sync is added in the next step.

## 3. Create Snapshot Table

Open the Supabase SQL editor and run `supabase/schema.sql`.

The table stores one app-data snapshot per user. This is intentionally simple for the first cloud sync milestone. The data model can evolve later into normalized tables for programs, templates, sessions, exercises, and progression rules.
