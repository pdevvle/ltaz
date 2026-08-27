/**
 * Voicemail prompt + recording. Reached three ways: the caller pressed 4 at
 * the menu, the forwarded call to the cell went unanswered (dial-status.js
 * redirects here), or the call came in outside business hours and
 * incoming-call.js sent it straight here without a menu.
 *
 * The greeting depends on the time of day in Arizona: during phone hours
 * the caller is told staff are busy, and outside them they get the
 * alternate greeting naming the hours, so they know why nobody picked up.
 * Both scripts and the hours themselves live in business-hours.private.js.
 *
 * maxLength is 120 because Twilio only transcribes recordings up to two
 * minutes; longer messages would arrive with no transcription in the SMS.
 * voicemail-notify.js texts the transcription and a listen link to the
 * cell once Twilio finishes transcribing.
 */
// Amazon Polly's generative engine — the most natural of the tiers Twilio
// offers (basic < neural < generative). Set a TTS_VOICE environment
// variable on the service to override, e.g. 'Polly.Joanna-Neural' to drop
// to the cheaper neural tier or 'Polly.Matthew-Generative' for a man's
// voice. Generative voices bill at a higher per-character rate than neural.
const DEFAULT_VOICE = 'Polly.Joanna-Generative';

// Used only if business-hours.private.js is missing from the service, so a
// caller still hears something sensible and their message is still taken.
const FALLBACK_GREETING =
  'All of our staff are currently busy. Please leave a brief voicemail ' +
  'regarding your project and we will provide you service as soon as ' +
  'possible.';

exports.handler = function (context, event, callback) {
  const voice = context.TTS_VOICE || DEFAULT_VOICE;
  const twiml = new Twilio.twiml.VoiceResponse();

  let greeting = FALLBACK_GREETING;
  try {
    const hours = require(Runtime.getFunctions()['business-hours'].path);
    greeting = hours.isBusinessHours() ? hours.DURING_HOURS : hours.AFTER_HOURS;
  } catch (err) {
    console.error(`business-hours lookup failed, using fallback: ${err.message}`);
  }

  twiml.say({ voice }, greeting);
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
