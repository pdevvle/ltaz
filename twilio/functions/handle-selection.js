/**
 * Receives the digit gathered by incoming-call.js, logs it, and connects
 * the caller to the real line.
 *
 * The destination defaults to the recipient's cell, +1 623-282-0110, and
 * can be overridden without a code change by setting a FORWARD_TO
 * environment variable on the Twilio service (E.164, e.g. +16025551234).
 * 623-400-5499 is the public Twilio number itself, not the destination.
 *
 * Digits:
 *   1  new project
 *   2  existing job
 *   3  anything else
 *   4  leave a voicemail (recorded, no dial)
 *   0  caller waited through the menu without pressing anything
 *      (sent here by the redirect in incoming-call.js)
 * Anything else is invalid and replays the menu once.
 */
// Amazon Polly's generative engine — the most natural of the tiers Twilio
// offers (basic < neural < generative). Set a TTS_VOICE environment
// variable on the service to override, e.g. 'Polly.Joanna-Neural' to drop
// to the cheaper neural tier or 'Polly.Matthew-Generative' for a man's
// voice. Generative voices bill at a higher per-character rate than neural.
const DEFAULT_VOICE = 'Polly.Joanna-Generative';

exports.handler = function (context, event, callback) {
  const voice = context.TTS_VOICE || DEFAULT_VOICE;
  const twiml = new Twilio.twiml.VoiceResponse();
  const digit = event.Digits || '';
  const forwardTo = context.FORWARD_TO || '+16232820110';

  const reasons = {
    1: 'new project',
    2: 'existing job',
    3: 'other',
    4: 'voicemail',
    0: 'no selection',
  };

  if (!(digit in reasons)) {
    twiml.redirect({ method: 'POST' }, 'incoming-call?retry=1');
    return callback(null, twiml);
  }

  // Shows up in the Function logs and in the call's request inspector,
  // so the mix of call reasons can be read without extra tooling.
  console.log(
    `menu selection: ${digit} (${reasons[digit]}) from ${event.From || 'unknown'}`
  );

  if (digit === '4') {
    twiml.redirect({ method: 'POST' }, 'voicemail');
    return callback(null, twiml);
  }

  twiml.say({ voice }, 'Connecting you now.');
  twiml.dial(
    {
      // Caller sees the shop's public number, not their own caller ID,
      // when the forwarded leg is answered on the cell.
      callerId: event.To,
      answerOnBridge: true,
      // The cell's carrier voicemail picks up at ~14 seconds. Giving up
      // at 12 keeps unanswered calls in Twilio, where dial-status routes
      // them to our own voicemail instead of the carrier's.
      timeout: 12,
      action: 'dial-status',
      method: 'POST',
    },
    forwardTo
  );

  return callback(null, twiml);
};
