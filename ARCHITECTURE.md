# Rescura System Architecture

This document details the APIs, models, and integrated services that power the Rescura disaster relief ecosystem.

## 1. Architecture Overview

Rescura follows a **Hybrid Cloud/Edge Architecture** designed for high availability during disasters. 
- **Cloud Layer**: Centralized coordination, data persistence, and heavy-duty AI (Gemini).
- **Edge Layer**: Mobile devices performing background tracking and running local, offline AI (Llama) for zero-connectivity scenarios.

---

## 2. External APIs & Services

### Core Infrastructure
- **Supabase (Backend-as-a-Service)**: Orchestrates the platform's unified data layer through PostgreSQL, manages secure authentication, handles media storage (incident imagery), and provides real-time database subscriptions.

- **Ably (Real-time Messaging)**: Serves as the primary pub/sub engine for low-latency SOS broadcasts and ensures instantaneous UI state synchronization across the ecosystem.

- **Mapbox (Geospatial Services)**: Powers the platform's mapping infrastructure, providing high-fidelity map tiles, forward/reverse geocoding, and tactical routing.

### AI Inference
- **Google Gemini API (Primary Intelligence)**: Leverages the **Gemini 2.5 Flash** model for high-velocity survivor triage, complex request analysis, and the generation of structured survival protocols.


---

## 3. Internal Web API Endpoints (Next.js)

The web application acts as a secure middleware for the mobile app and administrative dashboard.

- **`/api/ably-token`**: Securely generates transient JWTs for client-side Ably authentication.
- **`/api/broadcast-alert`**: Orchestrates multi-channel notifications (Ably + Push) for critical disaster events.
- **`/api/last-seen`**: Receives background location heartbeats from mobile devices and updates the family safety dashboard.
- **`/api/reverse-geocode`**: Proxies Mapbox requests to resolve coordinates into human-readable addresses without exposing API tokens.
- **`/api/family`**: Manages safety linking between users, including invitations and safety check-in statuses.
- **`/api/ai`**: Unified handler for multi-model AI requests (routing between Gemini and Groq).

---

## 4. AI & Data Models

### Cloud Models (High Capability)
- **Gemini 2.5 Flash**: Optimized for speed and context window, used for analyzing complex survivor requests and generating multi-step first aid guides.

### Edge Models (Offline/Local)
- **Qwen 1.5-0.5B-Chat (GGUF)**: A high-performance, small-footprint LLM (~350MB) running locally on mobile devices via `llama.rn`. It allows for:
  - Offline survival guidance.
  - Basic triage without internet.
  - Context-aware retrieval from the local first-aid knowledge base.

### Embedded Knowledge Base
- **Keyword Retrieval Engine**: A hardcoded, categorized data set (`firstAidKnowledge.ts`) covering severe bleeding, burns, snake bites, CPR, and more. This acts as the "Ground Truth" for both the AI (via RAG) and direct user searches.

---

## 5. Mobile Native Integrations

- **Expo Location**: Real-time background tracking with high accuracy (`ACCESS_FINE_LOCATION`).
- **Expo Notifications**: Native push notifications for alert broadcasts.
- **Expo Task Manager**: Manages persistent background cycles for location heartbeats even when the app is suspended.
- **llama.rn**: Native C++ bridge for executing GGUF models using hardware acceleration (GPU/NPU) on iOS and Android.
