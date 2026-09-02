# Phase 7 Classroom contract audit

This audit records the Classroom behavior that must survive the Nocturne V2
visual migration. It was completed before changing the room UI.

## Entry authorization and room timing

- `apps/web/src/app/room/layout.tsx` requires an authenticated session but is
  only a UX guard. Both `GET /bookings/:bookingId` and
  `POST /bookings/:bookingId/join` enforce authorization on the API.
- Booking details are returned only when the current user is the booking's
  student or teacher. The join endpoint repeats that participant check before
  revealing status or timing details.
- Only `CONFIRMED` and `IN_PROGRESS` bookings are joinable. Paid-pending,
  expired, cancelled, completed, and no-show states receive status-specific
  errors and no Jitsi token.
- `roomState` and `roomWindow` from `@music/shared` are the single room-window
  implementation used by both API and web. The half-open entry window is
  `[scheduledAt - 10 minutes, endsAt + 15 minutes)`.
- Before that window, the API returns `ROOM_NOT_OPEN` plus the absolute
  `opensAt`; at or after the closing edge it returns `ROOM_CLOSED`. A Jitsi JWT
  is only issued inside the window, with matching `nbf` and `exp` claims.
- The current web page requests a ticket immediately, displays the server
  `opensAt` countdown when early, and retries automatically once that absolute
  instant is reached. The browser clock only drives presentation; the API is
  authoritative.

## Role behavior

- `BookingDetail.role` is derived on the API by comparing the current user to
  the booking's student, and the join ticket's `moderator` is derived by the
  Classroom service from that same booking relationship.
- No Classroom behavior depends on `user.teacherProfileId`. This supports
  dual-role accounts safely.
- The teacher receives the Jitsi moderator JWT claim. The student does not.
- There is no separate application endpoint for a teacher to end or complete a
  session. Therefore a custom "end class" action must not pretend to perform a
  booking transition.

## Media, peer, and signaling implementation

- Media and peer connections live inside a same-deployment Jitsi IFrame API
  instance loaded from the ticket's server domain. Signaling is Jitsi/XMPP;
  WebRTC/P2P or bridge selection and transient reconnects are managed by Jitsi,
  not by application polling or a custom frontend peer connection.
- The ticket's server-owned `config` is passed unchanged to
  `configOverwrite`. It disables speech-oriented audio processing (AP, AEC,
  noise suppression, and automatic gain), keeps stereo, and uses a 128 kbps
  Opus target. Wired headphones are therefore a functional prerequisite.
- Microphone and camera permissions, availability, selection, mute/unmute,
  camera on/off, and screen sharing are real Jitsi capabilities. In the current
  implementation their UI and browser permission prompts are owned by the
  iframe; the host page does not call `getUserMedia` or infer permission state.
- Jitsi's documented IFrame API exposes `toggleAudio`, `toggleVideo`,
  `toggleShareScreen`, and `hangup`, plus matching audio/video/share status and
  media error events. Host controls may only be added when they are synchronized
  from those real events. Connection quality percentages, recording, chat,
  reactions, and raise-hand are not part of the application Classroom contract.
- The current host only presents script-load errors. Jitsi owns connecting,
  connected, counterpart presence, and reconnect UI internally. The host has no
  trustworthy connection-quality metric and must not display one.

## Attendance, leave, completion, and no-show

- `videoConferenceJoined` reports `JOINED`. The pre-migration page incorrectly
  reported the current user as `LEFT` when a remote `participantLeft` event
  arrived. The migrated page only maps local `videoConferenceLeft` and
  `readyToClose` events to `LEFT`; `readyToClose` then navigates to the
  booking-role-appropriate dashboard.
- A first `JOINED` sets `actualStartedAt`, records the correct side's joined
  timestamp, and moves `CONFIRMED` to `IN_PROGRESS`. Repeated joins do not move
  the first timestamps.
- `LEFT` only updates `actualEndedAt` for an already `IN_PROGRESS` booking. It
  does not complete the booking. A normal leave can be followed by re-entry
  while the entry window remains open.
- Verified Jitsi/Prosody hook events are written separately from client reports
  and are preferred for attendance decisions when present.
- A minute sweep closes sessions only after the configured 15-minute grace.
  Both attended becomes `COMPLETED`; teacher-only becomes `NO_SHOW_STUDENT`;
  student-only becomes `NO_SHOW_TEACHER`; neither becomes `NO_SHOW`. Financial
  handling stays in the existing background workflow.

## Lifecycle, timers, reload, and cleanup

- The current session has no host timer. Any Nocturne timer must use the
  booking's absolute `scheduledAt`/`endsAt`, not page-load time. Wall-clock
  labels use Tehran formatters; countdowns remain duration math.
- The page has no visibility-change or before-unload behavior. Reload creates a
  fresh authorized ticket/API instance and a subsequent Jitsi join event;
  first-join timestamps remain idempotent.
- On effect cleanup/unmount, the host marks initialization cancelled and calls
  `api.dispose()`. The external API script loader is cached per Jitsi domain.
  No application timers survive unmount (`useNow` clears its interval).
- No custom reconnect loop, server polling, or browser-visibility listener
  exists. The visual migration must retain Jitsi's internal reconnect lifecycle
  and must not create duplicate API instances, listeners, or tracks.

## Signed-design capability decisions

- Preserve: focused full-viewport shell, real booking identity, honest waiting
  and error states, wired-headphone confirmation, mic/camera/share only when
  synchronized to Jitsi, absolute session timing, counterpart presence when
  derived from participant events, leave confirmation, and role-safe copy.
- Omit: fake avatars/previews, "sound ready" or "good connection" claims,
  fabricated elapsed time, custom notes/practice/session-file panels, chat,
  recording, reactions, raise hand, and any teacher "end class" control without
  a real end-session contract.
- Keep device selection and detailed media permission recovery inside Jitsi
  unless the host safely implements the documented device functions and error
  events. Do not duplicate a partial picker.

## Migration implementation notes

- The host control rail is disabled until Jitsi reports a real local join.
  Microphone and camera labels are synchronized from Jitsi mute events, and a
  control stays disabled if its initial state cannot be read.
- Screen share is only rendered when the browser exposes `getDisplayMedia`;
  the actual capture and share lifecycle remains owned by Jitsi.
- Participant presence is derived from Jitsi participant events/count, not from
  booking status. Connection quality is deliberately not claimed.
- Media permission/device errors remain visible and point to Jitsi's complete
  in-frame device settings. The host does not claim that permission was granted.
- The leave confirmation states the real reversible semantics. It asks Jitsi
  to hang up, reports only the local leave, and returns to the destination
  derived from `BookingDetail.role`; no completion transition is introduced.
