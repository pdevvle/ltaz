# Twilio call flow for 623-400-5499

The website's public number, **623-400-5499**, is a Twilio number.
`functions/ivr.js` is the entire call flow — one Twilio Function that
answers the number and drives every step by calling itself with a `step`
query parameter.

What a caller hears depends on the time of day in Arizona
(`America/Phoenix`, which never shifts for daylight saving). **Business
hours are 7am to 7pm, every day.**

## In hours

A call to 623-400-5499 hears:

> "Thank you for calling Lee's Tree Service, Irrigation, and Landscaping.
> Press 1 if you're calling regarding a new project. Press 2 about an
> existing job. Press 3 for anything else. Press 4 to leave a voicemail."

- **1, 2, or 3** → "Connecting you now" → rings the recipient's cell,
  **+1 623-282-0110**. The three options all connect to the same place; they
  exist so the Function logs show *why* people call. The person answering
  hears *"Call from 6 0 2, 5 5 5, 1 2 3 4. Press any key to accept"* and
  must press a key — see **Call screening** below.
- **4** → voicemail (below).
- **Nothing pressed** → connected anyway after the 8-second gather timeout
  (logged as `no selection`).
- **Any other digit** → menu replays once with a shorter re-prompt; a
  second invalid digit connects the call rather than looping the menu.

The dial gives up after **12 seconds** — deliberately, because the cell's
carrier voicemail picks up at ~14 seconds. Unanswered calls therefore come
back to Twilio and land in **our** voicemail (with transcription and SMS
notification) instead of the cell's carrier voicemail.

### Call screening

Declining a call on a cell phone does not return a busy signal on most US
carriers — it hands the call to the *carrier's* voicemail, which answers.
Twilio sees an answered call and reports `DialCallStatus: completed`, so
without screening the caller would end up in the phone's own voicemail:
no transcription, no SMS, and a message nobody is watching for.

`<Number url="…">` fixes that. When the cell picks up, Twilio plays the
screening prompt **to the recipient only** while the caller keeps hearing
ringing (that is what `answerOnBridge` is for). Pressing any key bridges
the call. Carrier voicemail cannot press a key, so a declined call, a
powered-off phone, or a full mailbox all fall through to our voicemail.

Because a screened-out call may still be reported as `completed`, the
dial-status step also requires the bridge to have lasted at least
`MIN_CONNECTED_SECONDS` (20) before it treats the call as answered. Every
call logs its real `status=` and `duration=`; check a few and tune the
constant if 20 is wrong for how this line is actually used.

## Out of hours

Before 7am or after 7pm there is **no menu and no attempt to ring anyone**.
The call goes straight to voicemail, which opens with the alternate
greeting naming the hours. The caller records a message and it arrives by
SMS exactly as an in-hours voicemail does.

Note this means an after-hours emergency — storm damage, a fallen tree —
reaches voicemail rather than a person. If you want a way through, the
natural shape is a "press 9 to reach someone now" option on the after-hours
greeting; it's a small addition.

## Voicemail

The greeting follows the same 7am-7pm window. In hours:

> "All of our staff are currently busy. Please leave a brief voicemail
> regarding your project and we will provide you service as soon as possible."

Outside those hours:

> "Thank you for your call. Our typical phone hours are 7am to 7pm everyday,
> but if you leave your name, number, and project details, we will give you
> service as quickly as a staff member is available."

