# Rescura: AI Disclosure & Transparency Statement

At Rescura, we believe that transparency is the foundation of trust, especially during life-critical disaster scenarios. This document discloses the nature, implementation, and limitations of the Artificial Intelligence (AI) integrated into the Rescura ecosystem.

## 1. AI Integration Tiers
Rescura utilizes a dual-layer AI architecture designed to balance high-capability reasoning with mission-critical availability.

*   **Cloud-Based Intelligence (Google Gemini)**: The web dashboard and connected mobile devices utilize the **Gemini 2.5 Flash** model for high-speed survivor triage, complex strategy generation, and multi-step survival guidance.
*   **On-Device Edge Intelligence (Local Llama)**: The mobile application features a localized Large Language Model (**Qwen 1.5 0.5B via llama.rn**) that executes directly on the user’s hardware. This ensures that survival guidance remains accessible in total network blackout scenarios.

## 2. Critical Safety Disclosure & Limitations
While Rescura's AI is designed to assist in survival and coordination, users must adhere to the following safety boundaries:

*   **Not a Replacement for Professional Services**: The AI-generated guidance provided by Rescura is a **supplemental utility** and should never be considered a replacement for professional medical advice, law enforcement, or official emergency services (911/999/199).
*   **Potential for "Hallucinations"**: Like all Large Language Models, Rescura’s AI may occasionally generate inaccurate or misleading information. Users are urged to cross-reference AI suggestions with the **Verified Pins** and official announcements provided in the dashboard.
*   **Deterministic vs. Probabilistic Data**: First-aid protocols provided via the "Emergency Engine" are deterministic (hardcoded). However, chat-based AI responses are probabilistic. Users should prioritize hardcoded protocols for high-stakes medical procedures.

## 3. Data Privacy & Ethical Framework
We prioritize a "Privacy-by-Design" approach to AI interactions.

*   **Local Processing**: When using the "Offline AI" mode, all inference occurs locally on the device. No chat data or telemetry is transmitted to external servers during these sessions.
*   **Cloud Transparency**: Requests sent to the Gemini API are transient and governed by our strict data privacy policies, ensuring that survivor data is not utilized for model training.

## 4. Human-in-the-Loop Verification
Rescura maintains a clear distinction between AI-suggested data and professional intelligence.

*   **Verified Pins**: Only authenticated organization members and administrators can "Verify" incident pins.
*   **AI Predicted Locations**: The family tracking "Predicted Path" is a mathematical heuristic designed to assist search-and-rescue and should not be interpreted as a guaranteed real-time location.

---

> **"Our AI is engineered to empower human resilience, not to replace it. We provide the tools for situational awareness, but the ultimate decision-making remains with the survivor and the professional responder."**
