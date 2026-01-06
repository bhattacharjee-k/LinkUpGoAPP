# VibeCheck UAT Checklist

## Overview
This document outlines User Acceptance Testing scenarios for VibeCheck, covering golden paths and edge cases.

---

## 1. Authentication Flow

### Golden Path
- [ ] **1.1** New user can complete registration with valid data
- [ ] **1.2** Registration collects city, budget, energy, categories preferences
- [ ] **1.3** User can log in with valid credentials
- [ ] **1.4** Session persists across page refreshes
- [ ] **1.5** User can log out successfully
- [ ] **1.6** After logout, protected routes redirect to onboarding

### Edge Cases
- [ ] **1.7** Registration fails with duplicate username (error shown)
- [ ] **1.8** Registration fails with invalid email format
- [ ] **1.9** Login fails with wrong password (error shown)
- [ ] **1.10** Login fails with non-existent username
- [ ] **1.11** Session expires after extended inactivity
- [ ] **1.12** Username availability check works in real-time

---

## 2. Group Management

### Golden Path
- [ ] **2.1** User can create a new group
- [ ] **2.2** Group gets unique invite code generated
- [ ] **2.3** User becomes admin of created group
- [ ] **2.4** User can copy invite link
- [ ] **2.5** New user can join via invite code
- [ ] **2.6** Group shows all members correctly

### Edge Cases
- [ ] **2.7** Cannot join group with invalid invite code
- [ ] **2.8** Cannot join group already a member of (no duplicate)
- [ ] **2.9** Non-admin cannot edit group settings
- [ ] **2.10** Deleted group returns 404
- [ ] **2.11** Very long group names truncate properly

---

## 3. Session Creation & Management

### Golden Path
- [ ] **3.1** Group admin can create new planning session
- [ ] **3.2** Session filters are saved correctly
- [ ] **3.3** Session generates unique invite code
- [ ] **3.4** Suggestions load automatically on session creation
- [ ] **3.5** All group members added as participants
- [ ] **3.6** Session appears in group's session list

### Edge Cases
- [ ] **3.7** Non-admin cannot create session
- [ ] **3.8** Session with no matching suggestions shows empty state
- [ ] **3.9** Deleted session no longer accessible
- [ ] **3.10** User can leave session (status: left)
- [ ] **3.11** User can mark "can't make it" status

---

## 4. Suggestions & API Integration

### Golden Path
- [ ] **4.1** Google Places returns relevant venue suggestions
- [ ] **4.2** Ticketmaster returns live events
- [ ] **4.3** Suggestions match filter criteria (city, budget, categories)
- [ ] **4.4** Each suggestion shows rating, distance, budget, description
- [ ] **4.5** Detail/reservation links work correctly
- [ ] **4.6** Suggestions cached for 10 minutes

### Edge Cases
- [ ] **4.7** API rate limit handled gracefully
- [ ] **4.8** Invalid API key shows error message
- [ ] **4.9** Network timeout shows retry option
- [ ] **4.10** Empty results show helpful message
- [ ] **4.11** Very long descriptions truncate properly
- [ ] **4.12** Cache serves stale data while revalidating

---

## 5. Voting System

### Golden Path
- [ ] **5.1** User can upvote a suggestion
- [ ] **5.2** User can downvote with reason selection
- [ ] **5.3** Downvote modal shows all reason chips
- [ ] **5.4** Downvote requires reason OR note (3+ chars)
- [ ] **5.5** Vote counts update in real-time
- [ ] **5.6** Score calculated correctly with reason penalties
- [ ] **5.7** Leading suggestion highlighted with badge

### Edge Cases
- [ ] **5.8** User can change vote from up to down
- [ ] **5.9** User can remove their vote
- [ ] **5.10** Cannot vote after session is locked
- [ ] **5.11** Majority downvote removes "Leading" badge
- [ ] **5.12** Info icon shows vote breakdown and reasons
- [ ] **5.13** Very long downvote notes truncate in info panel

---

## 6. Plan Locking

### Golden Path
- [ ] **6.1** Admin can lock plan from session
- [ ] **6.2** Locking sets winning option correctly
- [ ] **6.3** Locked session shows "WINNER" badge
- [ ] **6.4** Voting disabled after lock
- [ ] **6.5** Lock notification sent to participants
- [ ] **6.6** Tie-breaker modal appears when scores equal

### Edge Cases
- [ ] **6.7** Non-admin cannot lock plan
- [ ] **6.8** Cannot lock with no suggestions
- [ ] **6.9** Cannot unlock after locking
- [ ] **6.10** Multiple simultaneous lock attempts handled

---

## 7. Real-time Chat

### Golden Path
- [ ] **7.1** Messages appear in real-time via WebSocket
- [ ] **7.2** User messages show on right side
- [ ] **7.3** Other users' messages show on left with name
- [ ] **7.4** @Planner triggers AI response
- [ ] **7.5** AI can add/remove suggestions via function calling
- [ ] **7.6** System messages styled differently

### Edge Cases
- [ ] **7.7** WebSocket reconnects after disconnect
- [ ] **7.8** Messages preserved on page refresh
- [ ] **7.9** Very long messages render correctly
- [ ] **7.10** Rapid message sending doesn't cause duplicates
- [ ] **7.11** AI rate limit shows appropriate message

---

## 8. Notifications

### Golden Path
- [ ] **8.1** Notification appears when joining session
- [ ] **8.2** Notification appears when plan is locked
- [ ] **8.3** Unread count shows in bell icon
- [ ] **8.4** Clicking notification navigates to session
- [ ] **8.5** Can mark notifications as read
- [ ] **8.6** Email notifications send when enabled

### Edge Cases
- [ ] **8.7** Nudge notification respects 12-hour cooldown
- [ ] **8.8** Email fails gracefully if not configured
- [ ] **8.9** Notification preferences persist correctly
- [ ] **8.10** Old notifications paginate properly

---

## 9. Proposed Times

### Golden Path
- [ ] **9.1** User can propose alternative time
- [ ] **9.2** Proposed time shows date and time range
- [ ] **9.3** Other users can vote for proposed time
- [ ] **9.4** Vote toggle works (vote/unvote)
- [ ] **9.5** Proposer name displayed

### Edge Cases
- [ ] **9.6** Cannot propose time for locked session
- [ ] **9.7** Invalid time format rejected
- [ ] **9.8** Proposer can delete their proposal
- [ ] **9.9** Past dates handled appropriately

---

## 10. Performance & Reliability

### Checklist
- [ ] **10.1** Page load under 3 seconds on 3G
- [ ] **10.2** API responses under 500ms (p95)
- [ ] **10.3** No memory leaks on long sessions
- [ ] **10.4** Graceful degradation without WebSocket
- [ ] **10.5** Database connection pool doesn't exhaust
- [ ] **10.6** Error boundaries catch React crashes

---

## 11. Security

### Checklist
- [ ] **11.1** Passwords hashed with bcrypt
- [ ] **11.2** Session cookies are httpOnly
- [ ] **11.3** CSRF protection enabled
- [ ] **11.4** No sensitive data in error messages
- [ ] **11.5** API keys not exposed to frontend
- [ ] **11.6** Input sanitized to prevent XSS
- [ ] **11.7** Rate limiting on auth endpoints

---

## Sign-off

| Tester | Date | Status |
|--------|------|--------|
| | | |
| | | |

### Notes
_Add any additional observations or issues discovered during testing here._
