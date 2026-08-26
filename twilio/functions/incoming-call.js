/**
 * Entry point for incoming calls. Wire the Twilio phone number's Voice
 * webhook ("A call comes in") to this Function.
 *
 * Plays the menu and gathers one digit. handle-selection.js validates the
 * digit; on an invalid or missing digit it sends the caller back here, so
 * the menu naturally repeats. `retry=1` in that redirect switches the
 * greeting to the shorter re-prompt below.
 */
exports.handler = function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    numDigits: 1,
    timeout: 8,
    action: 'handle-selection',
    method: 'POST',
  });

  if (event.retry === '1') {
    gather.say(
      { voice: 'Polly.Joanna' },
      'Sorry, I did not get that. ' +
        'Press 1 for a free quote. ' +
        'Press 2 about an existing job. ' +
        'Press 3 for anything else.'
    );
  } else {
    gather.say(
      { voice: 'Polly.Joanna' },
      "Thank you for calling Lee's Trees. " +
        'Press 1 for a free quote. ' +
        'Press 2 about an existing job. ' +
        'Press 3 for anything else.'
    );
  }

  // No input at all: connect them anyway rather than hanging up on a
  // customer who is just waiting for a person.
  twiml.redirect({ method: 'POST' }, 'handle-selection?Digits=0');

  return callback(null, twiml);
};
