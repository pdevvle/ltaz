# Twilio call flow for 623-400-5499

The website's public number, **623-400-5499**, is a Twilio number. This
directory holds the Twilio Functions that answer it:

| Function | Role |
|---|---|
| `functions/incoming-call.js` | Answers; reads the menu in hours, routes to voicemail out of hours |
| `functions/handle-selection.js` | Logs the pressed digit; dials the cell (1–3) or hands off to voicemail (4) |
| `functions/dial-status.js` | After the dial: hangs up if answered, otherwise routes to voicemail |
| `functions/voicemail.js` | Voicemail prompt (time-of-day aware) + recording, with transcription |
| `functions/voicemail-done.js` | Logs the recording, thanks the caller, hangs up |
| `functions/voicemail-notify.js` | Texts the transcription + listen link to the cell |
| `functions/business-hours.private.js` | The hours and both greeting scripts, shared by the two above |

## The flow

What a caller hears depends on the time of day in Arizona
(`America/Phoenix`, which never shifts for daylight saving). **Business
hours are 7am to 7pm, every day.**

### In hours

A call to 623-400-5499 hears:

> "Thank you for calling Lee's Tree Service, Irrigation, and Landscaping.
> Press 1 if you're calling regarding a new project. Press 2 about an
> existing job. Press 3 for anything else. Press 4 to leave a voicemail."

- **1, 2, or 3** → "Connecting you now" → rings the recipient's cell,
  **+1 623-282-0110**. The three options all connect to the same place; they
  exist so the Function logs show *why* people call.
- **4** → voicemail (below).
- **Nothing pressed** → connected anyway after the 8-second gather timeout
  (logged as `no selection`).
- **Any other digit** → menu replays once with a shorter re-prompt.

The dial gives up after **12 seconds** — deliberately, because the cell's
carrier voicemail picks up at ~14 seconds. Unanswered calls therefore come
back to Twilio and land in **our** voicemail (with transcription and SMS
notification) instead of the cell's carrier voicemail.

### Out of hours

Before 7am or after 7pm there is **no menu and no attempt to ring anyone**.
The call goes straight to voicemail, which opens with the alternate
greeting naming the hours. The caller records a message and it arrives by
SMS exactly as an in-hours voicemail does.

Note this means an after-hours emergency — storm damage, a fallen tree —
reaches voicemail rather than a person. If you want a way through, the
natural shape is a "press 9 to reach someone now" option on the after-hours
greeting; say the word and it's a small addition.

### Voicemail

The greeting depends on the same 7am-7pm window. In hours:

> "All of our staff are currently busy. Please leave a brief voicemail
> regarding your project and we will provide you service as soon as possible."

Outside those hours:

> "Thank you for your call. Our typical phone hours are 7am to 7pm everyday,
> but if you leave your name, number, and project details, we will give you
> service as quickly as a staff member is available."

Either way the caller then hears *"Please begin after the tone, and press
pound when you are finished"* so they know when to speak.

Every route into voicemail gets the greeting for the current time —
pressing 4, an unanswered forward, and an out-of-hours call alike.

The hours and both scripts live in **`functions/business-hours.private.js`**
(`OPEN_HOUR`, `CLOSE_HOUR`, `DURING_HOURS`, `AFTER_HOURS`), so changing the
window moves the greeting *and* the call routing together. If that file is
ever missing from the service, both callers of it log the failure and fall
back to treating the line as open — a deploy mistake will not silently send
every caller to voicemail.

