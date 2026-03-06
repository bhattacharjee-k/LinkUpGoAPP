LinkUp Go — Bug Fix Instructions for Claude Code
Before starting, read the existing codebase to understand the current architecture, data models, and APIs in use.
Do not make assumptions about the stack — infer everything from the existing code.

Bug 1 — No-Results Crash: Add Error State + Navigation Back to Filters
Problem: When the suggestion engine returns no results, the app crashes instead of handling it gracefully.
Fix:
Catch the empty/null results case in the suggestions logic and render a dedicated error state UI instead of
crashing.
The error state should clearly tell the user no suggestions were found and prompt them to adjust their
filters.
Include a button or action that navigates the user back to the filter/preference screen (wherever filters are
set before suggestions are fetched). Do not just pop the screen — navigate explicitly to the filter screen so
the user can make changes.
Ensure no unhandled exceptions propagate from this flow.

Bug 2 — New Member Join: Real-Time Update Failure + Session Not Found on Refresh
Problem: When a new member joins a plan, the UI doesn't update in real time. On manual refresh, the app
crashes with a "session not found" error.
Fix:
Identify where plan membership is stored and how session/plan state is loaded on app start or screen
focus.
Ensure new member joins are broadcast/subscribed to in real time (use whatever real-time mechanism is
already in the codebase — e.g. sockets, listeners, subscriptions).

Fix the session lookup so that if a session or plan ID exists in local state but is not yet loaded, the app re-
fetches it rather than throwing a "not found" error.

Add a fallback: if the session truly no longer exists, show a clear error message and navigate the user to a
safe screen (e.g. home/plans list) rather than crashing.

Bug 3 — Add Transportation Mode per User; Factor into Proximity
Problem: No transportation method is collected per user, and proximity filtering doesn't account for how users
are travelling.
Fix:
Add a transportation mode selector to the user profile or plan-joining flow, with three options: Car, Walk,
Public Transit.
Store the selected mode per user (tied to their profile or their participation in a plan).
When calculating proximity/filtering suggestions, factor in both distance and estimated travel time
based on transportation mode. Use approximate thresholds — you can define sensible defaults (e.g.
walking: prioritise under 1 mile / ~20 min, transit: under 5 miles / ~30 min, car: under 15 miles / ~25
min) — but adjust these to match any existing distance logic already in the codebase.
If users in the same plan have different transportation modes, use the most restrictive constraint (i.e. the
mode with the smallest practical range) as the filtering baseline, or take the average — use whichever
approach fits better with the existing proximity model.

Bug 4 — Active Plans Card: Fix Name/Plan Title Layout
Problem: In Active Plans cards, the user's name appears in bold large text and the plan name appears in small
text. This is reversed.
Fix:
Update the Active Plans card component so that:
Plan name is displayed in bold, large text (primary/title position)
User name is displayed in smaller text below it (secondary/subtitle position)
Reference the screenshot in the bug report: the current layout shows "Kunal Bhattacharjee" bold and
large, with the plan name (e.g. "rushi's birthday") in small text next to the PLANNING badge — this
needs to be corrected.
Do not change card structure, spacing, or other visual elements — only fix the text hierarchy.

Bug 5 — "Details" Button: Open Google Maps Instead of Website
Problem: The "Details" button on a venue card opens the venue's website. It should open Google Maps.
Fix:

Find the Details button handler and change it to construct a Google Maps URL for the venue location.
Use the venue's coordinates or address (whichever is already available in the data model) to build the
URL.
Coordinates: https://www.google.com/maps/search/?api=1&query={lat},{lng}
Address: https://www.google.com/maps/search/?api=1&query={encoded_address}
Open this URL in the device's default maps app or browser (use whatever deep-link/URL-open pattern is
already used in the codebase).
Remove or replace the website link behaviour entirely — do not keep both.

Bug 6 — Remove Ticketmaster API; Keep Venues Only
Problem: The Ticketmaster API integration is unused and not working as intended for filtering specific events.
Fix:
Remove all Ticketmaster API calls, imports, keys, and related logic from the codebase.
Remove any event-specific filtering that was built around Ticketmaster data.
Ensure the suggestion/search flow continues to work correctly using venue data only — no events, no
Ticketmaster references.
Clean up any dead code, unused dependencies, or config keys left behind.

Bug 7 — Auto-Widen Search When New Members Cause a Filtering Conflict
Problem: When new members join a plan, their preferences or location may cause the current filter criteria to
return no results, breaking the suggestion flow.
Fix:
After a new member joins, re-run the suggestion/filter logic with the updated group.
If the result set is empty, automatically widen the search incrementally:
1. Increase the search radius by a fixed step (e.g. +0.5 or +1 mile — use whatever unit is already in
the codebase).
2. Re-run the query.
3. Repeat until results are found, up to a reasonable maximum radius (e.g. 3–4 increments).
4. If still no results after max increments, fall back to the error state defined in Bug 1 and prompt
users to adjust their filters.

Do not silently widen without limit — cap the expansion and always inform users if manual intervention
is needed.
This widening should only trigger on member joins, not on every filter run.