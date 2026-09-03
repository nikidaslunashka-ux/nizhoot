# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Node.js + Express + Socket.io with in-memory game state; vanilla HTML, CSS, and JavaScript frontend (served directly from Express without build step/bundlers); Google Spreadsheet (CSV publish-to-web / Google Sheets API) for quiz data; QR code generation via `qrcode` library; targeted for zero-cost deployment on Render or Railway free tier.

## Users

- **Host / Facilitator (Staf Kantor / Trainer):** Operates `/host` on a laptop connected to a projector or large screen in training/bimtek rooms. Controls quiz selection, room PIN, player lobby, and manual pacing of questions.
- **Participants (Peserta Bimtek / Karyawan):** Joins via mobile phone browser at `/player` by scanning a QR code or entering a PIN. Interacts using an ultra-responsive 4-button color/shape controller without needing app installations or account logins.
- **Quiz Content Creator / Admin:** Office staff who create and edit quiz question sets directly in Google Spreadsheets without editing code.

## Product Purpose

Provide a lightweight, free, self-hosted real-time multiplayer quiz game for internal office training and bimtek sessions, delivering the high-engagement, competitive game-show experience of Kahoot without commercial licensing fees or participant caps.

## Positioning

A zero-friction, internal-first interactive quiz platform that runs on free-tier cloud infrastructure with zero database overhead. Non-technical trainers manage question banks directly in Google Sheets, attendees join in seconds via QR scan on their phone browsers, and the host retains complete pacing control over the room.

## Operating Context

- **Environment:** Internal office bimtek, training seminars, workshops, and meeting rooms.
- **Physical Dynamics:** Dual-screen dynamic. The host laptop connects to a projector/large monitor displaying questions, media embeds, timer countdowns, and live leaderboards. Attendees sit in the room holding smartphones in portrait orientation, watching the projector and tapping response shapes on their screens.
- **Network / Hardware:** Wi-Fi or cellular data on participants' smartphones. Free-tier cloud hosting (Render/Railway) where server sleep/spin-up latency must be gracefully handled with loading and reconnection states.

## Capabilities and Constraints

- **Capabilities:**
  - Real-time room orchestration via Socket.io with unique 4-6 digit game PIN and auto-generated QR code for `/player?pin=XXXX`.
  - Dual synchronized interfaces:
    - `/host`: Projector view featuring big PIN/QR waiting room, question display, image/YouTube embed support, countdown timer per question, real-time answer distribution stats, and animated podium leaderboard.
    - `/player`: Mobile-optimized game pad with 4 large colored geometric buttons (no question text on phone to keep focus on projector).
    - `/admin`: Lightweight dashboard to inspect loaded quiz sets and test spreadsheet data connections.
  - Google Spreadsheet loader parsing custom quiz columns (`question`, `option_a-d`, `correct_answer`, `duration_seconds`, `image_url`, `video_url`, `quiz_set`) with row validation and fallback skip.
  - Manual host progression (start game, advance to next question, skip/repeat).
  - Speed + accuracy scoring formula with instant visual and haptic/sound feedback on participant devices.
  - Audio management: Lobby music, countdown suspense audio, and victory sound effects (royalty-free assets).
- **Constraints:**
  - In-memory state on the server (resets if the server instance restarts).
  - No client-side bundler or frontend framework; plain HTML/CSS/JS served directly by Express.
  - Player interface must strictly avoid showing question/answer text to ensure participants look at the projector.
  - Spreadsheet changes via CSV publish-to-web take a few minutes to propagate from Google's CDN.

## Brand Commitments

- **Name:** Nizhoot
- **Voice & Tone:** Energetic, competitive, playful, clear, and professional for corporate learning environments.
- **Auditory Identity:** Upbeat waiting room lobby loop, ticking suspense music during question timers, celebratory chimes on correct answers, and grand fanfare for final podium reveals (royalty-free).

## Evidence on Hand

- Project specification document: [`prompt-kuis-interaktif-antigravity_1.md`](file:///f:/Nizhoot/prompt-kuis-interaktif-antigravity_1.md).
- Expected Google Spreadsheet data schema and column structures.

## Product Principles

1. **Attention Lives in the Room:** The participant's phone is strictly an ergonomic controller; all questions, media, timers, and social drama take place on the projector.
2. **Zero-Friction Entry:** No logins, no app store friction; attendees scan the room QR code, input their nickname, and enter the lobby in under five seconds.
3. **Non-Technical Content Ownership:** Trainers manage quiz questions in Google Sheets with zero code interaction or technical barriers.
4. **The Facilitator Controls the Pace:** The game never rushes ahead on autopilot; the facilitator orchestrates question reveals, discussions, and leaderboard milestones.
5. **Resilient Simplicity:** Single Node.js server with zero database overhead, fast in-memory Socket.io synchronization, and clean vanilla web assets.

## Accessibility & Inclusion

- **Shape + Color Dual Encoding:** Player response buttons pair distinct colors (e.g. Red, Blue, Yellow, Green) with distinct geometric shapes (Triangle, Diamond, Circle, Square) so participants with color-vision deficiencies can participate seamlessly.
- **Touch-First Mobile Ergonomics:** Large thumb-friendly tap targets and high contrast indicators for quick, fatigue-free response during fast-paced countdowns.
