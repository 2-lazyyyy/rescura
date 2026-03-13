# Setup Guide

## Prerequisites

- Node.js LTS and npm
- Supabase account
- Mapbox account
- Ably account
- Google AI Studio (Gemini) API key

## 1. Install dependencies

From the repository root:

```bash
npm install
```

## 2. Create a Supabase project

1. Go to https://supabase.com and create a new project.
2. Wait for provisioning to complete.
3. In the Supabase Dashboard, open Project Settings > API and copy the Project URL and anon key.

## 3. Database schema and policies

In the Supabase SQL Editor, run the SQL in [database.sql](database.sql). This creates the required tables and enables Row Level Security policies used by the app.

## 4. Storage bucket

Create a Supabase Storage bucket for map pins:

1. Open Storage in the Supabase Dashboard.
2. Create a new bucket named pin-images.
3. Set the bucket to Public.

## 5. Environment variables

Update [.env.local](.env.local) with the following values:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_token_here

# Ably
ABLY_API_KEY=your_ably_api_key_here
NEXT_PUBLIC_ABLY_CHANNEL=linyone-main-channel

# Google Gemini (server-side)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-pro

# Safety windows
SAFETY_WINDOW_MINUTES=5
SAFETY_WINDOW_SECONDS=300
```

If you change environment values while the dev server is running, restart it to apply the updates.

## 6. Run the application

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## 7. Optional: enable admin access

There is no hardcoded admin account. To enable admin features:

1. Register a user in the app.
2. In Supabase Table Editor, open the users table.
3. Set is_admin to TRUE for your user.
4. Log out and log back in to refresh your role.

## 8. Additional scripts

```bash
npm run lint
npm run build
npm run start
```
