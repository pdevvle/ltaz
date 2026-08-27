/**
 * Entry point for incoming calls. Wire the Twilio phone number's Voice
 * webhook ("A call comes in") to this Function.
 *
 * Business hours: plays the menu and gathers one digit. handle-selection.js
 * validates the digit; on an invalid or missing digit it sends the caller
 * back here, so the menu naturally repeats. `retry=1` in that redirect
 * switches the greeting to the shorter re-prompt below.
 *
 * Outside business hours: no menu and no attempt to ring anyone — the call
 * goes straight to voicemail, which opens with the alternate greeting.
 * Hours live in business-hours.private.js.
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

  let openNow = true;
  try {
    const hours = require(Runtime.getFunctions()['business-hours'].path);
    openNow = hours.isBusinessHours();
  } catch (err) {
    // Only reachable if business-hours.private.js is missing from the
    // service. Treat the line as open rather than sending every caller to
    // voicemail on a deploy mistake.
    console.error(`business-hours lookup failed, assuming open: ${err.message}`);
  }

  if (!openNow) {
    console.log(`after-hours call from ${event.From || 'unknown'} → voicemail`);
    twiml.redirect({ method: 'POST' }, 'voicemail');
    return callback(null, twiml);
  }

  const gather = twiml.gather({
    numDigits: 1,
    timeout: 8,
    action: 'handle-selection',
    method: 'POST',
  });

  const menu =
    "Press 1 if you're calling regarding a new project. " +
    'Press 2 about an existing job. ' +
    'Press 3 for anything else. ' +
    'Press 4 to leave a voicemail.';

  if (event.retry === '1') {
    gather.say({ voice }, `Sorry, I did not get that. ${menu}`);
  } else {
    gather.say(
      { voice },
      `Thank you for calling Lee's Tree Service, Irrigation, and Landscaping. ${menu}`
    );
  }

  // No input at all: connect them anyway rather than hanging up on a
  // customer who is just waiting for a person.
  twiml.redirect({ method: 'POST' }, 'handle-selection?Digits=0');

  return callback(null, twiml);
};
