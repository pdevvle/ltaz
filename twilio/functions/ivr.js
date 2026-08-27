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
 *   (none)       answer the call: menu in hours, voicemail out of hours
 *   selection    a menu digit was pressed
 *   dial-status  the forwarded call to the cell ended
 *   voicemail    play the greeting and record
 *   done         the caller finished recording
 *   notify       transcription is ready; text it to the cell
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

// ----------------------------------------------------------------- handler

exports.handler = async function (context, event, callback) {
  const voice = context.TTS_VOICE || DEFAULT_VOICE;
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
      const digit = event.Digits || '';

      if (!(digit in REASONS)) {
        twiml.redirect({ method: 'POST' }, `${base}?retry=1`);
        break;
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
      twiml.dial(
        {
          // Caller sees the shop's public number on the cell, not their own.
          callerId: event.To,
          answerOnBridge: true,
          // The cell's carrier voicemail picks up at ~14 seconds. Giving up
          // at 12 keeps unanswered calls here, where they land in our own
          // voicemail instead of the carrier's.
          timeout: 12,
          action: step('dial-status'),
          method: 'POST',
        },
        context.FORWARD_TO || DEFAULT_FORWARD_TO
      );
      break;
    }

    // ------------------------------------------------ the forwarded call ended
    case 'dial-status': {
      if (event.DialCallStatus === 'completed') {
        twiml.hangup();
        break;
      }

      console.log(
        `dial to cell not answered (${event.DialCallStatus}) from ${event.From || 'unknown'}`
      );
      twiml.redirect({ method: 'POST' }, step('voicemail'));
      break;
    }

    // ---------------------------------------------------- record a message
    case 'voicemail': {
      twiml.say({ voice }, isBusinessHours() ? VOICEMAIL_OPEN : VOICEMAIL_CLOSED);
      twiml.say(
        { voice },
        'Please begin after the tone, and press pound when you are finished.'
      );
      twiml.record({
        // Twilio only transcribes recordings up to two minutes; longer
        // messages would arrive with no transcription in the SMS.
        maxLength: 120,
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

    // ------------------------------------------------ recording finished
    case 'done': {
      console.log(
        `voicemail from ${event.From || 'unknown'}: ${event.RecordingUrl || 'no recording'} ` +
          `(${event.RecordingDuration || 0}s)`
      );
      twiml.say({ voice }, 'Thank you. Your message has been received. Goodbye.');
      twiml.hangup();
      break;
    }

    // -------------------------------------- transcription ready: text it
    case 'notify': {
      const notifyTo = context.FORWARD_TO || DEFAULT_FORWARD_TO;

      const transcription =
        event.TranscriptionStatus === 'completed' && event.TranscriptionText
          ? event.TranscriptionText
          : '(transcription unavailable)';

      // .mp3 makes the link play in the phone's browser. Recording media
      // URLs are public unless HTTP auth on media is enabled on the account.
      const listen = event.RecordingUrl ? `${event.RecordingUrl}.mp3` : '';

      try {
        await context.getTwilioClient().messages.create({
          to: notifyTo,
          // The Twilio number itself, which must be SMS-capable.
          from: event.To || '+16234005499',
          body:
            `New voicemail from ${event.From || 'unknown caller'}:\n` +
            `"${transcription}"\n` +
            `Listen: ${listen}`,
        });
        console.log(`voicemail SMS sent to ${notifyTo}`);
      } catch (err) {
        // The voicemail itself is already recorded; log and move on.
        console.error(`voicemail SMS failed: ${err.message}`);
      }
      break;
    }

    // --------------------------------------------------- answer the call
    default: {
      if (!isBusinessHours()) {
        console.log(`after-hours call from ${event.From || 'unknown'} -> voicemail`);
        twiml.redirect({ method: 'POST' }, step('voicemail'));
        break;
      }

      const gather = twiml.gather({
        numDigits: 1,
        timeout: 8,
        action: step('selection'),
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
