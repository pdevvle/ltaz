/**
 * Voicemail prompt + recording. Reached two ways: the caller pressed 4 at
 * the menu, or the forwarded call to the cell went unanswered
 * (dial-status.js redirects here).
 *
 * maxLength is 120 because Twilio only transcribes recordings up to two
 * minutes; longer messages would arrive with no transcription in the SMS.
 * voicemail-notify.js texts the transcription and a listen link to the
 * cell once Twilio finishes transcribing.
 */
exports.handler = function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  twiml.say(
    { voice: 'Polly.Joanna' },
    'Please leave a message after the tone. Press pound when you are finished.'
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
