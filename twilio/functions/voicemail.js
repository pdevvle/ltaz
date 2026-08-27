/**
 * Voicemail prompt + recording. Reached two ways: the caller pressed 4 at
 * the menu, or the forwarded call to the cell went unanswered
 * (dial-status.js redirects here).
 *
 * The greeting depends on the time of day in Arizona: during phone hours
 * the caller is told staff are busy, and outside them they are told what
 * the hours are so they know why nobody picked up.
 *
 * maxLength is 120 because Twilio only transcribes recordings up to two
 * minutes; longer messages would arrive with no transcription in the SMS.
 * voicemail-notify.js texts the transcription and a listen link to the
 * cell once Twilio finishes transcribing.
 */

// Arizona does not observe daylight saving, but naming the zone rather
// than hard-coding a UTC offset keeps this correct regardless.
const TIMEZONE = 'America/Phoenix';
const OPEN_HOUR = 7; // 7am
const CLOSE_HOUR = 19; // 7pm

const DURING_HOURS =
  'All our staff are currently busy. Please leave a brief voicemail ' +
  'regarding your project and we will endeavor to return your call as ' +
  'soon as possible.';

const AFTER_HOURS =
  'Thank you for your call. Our typical phone hours are 7am to 7pm ' +
  'everyday, but if you leave your name, number, and project details, we ' +
  'will give you service as quickly as a staff member is available.';

/**
 * The local hour (0-23) in Arizona. Twilio Functions run on UTC, so the
 * server clock cannot be read directly.
 */
function localHour(now) {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    hour12: false,
  }).format(now);

  // en-US with hour12:false renders midnight as "24"; normalize to 0.
  return Number(hour) % 24;
}

// Amazon Polly's generative engine — the most natural of the tiers Twilio
// offers (basic < neural < generative). Set a TTS_VOICE environment
// variable on the service to override, e.g. 'Polly.Joanna-Neural' to drop
// to the cheaper neural tier or 'Polly.Matthew-Generative' for a man's
// voice. Generative voices bill at a higher per-character rate than neural.
const DEFAULT_VOICE = 'Polly.Joanna-Generative';

exports.handler = function (context, event, callback) {
  const voice = context.TTS_VOICE || DEFAULT_VOICE;
  const twiml = new Twilio.twiml.VoiceResponse();

  const hour = localHour(new Date());
  const openNow = hour >= OPEN_HOUR && hour < CLOSE_HOUR;

  twiml.say({ voice }, openNow ? DURING_HOURS : AFTER_HOURS);
  twiml.say(
    { voice },
    'Please begin after the tone, and press pound when you are finished.'
  );
  twiml.record({
    maxLength: 120,
    finishOnKey: '#',
    playBeep: true,
    transcribe: true,
    transcribeCallback: 'voicemail-notify',
    action: 'voicemail-done',
    method: 'POST',
  });
  // Reached only if the caller never spoke at all.
  twiml.hangup();

  return callback(null, twiml);
};
