# Rescura: Strategic Disaster Coordination & Field Response

Rescura is a sophisticated, dual-platform ecosystem designed to modernize emergency response and survival coordination within the ASEAN region. By integrating real-time telemetry, advanced AI heuristics, and offline-first survival protocols, Rescura bridges the critical communication gap between survivors in the field and centralized coordination hubs.

## The Rescura Ecosystem

Following the successful establishment of our core web infrastructure, the project has successfully matured into a **fully deployed mobile-first operations phase**.

*   **Field Operations (Mobile)**: An Expo-powered native application optimized for high-stress, low-bandwidth environments. It features autonomous background tracking and on-device AI to ensure survivor safety even in total network isolation.
*   **Coordination Command (Web)**: A high-performance Next.js dashboard providing organizations and administrators with real-time situational awareness, verified data visualization, and resource allocation tools.

## Key Strategic Features

- **Integrated Safety Infrastructure**: Real-time geospatial tracking featuring **Verified Incident & Safe Zone Pins**. This allows survivors and family networks to visualize professional intelligence directly against personal location data.
- **Dual-Layer Intelligence Architecture**: 
  - **Cloud Intelligence (Gemini)**: Leverages high-parameter models for complex triage and multi-step survival strategies.
  - **Edge Intelligence (Local AI)**: Utilizes `llama.rn` and quantized models (Qwen 1.5) for on-device inference when connectivity is lost.
- **Resilient Offline First-Aid**: A high-speed, keyword-driven retrieval engine providing immediate access to life-saving protocols (CPR, hemorrhage control, etc.) without internet dependency.
- **Family Safety Network**: Persistent "Last Seen" telemetry using **Expo Task Manager**, allowing family members to monitor safety statuses with automated check-in triggers.
- **Tactical Real-time Alerts**: Low-latency SOS broadcasting and disaster alerts powered by **Ably** and **Supabase Realtime**.
- **Regional Optimization**: Native multi-language support (i18n) tailored for the diverse linguistic landscape of Southeast Asia.

## Technical Architecture

### Coordination Layer (Web)
- **Framework**: Next.js 15 (React 19)
- **Design System**: Vanilla CSS + Shadcn UI (Radix)
- **State Management**: Zustand + TanStack Query
- **Geospatial**: Mapbox GL JS

### Field Layer (Mobile)
- **Framework**: React Native (Expo SDK 52+)
- **Inference Engine**: llama.rn (GGUF hardware acceleration)
- **Background Persistence**: Expo Task Manager & Background Fetch
- **Mapping**: React Native Maps

### Shared Services
- **Backend**: Supabase (PostgreSQL + Real-time synchronization)
- **Intelligence**: Google Gemini 2.5 Flash
- **Messaging**: Ably (Global Pub/Sub)

## Documentation & Deployment

- **Getting Started**: Comprehensive installation and networking guides are available in [SETUP.md](SETUP.md).
- **Architecture Deep-Dive**: Detailed technical specifications of the API and model layers can be found in [ARCHITECTURE.md](ARCHITECTURE.md).
- **Project Evolution**: Track our transition from web-base to mobile-deployment in [WHATS_NEW.md](WHATS_NEW.md).
- **Demo Reference**: https://youtu.be/bnUQdrfwxAs
