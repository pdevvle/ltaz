/**
 * The whole call flow for 623-400-5499 in one Twilio Function.
 *
 * Wire the phone number's Voice webhook ("A call comes in") here. Every
 * later step is this same Function calling itself with a `step` query
 * parameter, so there is only one Function to deploy and one place to
 * edit. The path can be anything — the self-URL is built from
 * context.PATH at runtime.
 *
 * Steps:
 *   (none)        answer the call: menu in hours, voicemail out of hours
 *   selection     a menu digit was pressed
 *   screen        played to the RECIPIENT when the cell picks up
 *   screen-accept the recipient pressed a key (or didn't)
 *   dial-status   the forwarded call to the cell ended
 *   voicemail     play the greeting and record
 *   done          the caller finished recording; text the alert
 *   notify        transcription is ready; text it as a follow-up
 */

// ---------------------------------------------------------------- settings

// Where calls are forwarded. Override with a FORWARD_TO environment
// variable (E.164, e.g. +16025551234) to re-route without editing code.
// 623-400-5499 is the public Twilio number itself, not the destination.
const DEFAULT_FORWARD_TO = '+16232820110';

// Amazon Polly's generative engine — the most natural of the tiers Twilio
// offers (basic < neural < generative). Override with a TTS_VOICE
// environment variable, e.g. 'Polly.Joanna-Neural' for the cheaper neural
// tier or 'Polly.Matthew-Generative' for a man's voice. Generative voices
// bill at a higher per-character rate than neural.
const DEFAULT_VOICE = 'Polly.Joanna-Generative';

// Business hours. Arizona does not observe daylight saving, but naming the
// zone rather than hard-coding a UTC offset keeps this correct regardless.
const TIMEZONE = 'America/Phoenix';
const OPEN_HOUR = 7; // 7am
const CLOSE_HOUR = 19; // 7pm

// A bridged call shorter than this is treated as never really connected,
// so the caller still gets voicemail. Screening (see the `screen` step)
// means a declined call is answered by the carrier's voicemail, plays the
// screening prompt to nobody, and hangs up — which Twilio may still report
// as `completed`. The dial-status log line prints the real numbers from
// every call; tune this once you have seen a few.
const MIN_CONNECTED_SECONDS = 20;

const GREETING =
  "Thank you for calling Lee's Tree Service, Irrigation, and Landscaping.";

const MENU =
  "Press 1 if you're calling regarding a new project. " +
  'Press 2 about an existing job. ' +
  'Press 3 for anything else. ' +
  'Press 4 to leave a voicemail.';

// Voicemail greeting during business hours.
const VOICEMAIL_OPEN =
  'All of our staff are currently busy. Please leave a brief voicemail ' +
  'regarding your project and we will provide you service as soon as ' +
  'possible.';

// The alternate greeting. Outside business hours this is the first thing a
// caller hears — there is no menu and no attempt to ring anyone.
const VOICEMAIL_CLOSED =
  'Thank you for your call. Our typical phone hours are 7am to 7pm ' +
  'everyday, but if you leave your name, number, and project details, we ' +
  'will give you service as quickly as a staff member is available.';

const REASONS = {
  1: 'new project',
  2: 'existing job',
  3: 'other',
  4: 'voicemail',
  0: 'no selection',
};

// ----------------------------------------------------------------- helpers

/**
 * True between OPEN_HOUR and CLOSE_HOUR, Arizona time, any day of the week.
 * Twilio Functions run on UTC, so the server clock cannot be read directly.
 */
function isBusinessHours() {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    hour12: false,
  }).format(new Date());

  // en-US with hour12:false renders midnight as "24"; normalize to 0.
  return Number(hour) % 24 >= OPEN_HOUR && Number(hour) % 24 < CLOSE_HOUR;
}

/** "+16025551234" -> "6 0 2, 5 5 5, 1 2 3 4" so TTS reads it as digits. */
function speakNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return 'an unknown number';
  const part = (s) => s.split('').join(' ');
  return `${part(digits.slice(0, 3))}, ${part(digits.slice(3, 6))}, ${part(digits.slice(6))}`;
}

