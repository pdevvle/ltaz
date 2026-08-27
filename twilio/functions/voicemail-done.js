/**
 * Runs after the caller finishes recording a voicemail (option 4).
 * Logs where the recording landed, thanks the caller, and hangs up.
 * Recordings are listed in the Twilio Console under Monitor → Recordings.
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

  console.log(
    `voicemail from ${event.From || 'unknown'}: ${event.RecordingUrl || 'no recording'} ` +
      `(${event.RecordingDuration || 0}s)`
  );

  twiml.say(
    { voice },
    'Thank you. Your message has been received. Goodbye.'
  );
  twiml.hangup();

  return callback(null, twiml);
};
