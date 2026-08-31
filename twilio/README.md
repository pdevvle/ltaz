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
back to Twilio and land in **our** voicemail — transcribed and logged to
the website — instead of the cell's carrier voicemail.

### Call screening

Declining a call on a cell phone does not return a busy signal on most US
carriers — it hands the call to the *carrier's* voicemail, which answers.
Twilio sees an answered call and reports `DialCallStatus: completed`, so
without screening the caller would end up in the phone's own voicemail:
no transcript, nothing logged, and a message nobody is watching for.

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
greeting naming the hours. The caller records a message and it reaches the
website exactly as an in-hours voicemail does.

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

### Where voicemails go

Each voicemail is POSTed to **leestreesaz.com**, which stores it, shows it
on a PIN-protected page, and emails it out. See `ltaz-voicemail/` in this
repo for the WordPress side.

This deliberately avoids SMS. US long codes cannot send application text
messages until the number is registered for **A2P 10DLC** — for a sole
proprietor that means a brand registration with identity verification, and
an unregistered number simply has every message dropped by the carriers.
Posting to a site you already run needs none of that.

Twilio posts twice per message, both carrying the same `CallSid` so the
site keeps one record:

1. **When recording stops** — caller, duration, recording link. Sent here
   rather than from the transcription callback so a slow or failed
   transcription cannot cost the record entirely.
2. **When transcription finishes** — the text, added to the same entry.

Two environment variables on the service turn this on:

| Variable | Value |
|---|---|
| `WP_ENDPOINT` | `https://leestreesaz.com/wp-json/ltaz/v1/voicemail` |
| `WP_SECRET` | the same string as `LTAZ_VM_SECRET` in `wp-config.php` |

The endpoint must be `https` — the secret travels in a header, so the
Function refuses a plain-http URL rather than sending it in the clear. If
either variable is unset, the Function logs loudly and the voicemail is
recorded in Twilio but logged nowhere else.

### Every call reaches the operator, and the log

When a call reaches a terminal state, it is written to the website's call
log and the operator gets a text:

```
Call from (602) 555-1234 (0:42). No voicemail left.
```

The log page therefore shows **every** call, not only the ones that left a
message — a text scrolls away, a row does not. Calls appear tagged `call`
with no audio; voicemails keep their recording and transcript.

This matters more than it looks. The forwarded leg deliberately presents
623-400-5499 as caller ID so business calls are recognizable on the cell —
which means the phone's own call log shows the *business* number for every
call and never the person who rang. Without this text there is no way to
call someone back.

It covers the case nothing else can: a caller who hangs up during the menu
never reaches any step in the call flow, so only a call-status webhook sees
them.

Both the row and the text are suppressed when a voicemail was left, since
that record and its texts already carry the number. The Function asks Twilio whether the call has a recording rather
than tracking state; if that lookup fails it sends anyway, because a
duplicate text costs nothing and a lost phone number costs a job.

**This needs a second webhook on the phone number.** Under **Phone Numbers
→ Active Numbers → (623) 400-5499 → Voice Configuration**, set *Call status
changes* to the Function's URL with the step appended:

```
https://<your-service>.twil.io/ivr?step=call-status
```

It is a plain URL field, not a Function picker — copy the `/ivr` URL from
the Functions editor and add `?step=call-status`. Without it this feature
is simply inert; the rest of the flow is unaffected.

### Texting setup

A text can go out alongside the website record — an alert when recording
stops, the transcript when it is ready. Off unless configured. Set **one**
of these on the service:

| Variable | Value |
|---|---|
| `MESSAGING_SERVICE_SID` | `MG…` — a Messaging Service. The A2P-correct route, and it wins if both are set. |
| `SMS_FROM` | e.g. `+16234002911` — any SMS-capable number on the account. It does **not** have to be the number that took the call. |

`SMS_TO` overrides the destination; it defaults to `FORWARD_TO`.

Being SMS-*capable* is not the same as being **A2P 10DLC registered**.
Every US long code is capable — that is just the number's carrier
capability — but only a number attached to an approved campaign actually
delivers. An unregistered sender fails with `code=30034`, which is a
carrier-side block no code can work around. If one number on the account is
registered and another is not, the registration follows the campaign, so
either send from the registered number or add the other number to the same
Messaging Service.

Texting failures are logged and otherwise ignored: the website record is
the system of record, and a messaging problem never affects a call.

Recordings also remain listed in the Twilio Console under
**Monitor → Recordings**.

### If a voicemail does not show up on the site

Open the service's **Logs** tab. The Function writes one line on every
attempt:

| What you see | What it means |
|---|---|
| `voicemail logged to site (200)` | It worked. Check the page and your email. |
| `site rejected the voicemail: 403` | `WP_SECRET` and `LTAZ_VM_SECRET` do not match. |
| `site rejected the voicemail: 503` | `LTAZ_VM_SECRET` is missing from `wp-config.php`. |
| `site rejected the voicemail: 404` | The LTAZ Voicemail Inbox plugin is not active. |
| `could not reach the site: …` | DNS, TLS, or a firewall between Twilio and the site. |
| `WP_ENDPOINT / WP_SECRET are not set` | Add both under Environment Variables and Deploy All. |
| no line at all | The step never ran. Confirm `/ivr` is deployed and the recording completed. |

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
  destination and the screening prompt's destination. Defaults to
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
- **Failures are never fatal.** If the website is unreachable or rejects
  the request, the voicemail is still recorded and visible in the Console,
  and the reason is logged. A site problem cannot break a call.
- **Recording links.** The `.mp3` link stored on the site plays in any
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
  greeting for the current time of day and can leave a message; it appears
  on the log page and in your inbox shortly after they hang up.
- Press **4** → straight to voicemail; the entry appears on the log page
  within seconds, with the transcript following a minute or so later.
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
voicemail`, `screening accepted`, `voicemail logged to site (200)`.