The beep follows immediately — the caller is not told to press anything.
Recording ends on 5 seconds of silence (Twilio's `<Record>` default) or on
hangup, and `#` still works even though it is not announced. `finishOnKey`
is narrowed from Twilio's default of `1234567890*#` so a fumbled keypad
cannot cut someone off mid-message.

Every route into voicemail gets the greeting for the current time —
pressing 4, an unanswered or declined forward, and an out-of-hours call
alike. The caller can record up to 2 minutes (Twilio's transcription
limit).

### Notifications

When a voicemail is recorded, **Twilio calls the cell and plays it**:

> *"New voicemail from 6 0 2, 5 5 5, 1 2 3 4. Here it is."* → the recording
> → *"Again, that was from 6 0 2, 5 5 5, 1 2 3 4."*

This is deliberately a phone call and not a text. US long codes cannot send
application SMS until the number is registered for **A2P 10DLC**, which for
a sole proprietor means a brand registration with identity verification —
a lot of process for texting yourself. A voice call needs none of it, uses
the number you already have, and if the cell does not pick up the message
lands in its carrier voicemail, so it still gets through.

The notification is placed the moment recording stops, so nothing depends
on transcription succeeding.

Set a **`NOTIFY_BY`** environment variable to change this:

| Value | Behavior |
|---|---|
| `call` *(default)* | Ring the cell and play the message. No registration needed. |
| `sms` | Text a listen link, then the transcript as a follow-up. Requires A2P 10DLC. |
| `both` | Both. |

Transcription is only switched on when a text can actually carry it, so
`call` mode does not pay for transcriptions nobody will read.

Recordings also remain listed in the Twilio Console under
**Monitor → Recordings**.

### If a notification does not arrive

Open the service's **Logs** tab and look for the `SMS` line the Function
writes on every attempt:

| What you see | What it means |
|---|---|
| `notify call CA… placed to …` | The call went out. Check **Monitor → Logs → Calls** if the phone never rang. |
| `SMS SM… queued to …` | Twilio accepted it. If no text arrived, the carrier dropped it — check **Monitor → Logs → Messaging** for the delivery status and error code. |
| `SMS … FAILED: code=20003` | The service cannot authenticate. In the service's **Settings → General**, tick **Add my Twilio Credentials (ACCOUNT_SID) and (AUTH_TOKEN) to ENV**. |
| `SMS … FAILED: code=21606` | 623-400-5499 is not SMS-capable, or is not a number on this account. |
| `SMS … FAILED: code=21608` | Trial account — the destination must be a verified number. |
| `SMS … FAILED: code=30034` | **A2P 10DLC registration is missing.** US long codes must be registered before carriers will deliver application-sent SMS. Register the brand and campaign under **Messaging → Regulatory Compliance**. |
| no `notify` or `SMS` line at all | The step never ran. Confirm `/ivr` is deployed and the recording actually completed. |

`code=20003` and `code=30034` are the two usual suspects. 20003 is a
one-checkbox fix. 30034 is a carrier-side block on unregistered SMS that no
code can work around — which is exactly why the default is `call`.

## How the one Function stays one Function

`<Gather>`, `<Dial>` and `<Record>` each take an `action` URL, and
`<Redirect>` takes a URL. All of them point back at this same Function with
a different `step`:

| `step` | What it does |
|---|---|
| *(none)* | Answers: menu in hours, straight to voicemail out of hours |
| `selection` | A menu digit was pressed — log it, then dial or take a message |
| `dial-status` | The forwarded call ended — hang up if answered, else voicemail |
| `voicemail` | Play the greeting for the current time and record |
| `done` | Caller finished recording — thank them and hang up |
| `notify` | Transcription is ready — text it to the cell |

The self-URL is built from `context.DOMAIN_NAME` + `context.PATH` at
runtime, so the Function works at whatever path you give it. If those are
ever unset the URLs fall back to relative form, which Twilio resolves
against the current request.

## Configuration

Everything tunable is a constant at the top of `functions/ivr.js`
(`OPEN_HOUR`, `CLOSE_HOUR`, `GREETING`, `MENU`, `VOICEMAIL_OPEN`,
`VOICEMAIL_CLOSED`), plus two optional environment variables:

- **`FORWARD_TO`** (E.164, e.g. `+16025551234`) — overrides both the dial
  destination and the SMS notification destination. Defaults to
  `+16232820110`. Set it in the service's Environment Variables to re-route
  calls without a code change.
- **`TTS_VOICE`** — the synthesized voice for every prompt. Defaults to
  **`Polly.Joanna-Generative`**, Amazon Polly's generative engine, the most
  natural of the three tiers Twilio offers (basic → neural → generative).
  Generative voices bill at a higher per-character rate than neural and are
  still Public Beta at Twilio, so set this to `Polly.Joanna-Neural` for the
  same voice on the cheaper engine. `Polly.Matthew-Generative` and
  `Polly.Ruth-Generative` are the other natural-sounding en-US options;
  `Google.en-US-Chirp3-HD-*` is Google's equivalent tier.

Other behavior worth knowing:

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

## Deploy (Twilio Console)

1. **Functions and Assets → Services**, create a service (e.g.
   `lees-trees-ivr`).
2. Add **one** Function. Any path will do — `/ivr` is fine. Set it to
   **Public** so Twilio's webhooks can reach it, and paste in
   `functions/ivr.js`.
3. (Optional) Under **Environment Variables** add `FORWARD_TO` and/or
   `TTS_VOICE`.
4. **Deploy All**.
5. **Phone Numbers → Manage → Active Numbers → (623) 400-5499**. Under
   **Voice Configuration** set *A call comes in* to **Function**, pick the
   service, environment, and `/ivr`. Save.

### Deploy (CLI)

```sh
npm install -g twilio-cli
twilio plugins:install @twilio-labs/plugin-serverless
cd twilio   # the package.json here is what makes this a deployable project
twilio serverless:deploy
twilio phone-numbers:update +16234005499 --voice-url=<deployed /ivr URL>
```

## Testing

Call 623-400-5499:

- Press **1** → "Connecting you now" → 623-282-0110 rings showing
  623-400-5499 as the caller.
- Don't answer the cell → after 12 seconds the caller gets the voicemail
  greeting for the current time of day and can leave a message; the
  transcription SMS arrives on the cell shortly after they hang up.
- Press **4** → straight to voicemail; the cell rings back with the
  message a few seconds after you hang up.
- Answer the cell but press nothing → the caller lands in voicemail, not
  the carrier's. Same for declining the call outright.
- Press **9** → menu replays with the "Sorry, I did not get that" prompt;
  press **9** again → the call connects instead of looping.
- Press nothing → after ~8 seconds the call connects anyway.
- Call before 7am or after 7pm Arizona time → no menu at all; the alternate
  greeting plays and recording starts. Nobody's cell rings.
- To rehearse the out-of-hours path during the day, temporarily set
  `CLOSE_HOUR` to the current hour, deploy, call, then put it back.

Every step is logged in the service's **Logs** tab —
`menu selection: 1 (new project) from +1602…`, `after-hours call from … ->
voicemail`, `voicemail SMS sent to …`.
