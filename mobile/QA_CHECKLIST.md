# Mobile QA Checklist (User + Volunteer Scope)

Use this checklist before declaring mobile release-ready parity.

## 0) Environment
- [ ] `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set
- [ ] `EXPO_PUBLIC_API_BASE_URL` is set (AI + API-backed flows)
- [ ] `npm.cmd run typecheck` passes
- [ ] Expo app opens on device/emulator

## 1) Authentication and Route Guards
- [ ] Unauthenticated user is redirected to `/auth`
- [ ] Authenticated user cannot access auth-only screens unexpectedly
- [ ] Restricted screens redirect correctly by role
- [ ] Logout clears session and returns to auth flow

## 2) User Flows
- [ ] User can create pin with location and optional image
- [ ] Created pin appears on map and in recent pin list
- [ ] Map marker tap opens `pin-details`
- [ ] Alerts list loads and unread/read behavior works
- [ ] Messages thread loads, send works, realtime updates appear
- [ ] Safety module -> guided lesson flow works end-to-end
- [ ] Lesson completion grants points once only

## 3) Volunteer Flows
- [ ] Tracker can open pending pin in `pin-details`
- [ ] AI suggestion pre-fills requested items (when available)
- [ ] Tracker can confirm pin with item quantities
- [ ] Confirmed pin shows item remaining/requested progress
- [ ] Volunteer can update remaining quantities
- [ ] Pin can be marked completed only when remaining quantities are zero

## 4) Realtime and Data Sync
- [ ] Alerts update without manual refresh when notifications change
- [ ] Conversation updates when incoming message arrives
- [ ] Read status updates after viewing thread
- [ ] Pull-to-refresh works for home/alerts/messages

## 5) UX and State Consistency
- [ ] Loading states are visible (alerts/messages/pin-details)
- [ ] Empty states are informative and non-blocking
- [ ] Error states show retry/back options where needed
- [ ] Disabled buttons visually indicate inactive actions

## 6) Regression Notes
Record issues as:
- Screen:
- Role:
- Steps:
- Expected:
- Actual:
- Severity: (`low` / `medium` / `high`)
