/**
 * Runs after the caller finishes recording a voicemail (option 4).
 * Logs where the recording landed, thanks the caller, and hangs up.
 * Recordings are listed in the Twilio Console under Monitor → Recordings.
 */
exports.handler = function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  console.log(
    `voicemail from ${event.From || 'unknown'}: ${event.RecordingUrl || 'no recording'} ` +
      `(${event.RecordingDuration || 0}s)`
  );

  twiml.say(
    { voice: 'Polly.Joanna' },
    'Thank you. Your message has been received. Goodbye.'
  );
  twiml.hangup();

  return callback(null, twiml);
};
