# Phase 5B Design QA

## Evidence

- Source visual truth: the five signed-off `.dc.html` exports for Dashboard, Practice, Notifications, Profile, and Session File under `design-reference/Modern educational website/`.
- Browser-rendered implementation: the corresponding local Next.js routes using an authenticated student account and real local API data.
- Browser: local Google Chrome 151 headless through the Chrome DevTools protocol; no Playwright.
- Paired comparison inputs:
  - `/tmp/phase5b-comparison-390.png`
  - `/tmp/phase5b-comparison-768.png`
  - `/tmp/phase5b-comparison-1280.png`
- Individual source and implementation captures use `/tmp/phase5b-{route}-{width}[-ref].png`; machine-readable route, overflow, and console results are in `/tmp/phase5b-qa-results.json`.

The `.dc.html` files depend on an editor runtime, so their signed-off markup and bundled design-system CSS were flattened into temporary static browser documents for capture. Prototype interpolation labels remain visible where the export expects editor state; they were treated as content placeholders, while layout, responsive behavior, typography hierarchy, surfaces, borders, controls, and tokens remain directly inspectable.

## Viewports and normalization

| Target | CSS viewport | Source pixels | Implementation pixels | Device scale factor |
| --- | ---: | ---: | ---: | ---: |
| Mobile | 390 × 844 | 390 × 844 | 390 × 844 | 1 |
| Tablet | 768 × 960 | 768 × 960 | 768 × 960 | 1 |
| Desktop | 1280 × 900 | 1280 × 900 | 1280 × 900 | 1 |

All captures use RTL layout, dark theme, browser content only, and exact matching viewport dimensions. No density resampling was used.

## States and interactions covered

- Dashboard: authenticated student, real upcoming and past bookings, monthly-package grouping, and completed/no-show presentation.
- Practice: the genuine local empty state. The local database has no student assignment records, so populated assignment, submission, feedback, and manual-completion browser states were not fabricated. Grouping and independent completion semantics are covered by unit tests.
- Notifications: real mixed notifications grouped into Today/This Week/Older, filters visible, unread affordances present, and no invented event facts.
- Profile: real user with an existing password, locked phone field, name/avatar controls, and the password-change entry point. OTP-only setup and success/error variants were not available without mutating account state; password policy and API error mapping are covered by unit tests.
- Session File: a real past student booking with the genuine no-learning-content state. Populated attachments, submissions, feedback, and media were unavailable in local data and were not invented.
- Existing booking payment, credit, cancellation, classroom, Session File media, and teacher-only controls were preserved in code and typechecked; this QA did not create new financial or learning records solely to force visual states.

## Full-view comparison

The three combined sheets were opened at original resolution and reviewed route by route. Across mobile, tablet, and desktop, the implementation matches the signed-off Nocturne hierarchy: shared app bar behavior, 1080px content measure, RTL alignment, restrained surface borders, wood section rules, violet interactive accents, ivory typography, responsive full-width mobile actions, and desktop whitespace.

Dynamic content differs intentionally from prototype placeholders. Dashboard shows all real package sessions rather than one sample card; Notifications shows the account's real feed; Practice and Session File correctly collapse to their real empty states. These are domain-state differences, not visual drift.

## Focused-region comparison

The original-resolution individual captures were used to inspect headers, section labels, card padding, dividers, Persian line wrapping, filter rows, avatar fallbacks, button radii, status colors, and responsive navigation. No clipped text, sticky-header overlap, broken crop, or horizontal overflow was found. All fifteen implementation captures reported `scrollWidth === clientWidth`.

## Console and runtime checks

- All five implementation routes remained authenticated and resolved to their requested URL at every viewport.
- No application runtime exception was captured.
- One first-load 404 occurred on the mobile Dashboard capture for an absent static resource; it did not recur and produced no visible defect. The reference captures also report missing prototype-only file assets, which are not implementation failures.
- The circular `N` visible at the lower-left edge of development screenshots is the Next.js development indicator, not product UI.

## Findings

- No actionable P0, P1, or P2 visual findings remain for the realistic states available locally.
- [P3] Add a project favicon/static icon separately if desired; the first Dashboard load requested one missing static resource.
- Coverage gap: populated Practice/Session File learning data, OTP-only password setup, password success/error banners, dashboard pending-payment, and notification empty state need seeded fixtures or naturally occurring local data for additional browser-state coverage.

## Comparison history

1. Initial direct `file://` source captures were blank because the `.dc` editor runtime could not fetch its own document under Chrome file security.
2. The source markup and bundled design-system CSS were flattened into temporary static documents; the second capture rendered all five references at all three viewports.
3. Source and implementation screenshots were placed side by side in the same 390, 768, and 1280 comparison inputs and reviewed at original resolution. No P0/P1/P2 correction cycle was required.

## Implementation checklist

- [x] Capture all five routes at 390 × 844, 768 × 960, and 1280 × 900.
- [x] Pair each implementation capture with its signed-off source at the same viewport.
- [x] Verify authentication, requested-route retention, console output, and horizontal overflow.
- [x] Use realistic local student data without adding fake product records.
- [x] Preserve real booking, notification, profile, password, practice, and Session File behavior.
- [x] Run focused web/shared tests, workspace typecheck, and diff whitespace checks.

## Follow-up polish

- Add purpose-built local fixtures for the explicitly unavailable populated/error/success states if exhaustive screenshot coverage becomes a release gate.

final result: passed

---

# Archived Phase 4B Design QA

## Evidence

