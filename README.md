# Linyone - Disaster Relief & Rescue Platform

Linyone is a real-time, AI-powered disaster relief platform designed to connect survivors, volunteers, and organizations during emergencies. Built for the ASEAN context, it features interactive mapping, family safety tracking, real-time communications, and AI assistance.

## 🚀 Tech Stack
- **Framework:** Next.js 15 (React 19)
- **Styling:** Tailwind CSS V4 & Shadcn UI
- **Database & Auth:** Supabase (PostgreSQL)
- **Mapping:** Mapbox GL
- **Real-time:** Ably
- **AI Integration:** Google Gemini AI

---

## 🛠️ Local Development Setup Guide

Follow these steps to run the project locally.

### 1. Clone & Install Dependencies
```bash
git clone <your-repo-url>
cd linyone
npm install
```

### 2. Supabase Setup
This project uses Supabase as the primary database. Let's set it up:
1. Go to [Supabase](https://supabase.com) and create a **New Project**.
2. Wait a few minutes for the database to be provisioned.
3. Go to **Project Settings > API** to find your *Project URL* and *Anon Key*.

### 3. Database Tables & Policies Setup
In your Supabase project, go to the **SQL Editor**, click **New Query**, and paste the contents of the `database.sql` file (found in the root of this repository) into the editor and **Run** it. This will create all 11 required tables and set up Row Level Security (RLS) for your storage bucket.

### 4. Storage Bucket Setup
To allow users to upload images of disaster zones:
1. In Supabase, go to **Storage** from the left menu.
2. Click **New Bucket**.
3. Name it **exactly**: `pin-images`
4. Toggle **"Public bucket"** to ON.
5. Click **Save**.

### 5. Environment Variables Setup
Create a file named `.env.local` in the root of your project directory and add the following keys:

```env
# 1. Supabase Settings (From Project Settings > API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# 2. Mapbox Settings (Create an account at mapbox.com for the token)
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_token_here

# 3. Ably Settings (Create an app at ably.com for real-time features)
ABLY_API_KEY=your_ably_api_key_here
NEXT_PUBLIC_ABLY_CHANNEL=linyone-main-channel

# 4. Google Gemini AI Settings (Get key from aistudio.google.com)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-pro

# 5. Safety Features Settings (Timers for family safety check)
SAFETY_WINDOW_MINUTES=5
SAFETY_WINDOW_SECONDS=300
```

### 6. Admin Account setup (Optional)
There is no hardcoded admin account. To become an admin:
1. Run the project and register normally on the website.
2. Go to your Supabase Dashboard > **Table Editor** > `users` table.
3. Find your registered user row and change the `is_admin` column from `FALSE` (or null) to `TRUE`.
4. **Log out** and **Log in** again on the website. You will now see the Admin dashboard.

### 7. Run the Application
Start the development server:
```bash
npm run dev
```
The application will be available at [http://localhost:3000](http://localhost:3000).

---

## 💡 Key Features for ASEAN Competition Showcases
- **Interactive Rescue Map:** Pinpoint dangerous zones and request specific supplies (water, medical kits, etc.).
- **Real-Time Safety Checks:** Track family members and broadcast real-time SOS alerts via Ably websockets.
- **AI-Powered Chat:** Gemini AI integrated to offer immediate survival guidance and first-aid instructions when human volunteers are overwhelmed.
- **Admin & Volunteer Dashboards:** Comprehensive view for organizations to manage deployments and track rescue resources efficiently.
