   # Rescura Ecosystem: Deployment & Configuration Guide

This document provides comprehensive technical procedures for deploying the Rescura ecosystem, encompassing both the **Strategic Coordination Dashboard (Web)** and the **Tactical Field Response Application (Mobile)**.

## Infrastructure Prerequisites

To ensure full system interoperability, the following service credentials and environments are required:

*   **Node.js**: Version 20+ (LTS) with npm.
*   **Supabase**: Managed PostgreSQL database, authentication provider, and real-time synchronization engine.
*   **Mapbox**: Geospatial service provider for map tiles and forward/reverse geocoding.
*   **Ably**: Global Pub/Sub infrastructure for low-latency SOS broadcasting.
*   **Google AI Studio**: Access to the Gemini 2.5 Flash model for high-capability triage.
*   **Expo Environment**: Physical device or emulator with the **Expo Go** application for mobile testing.

---

## 1. Initial Installation

Clone the repository and initialize dependencies for both platforms to ensure unified build environments.

### Core Repository (Web & Shared Logic)
```bash
npm install
```

### Mobile Infrastructure (Expo)
```bash
cd mobile
npm install
cd ..
```

---

## 2. Strategic Infrastructure (Supabase)

Rescura utilizes Supabase as its primary data orchestration layer.

1.  **Project Initialization**: Create a new project at [supabase.com](https://supabase.com).
2.  **Schema Deployment**: Execute the contents of `database.sql` within the Supabase **SQL Editor**. This initializes the relational schema, including unified User, Organization, and Incident (Pin) tables, while establishing rigorous Row Level Security (RLS) policies.
3.  **Storage Provisioning**: 
    *   Create a public bucket named `pin-images` to store verified field intelligence (incident photographs).
4.  **Credential Management**: Extract the **Project URL** and **Service/Anon Keys** from the Supabase Settings for environment configuration.

---

## 3. Environment Orchestration

### Coordination Layer (`/.env.local`)
Create a `.env.local` file in the root directory to configure the Next.js server:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Geospatial Services
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token

# Real-time Broadcast Engine
ABLY_API_KEY=your_server_key
NEXT_PUBLIC_ABLY_CHANNEL=rescura-main-channel

# Intelligence Layer
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.5-flash

# Safety Telemetry Parameters
SAFETY_WINDOW_MINUTES=5
SAFETY_WINDOW_SECONDS=300
```

### Field Layer (`/mobile/.env`)
Create a `.env` file in the `mobile` directory for the Expo client:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Network Coordination: Use LAN IP for cross-device testing
# Example: http://192.168.1.15:3000
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000

EXPO_PUBLIC_MAPBOX_TOKEN=pk.your_token
EXPO_PUBLIC_ABLY_KEY=your_client_publishable_key
EXPO_PUBLIC_ABLY_CHANNEL=rescura-main-channel
```

---

## 4. Execution & Deployment

### Initializing the Coordination Command (Web)
```bash
npm run dev
```
The dashboard is accessible via `http://localhost:3000`.

### Deploying the Field Response Client (Mobile)
```bash
cd mobile
npx expo start
```
Scan the generated QR code with a physical device for full hardware access (GPS/Camera) or utilize `a` (Android) / `i` (iOS) for emulation.

---

## 5. Advanced System Configuration

### On-Device AI Initialization (Mobile)
Upon the first invocation of the Mobile AI Assistant, the system will perform an autonomous **~350MB download** of the Qwen LLM model. This allows for total offline survival guidance using `llama.rn` hardware acceleration.

### Role-Based Access Control (RBAC) Management
Rescura employs a multi-tiered security model. To elevate user permissions:

1.  **Administrative Privileges**: Update `is_admin = TRUE` for the target user in the `users` table via the Supabase Table Editor.
2.  **Organizational Management**: 
    *   Register an entry in the `organizations` table.
    *   Associate the user in the `org-member` table, assigning `type = 'admin'` for full coordination access.

## 6. Connectivity Troubleshooting

*   **API Telemetry**: If the mobile client fails to reach the web API, verify that both host and client are on a unified LAN and that the `EXPO_PUBLIC_API_BASE_URL` utilizes the host's LAN IP address.
*   **Geospatial Rendering**: Ensure that the Mapbox token has the correct origin authorizations for both `localhost` and your LAN IP.
*   **Real-time Handshakes**: Confirm that Ably channel strings are identical across both platform configurations to ensure SOS broadcast synchronization.