- Source visual truth:
  - `design-reference/Modern educational website/Hygge Booking.dc.html`
  - `design-reference/Modern educational website/Hygge Payment Result.dc.html`
- Browser-rendered implementation:
  - `/tmp/phase4b-book-390-v2.png`
  - `/tmp/phase4b-book-768-v2.png`
  - `/tmp/phase4b-book-1280-v2.png`
  - `/tmp/phase4b-payment-390.png`
  - `/tmp/phase4b-payment-768.png`
  - `/tmp/phase4b-payment-1280.png`
- Source captures:
  - `/tmp/phase4b-ref-book-390.png`
  - `/tmp/phase4b-ref-book-768.png`
  - `/tmp/phase4b-ref-book-1280.png`
  - `/tmp/phase4b-ref-payment-390.png`
  - `/tmp/phase4b-ref-payment-768.png`
  - `/tmp/phase4b-ref-payment-1280.png`
- Combined comparison input: `/tmp/phase4b-visual-comparison.png`
- Browser: local Google Chrome headless through the Chrome DevTools protocol (no Playwright).

## Viewports and normalization

| Target | CSS viewport | Source pixels | Implementation pixels | Device scale factor |
| --- | ---: | ---: | ---: | ---: |
| Mobile | 390 × 844 | 390 × 844 | 390 × 844 | 1 |
| Tablet | 768 × 960 | 768 × 960 | 768 × 960 | 1 |
| Desktop | 1280 × 900 | 1280 × 900 | 1280 × 900 | 1 |

All captures use the dark theme, RTL document direction, browser content only, matching viewport pixels, and no browser chrome. No density resampling was needed.

## States and interactions tested

- Booking: authenticated student, real catalog data, single-session flow, step 4 with a real availability window and slots, plus step 5 review.
- Payment Result: the server-authoritative successful gateway state produced by completing a real local booking and fake-gateway callback.
- Primary interactions: instrument selection, teacher selection, session-type selection, real date/time selection, review, booking confirmation, checkout handoff, result polling/reload, and dashboard destination.
- Deeplink, fallback, trial eligibility, package preview/conflict, credit-only result URL, and result-state mapping are covered by the accompanying unit tests.
- Console check: no application runtime exceptions on Booking or Payment Result reload. The only console error was the pre-existing missing `/favicon.ico` request.

## Full-view comparison

The combined 1280 × 900 comparison was opened and reviewed as one image. Booking preserves the reference hierarchy, stepper, summary card, decision area, actions, dark surface palette, and restrained borders. Payment Result preserves the reference status hierarchy, result summary, payment details, and primary destination. The implementation intentionally omits the reference prototype-state switcher and renders only facts returned by the real DTO.

Responsive captures were checked at 390, 768, and 1280. Mobile uses the compact five-segment progress rail and full-width actions; tablet stacks the summary before the decision area; desktop places the decision area on the right and the sticky summary on the left.

## Focused-region comparison

No separate crop was required after the full-size source and implementation captures were opened at original resolution: the stepper, summary card, date/slot controls, result card, payment rows, typography, borders, and actions were readable in the original captures. The combined image was used for composition and hierarchy; the individual original-resolution images were used for small text and control details.

## Required fidelity surfaces

- Fonts and typography: Vazirmatn, weights, responsive heading scale, body hierarchy, RTL alignment, line height, and wrapping match the source language. No truncation or overlap was observed.
- Spacing and layout rhythm: page width, major gaps, card padding, radii, dividers, action spacing, and responsive stacking follow the reference. The real 14-day availability rail is intentionally wider than the five-day prototype sample.
- Colors and visual tokens: existing Nocturne background, surface, ink, violet, wood, divider, success, error, and metadata tokens are used consistently.
- Image quality and asset fidelity: no fake or generated visible assets were introduced. The successful local order had no teacher avatar in its server DTO, so the implementation correctly omitted an image instead of inventing one.
- Copy and content: canonical product terms are used. Real teacher, instrument, duration, slot, amount, payment method, and tracking data replace prototype copy. The result page does not infer state from URL parameters.

## Findings

- No actionable P0, P1, or P2 visual findings remain.
- [P3] The app requests a missing `/favicon.ico`; this does not affect either flow or its visible layout.

## Comparison history

1. Initial desktop Booking comparison found a P2 layout mismatch: the summary card appeared on the right, while the RTL source places the main decision area on the right and the summary on the left. Evidence: `/tmp/phase4b-book-1280.png` against `/tmp/phase4b-ref-book-1280.png`.
2. Fix: replaced the overlapping responsive order utilities with a stable default desktop `order-last` and `max-[900px]:order-first` for stacked tablet layout in `BookingSummary`.
3. Post-fix evidence: `/tmp/phase4b-book-1280-v2.png`, `/tmp/phase4b-book-768-v2.png`, and `/tmp/phase4b-book-390-v2.png`. Computed desktop order and bounds were checked in Chrome; the summary is left on desktop, first on tablet, and hidden on mobile as intended.
4. The revised Booking and Payment Result captures were compared with the source in `/tmp/phase4b-visual-comparison.png`; no further P0/P1/P2 differences were found.

## Implementation checklist

- [x] Match desktop Booking content/summary order to the RTL source.
- [x] Verify Booking at 390, 768, and 1280.
- [x] Complete a real local single-session booking through checkout.
- [x] Verify the server-authoritative successful Payment Result at 390, 768, and 1280.
- [x] Check browser runtime errors and primary interactions.
- [x] Re-run web tests, workspace typecheck, and diff whitespace checks.

## Follow-up polish

- Add a project favicon separately if desired; it is outside Phase 4B.

final result: passed