/**
 * Send an SMS, logging enough to diagnose a failure from the Logs tab.
 * Never throws: a texting problem must not take down the call.
 */
async function sendSms(context, to, from, body) {
  try {
    const client = context.getTwilioClient();
    const msg = await client.messages.create({ to, from, body });
    console.log(`SMS ${msg.sid} queued to ${to} from ${from}`);
    return true;
  } catch (err) {
    // err.code is the Twilio error number — 20003 bad credentials, 21606
    // the from-number cannot send SMS, 21608 unverified on a trial
    // account, 30034 unregistered A2P 10DLC traffic.
    console.error(
      `SMS to ${to} from ${from} FAILED: code=${err.code || 'none'} ` +
        `status=${err.status || 'none'} ${err.message}`
    );
    return false;
  }
}

// ----------------------------------------------------------------- handler

exports.handler = async function (context, event, callback) {
  const voice = context.TTS_VOICE || DEFAULT_VOICE;
  const forwardTo = context.FORWARD_TO || DEFAULT_FORWARD_TO;
  const twiml = new Twilio.twiml.VoiceResponse();

  // This Function's own URL, so each step can hand off to the next. If the
  // context variables are ever absent, the empty base leaves a relative
  // URL, which Twilio resolves against the current request.
  const base =
    context.DOMAIN_NAME && context.PATH
      ? `https://${context.DOMAIN_NAME}${context.PATH}`
      : '';
  const step = (name) => `${base}?step=${name}`;

  switch (event.step) {
    // ------------------------------------------------- a digit was pressed
    case 'selection': {
      let digit = event.Digits || '';

      if (!(digit in REASONS)) {
        if (event.retry !== '1') {
          twiml.redirect({ method: 'POST' }, `${base}?retry=1`);
          break;
        }
        // Second invalid digit in a row: stop looping the menu and treat
        // it as no selection — a confused caller is better connected to a
        // person than stuck pressing keys.
        digit = '0';
      }

      // Shows up in the Function logs and the call's request inspector, so
      // the mix of call reasons is readable without extra tooling.
      console.log(
        `menu selection: ${digit} (${REASONS[digit]}) from ${event.From || 'unknown'}`
      );

      if (digit === '4') {
        twiml.redirect({ method: 'POST' }, step('voicemail'));
        break;
      }

      twiml.say({ voice }, 'Connecting you now.');
      const dial = twiml.dial({
        // Caller sees the shop's public number on the cell, not their own.
        callerId: event.To,
        answerOnBridge: true,
        // The cell's carrier voicemail picks up at ~14 seconds. Giving up
        // at 12 keeps unanswered calls here, where they land in our own
        // voicemail instead of the carrier's.
        timeout: 12,
        action: step('dial-status'),
        method: 'POST',
      });
      // `url` plays the screening prompt to whoever picks up, before the
      // legs are bridged. Carrier voicemail cannot press a key, so a
      // declined call never bridges and falls through to our voicemail.
      dial.number(
        { url: `${step('screen')}&caller=${encodeURIComponent(event.From || '')}`, method: 'POST' },
        forwardTo
      );
      break;
    }

    // ------------------------------- played to the recipient, not the caller
    case 'screen': {
      const gather = twiml.gather({
        numDigits: 1,
        timeout: 10,
        action: step('screen-accept'),
        method: 'POST',
      });
      gather.say(
        { voice },
        `Call from ${speakNumber(event.caller)}. Press any key to accept.`
      );
      // Reached only if <Gather> somehow falls through without its action.
      twiml.hangup();
      break;
    }

    // ------------------------------------- the recipient accepted, or didn't
    case 'screen-accept': {
      if (!event.Digits) {
        // No key: drop this leg without bridging. The caller is still on
        // the line and continues at the dial action below.
        console.log('screening not accepted (no key pressed)');
        twiml.hangup();
        break;
      }
      // Any key accepts. Returning empty TwiML ends the screening prompt,
      // which is what bridges the two legs together.
      console.log('screening accepted');
      break;
    }

    // --------------------------------------------- the forwarded call ended
    case 'dial-status': {
      const seconds = Number(event.DialCallDuration || 0);
      console.log(
        `dial-status: status=${event.DialCallStatus} duration=${seconds}s ` +
          `from ${event.From || 'unknown'}`
      );

      // Only a call that actually bridged for a while counts as answered.
      // Anything else — no answer, busy, declined into carrier voicemail,
      // screening not accepted — falls through to our own voicemail.
      if (event.DialCallStatus === 'completed' && seconds >= MIN_CONNECTED_SECONDS) {
        twiml.hangup();
        break;
      }

      twiml.redirect({ method: 'POST' }, step('voicemail'));
      break;
    }

    // ---------------------------------------------------- record a message
    case 'voicemail': {
      twiml.say({ voice }, isBusinessHours() ? VOICEMAIL_OPEN : VOICEMAIL_CLOSED);
      twiml.record({
        // Twilio only transcribes recordings up to two minutes; longer
        // messages would arrive with no transcription in the SMS.
        maxLength: 120,
        // Recording ends on 5 seconds of silence (Twilio's default) or on
        // hangup, so the caller is never told to press anything. Narrowing
        // finishOnKey from the default 1234567890*# means a fumbled keypad
        // cannot cut someone off mid-message.
        finishOnKey: '#',
        playBeep: true,
        transcribe: true,
        transcribeCallback: step('notify'),
        action: step('done'),
        method: 'POST',
      });
      // Reached only if the caller never spoke at all.
      twiml.hangup();
      break;
    }

    // ------------------ recording finished: text the alert straight away
    case 'done': {
      const listen = event.RecordingUrl ? `${event.RecordingUrl}.mp3` : '';
      console.log(
        `voicemail from ${event.From || 'unknown'}: ${event.RecordingUrl || 'no recording'} ` +
          `(${event.RecordingDuration || 0}s)`
      );

      // Sent here rather than waiting on the transcription, so a slow or
      // failed transcription can never cost you the notification. The
      // transcription follows as a second text if and when it arrives.
      await sendSms(
        context,
        forwardTo,
        event.To || '+16234005499',
        `New voicemail from ${event.From || 'unknown caller'} ` +
          `(${event.RecordingDuration || 0}s).\nListen: ${listen}`
      );

      twiml.say({ voice }, 'Thank you. Your message has been received. Goodbye.');
      twiml.hangup();
      break;
    }

    // ------------------------------- transcription ready: send it as text
    case 'notify': {
      console.log(`transcription status: ${event.TranscriptionStatus}`);

      if (event.TranscriptionStatus !== 'completed' || !event.TranscriptionText) {
        // No usable text. The alert from `done` already went out, so
        // there is nothing to chase here.
        break;
      }

      let text = event.TranscriptionText;
      // Twilio rejects SMS bodies over 1600 characters, and a two-minute
      // voicemail can transcribe past that. The full audio is at the link
      // in the first text.
      if (text.length > 1200) {
        text = `${text.slice(0, 1200)}… (cut off — full message at the link)`;
      }

      await sendSms(
        context,
        forwardTo,
        event.To || '+16234005499',
        `Transcript of the voicemail from ${event.From || 'unknown caller'}:\n"${text}"`
      );
      break;
    }

    // ----------------------------------------------------- answer the call
    default: {
      if (!isBusinessHours()) {
        console.log(`after-hours call from ${event.From || 'unknown'} -> voicemail`);
        twiml.redirect({ method: 'POST' }, step('voicemail'));
        break;
      }

      const gather = twiml.gather({
        numDigits: 1,
        timeout: 8,
        // On the retry round, tag the action so 'selection' knows the menu
        // has already replayed once and stops looping on a bad digit.
        action:
          event.retry === '1' ? `${step('selection')}&retry=1` : step('selection'),
        method: 'POST',
      });
      gather.say(
        { voice },
        event.retry === '1' ? `Sorry, I did not get that. ${MENU}` : `${GREETING} ${MENU}`
      );

      // No input at all: connect them anyway rather than hanging up on a
      // customer who is just waiting for a person.
      twiml.redirect({ method: 'POST' }, `${step('selection')}&Digits=0`);
    }
  }

  return callback(null, twiml);
};
