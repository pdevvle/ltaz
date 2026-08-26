/**
 * Runs after the <Dial> to the cell finishes. If the cell answered,
 * nothing to do — the call is over. Otherwise (no answer within 12s,
 * busy, or failed) the caller is offered our voicemail rather than
 * being hung up on or dumped into the cell's carrier voicemail.
 */
exports.handler = function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  if (event.DialCallStatus === 'completed') {
    twiml.hangup();
    return callback(null, twiml);
  }

  console.log(
    `dial to cell not answered (${event.DialCallStatus}) from ${event.From || 'unknown'}`
  );

  twiml.say(
    { voice: 'Polly.Joanna' },
    'Sorry, no one is available to take your call right now.'
  );
  twiml.redirect({ method: 'POST' }, 'voicemail');

  return callback(null, twiml);
};
