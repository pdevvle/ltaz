# Twilio call flow for 623-400-5499

The website's public number, **623-400-5499**, is a Twilio number. This
directory holds the two Twilio Functions that answer it:

1. **`functions/incoming-call.js`** — answers the call and reads the menu:
   *"Thank you for calling Lee's Trees. Press 1 for a free quote. Press 2
   about an existing job. Press 3 for anything else."*
2. **`functions/handle-selection.js`** — logs which option was pressed, then
   connects the caller to the recipient's cell, **+1 623-282-0110**.

Every option connects to the same place; the menu exists so the Function logs
show *why* people call. A caller who presses nothing is connected anyway after
the 8-second gather timeout (logged as `no selection`), and an invalid digit
replays the menu once with a shorter re-prompt.

## Behavior details

- **Destination override.** The dial target is the `FORWARD_TO` environment
  variable when set, otherwise `+16232820110`. To re-route calls (vacation,
  new phone), set `FORWARD_TO` in the service's Environment Variables — no
  code change or redeploy of intent.
- **Caller ID.** The forwarded leg presents 623-400-5499, not the caller's
  number, so calls from the business line are recognizable on the cell.
  Answer normally; there is no screening prompt.
- **`answerOnBridge`.** The caller hears ringing until the cell actually
  answers, instead of Twilio answering immediately and playing silence.
- **No answer.** After 25 seconds unanswered (or voicemail rejected), the
  caller hears "no one is available" and the call ends. If the cell's own
  voicemail picks up within 25 seconds, Twilio treats that as answered and
  the caller lands in the cell's voicemail.

## Deploy (Twilio Console, no CLI)

1. In the Twilio Console go to **Functions and Assets → Services** and create
   a service (e.g. `lees-trees-ivr`).
2. Add two Functions, paths `/incoming-call` and `/handle-selection`, and
   paste in the corresponding file from `functions/`. Set both to
   **Public** visibility (the phone number webhook calls them directly).
3. (Optional) Under **Environment Variables** add `FORWARD_TO` to override
   the default destination.
4. **Deploy All**.
5. Go to **Phone Numbers → Manage → Active Numbers → (623) 400-5499**, and
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

- Press **1**, **2**, or **3** → "Connecting you now" → 623-282-0110 rings
  showing 623-400-5499 as the caller.
- Press **9** → menu replays with the "Sorry, I did not get that" prompt.
- Press nothing → after ~8 seconds the call connects anyway.

Selections appear in the service's **Logs** tab as
`menu selection: 1 (free quote) from +1602…`.

## Relationship to the website tracking

The site's tap-to-call links and GTM conversion triggers all use
`tel:6234005499` (see `design/README.md`). Nothing here changes that: the
website keeps advertising 623-400-5499, and this flow is what happens after
someone dials it.
