/**
 * Shared business-hours logic and the two greeting scripts.
 *
 * Private (the `.private.js` suffix keeps the Serverless Toolkit from
 * exposing it as an HTTP endpoint; in the Console set its visibility to
 * Private by hand). It is required by incoming-call.js and voicemail.js
 * via Runtime.getFunctions(), so the hours live in exactly one place —
 * change them here and both the greeting and the call routing follow.
 */

// Arizona does not observe daylight saving, but naming the zone rather
// than hard-coding a UTC offset keeps this correct regardless.
const TIMEZONE = 'America/Phoenix';
const OPEN_HOUR = 7; // 7am
const CLOSE_HOUR = 19; // 7pm

// Played when someone reaches voicemail during business hours — the call
// was forwarded and went unanswered, or they chose voicemail from the menu.
const DURING_HOURS =
  'All of our staff are currently busy. Please leave a brief voicemail ' +
  'regarding your project and we will provide you service as soon as ' +
  'possible.';

// The alternate greeting. Outside business hours this is the first thing a
// caller hears — there is no menu and no attempt to ring anyone.
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

/** True between OPEN_HOUR and CLOSE_HOUR, Arizona time, any day of the week. */
function isBusinessHours(now) {
  const hour = localHour(now || new Date());
  return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}

module.exports = {
  TIMEZONE,
  OPEN_HOUR,
  CLOSE_HOUR,
  DURING_HOURS,
  AFTER_HOURS,
  localHour,
  isBusinessHours,
};
