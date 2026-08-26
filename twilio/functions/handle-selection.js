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
 *   1  free quote
 *   2  existing job
 *   3  anything else
 *   0  caller waited through the menu without pressing anything
 *      (sent here by the redirect in incoming-call.js)
 * Anything else is invalid and replays the menu once.
 */
exports.handler = function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();
  const digit = event.Digits || '';
  const forwardTo = context.FORWARD_TO || '+16232820110';

  const reasons = {
    1: 'free quote',
    2: 'existing job',
    3: 'other',
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

  twiml.say({ voice: 'Polly.Joanna' }, 'Connecting you now.');
  twiml.dial(
    {
      // Caller sees the shop's public number, not their own caller ID,
      // when the forwarded leg is answered on the cell.
      callerId: event.To,
      answerOnBridge: true,
      timeout: 25,
    },
    forwardTo
  );

  twiml.say(
    { voice: 'Polly.Joanna' },
    'Sorry, no one is available to take your call. Please try again later.'
  );

  return callback(null, twiml);
};