The caller can record up to 2 minutes (Twilio's transcription limit) and
finish with `#`. When the transcription is ready — usually under a minute
after hangup — the cell gets an SMS from 623-400-5499:

```
New voicemail from +1602…:
"transcribed message text"
Listen: https://api.twilio.com/…/Recordings/RE….mp3
```

Recordings also remain listed in the Twilio Console under
**Monitor → Recordings**.

## Configuration

- **`FORWARD_TO`** (optional env var, E.164 e.g. `+16025551234`) — overrides
  both the dial destination and the SMS notification destination. Defaults
  to `+16232820110`. Set it in the service's Environment Variables to
  re-route calls without a code change.
- **`TTS_VOICE`** (optional env var) — the synthesized voice for every
  prompt. Defaults to **`Polly.Joanna-Generative`**, Amazon Polly's
  generative engine, which is the most natural of the three tiers Twilio
  offers (basic → neural → generative) and the one that reads the longer
  voicemail greetings without sounding clipped. Generative voices are billed
  at a higher per-character rate than neural and are still Public Beta at
  Twilio, so if you'd rather not use them set this to
  `Polly.Joanna-Neural` — same voice, cheaper engine, no code change.
  `Polly.Matthew-Generative` and `Polly.Ruth-Generative` are the other
  natural-sounding en-US options; `Google.en-US-Chirp3-HD-*` is Google's
  equivalent tier.
- **Caller ID.** The forwarded leg presents 623-400-5499, not the caller's
  number, so business calls are recognizable on the cell.
- **`answerOnBridge`.** The caller hears ringing until the cell actually
  answers, instead of Twilio answering immediately and playing silence.
- **SMS.** The notification sends from the Twilio number itself, which must
  be SMS-capable (US numbers may also need an A2P 10DLC registration for
  reliable delivery). If the SMS fails the voicemail is still recorded and
  visible in the Console; the failure is logged.
- **Recording links.** The `.mp3` link in the SMS plays in the phone's
  browser. It is unauthenticated unless "HTTP auth on media URLs" is
  enabled in the account's Voice settings — leave that off, or the link
  will prompt for credentials.

## Deploy (Twilio Console, no CLI)

1. In the Twilio Console go to **Functions and Assets → Services** and create
   a service (e.g. `lees-trees-ivr`).
2. Add six Functions with these paths, pasting in the matching file from
   `functions/`: `/incoming-call`, `/handle-selection`, `/dial-status`,
   `/voicemail`, `/voicemail-done`, `/voicemail-notify`. Set all of them to
   **Public** visibility (Twilio's webhooks call them directly).
3. Add a seventh Function at `/business-hours` holding
   `business-hours.private.js`, and set it to **Private** — it is shared
   code, not a webhook target. (With the Serverless Toolkit the
   `.private.js` filename does this automatically.) The path must be
   exactly `business-hours`; that is the key the other two look it up by.
4. (Optional) Under **Environment Variables** add `FORWARD_TO` and/or
   `TTS_VOICE`.
5. **Deploy All**.
6. Go to **Phone Numbers → Manage → Active Numbers → (623) 400-5499**, and
   under **Voice Configuration** set *A call comes in* to **Function**, pick
   the service, environment, and `/incoming-call`. Save.

## Deploy (Twilio CLI)

```sh
npm install -g twilio-cli
twilio plugins:install @twilio-labs/plugin-serverless
cd twilio
twilio serverless:deploy
# then point the number at the deployed /incoming-call URL:
twilio phone-numbers:update +16234005499 --voice-url=<deployed incoming-call URL>
```

## Testing

Call 623-400-5499:

- Press **1** → "Connecting you now" → 623-282-0110 rings showing
  623-400-5499 as the caller.
- Don't answer the cell → after 12 seconds the caller gets the voicemail
  greeting for the current time of day and can leave a message; the
  transcription SMS arrives on the cell shortly after they hang up.
- Call before 7am or after 7pm Arizona time → no menu at all; the alternate
  greeting plays and recording starts. Nobody's cell rings.
- To rehearse the out-of-hours path during the day, temporarily set
  `CLOSE_HOUR` to the current hour in `business-hours.private.js`, deploy,
  call, then put it back.
- Press **4** → straight to voicemail; same SMS afterward.
- Press **9** → menu replays with the "Sorry, I did not get that" prompt.
- Press nothing → after ~8 seconds the call connects anyway.

Selections appear in the service's **Logs** tab as
`menu selection: 1 (new project) from +1602…`.

## Relationship to the website tracking

The site's tap-to-call links and GTM conversion triggers all use
`tel:6234005499` (see `design/README.md`). Nothing here changes that: the
website keeps advertising 623-400-5499, and this flow is what happens after
someone dials it.
