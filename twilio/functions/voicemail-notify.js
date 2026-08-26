/**
 * Transcription callback for voicemail recordings. Twilio calls this once
 * the transcription is ready (typically well under a minute after the
 * caller hangs up). Texts the recipient's cell the caller's number, the
 * transcription, and a link to listen to the recording.
 *
 * The SMS goes from the Twilio number (event.To, i.e. 623-400-5499) to
 * the same destination the calls forward to (FORWARD_TO or the default
 * cell). Requires the Twilio number to be SMS-capable.
 */
exports.handler = async function (context, event, callback) {
  const notifyTo = context.FORWARD_TO || '+16232820110';
  const from = event.To || '+16234005499';

  const transcription =
    event.TranscriptionStatus === 'completed' && event.TranscriptionText
      ? event.TranscriptionText
      : '(transcription unavailable)';

  // .mp3 makes the link play in the phone's browser without needing a
  // Twilio Console login-free asset — recording media URLs are public
  // unless HTTP auth on media is enabled on the account.
  const listenLink = event.RecordingUrl ? `${event.RecordingUrl}.mp3` : '';

  const body =
    `New voicemail from ${event.From || 'unknown caller'}:\n` +
    `"${transcription}"\n` +
    `Listen: ${listenLink}`;

  try {
    const client = context.getTwilioClient();
    await client.messages.create({ to: notifyTo, from: from, body: body });
    console.log(`voicemail SMS sent to ${notifyTo}`);
  } catch (err) {
    // The voicemail itself is already safely recorded; log and move on.
    console.error(`voicemail SMS failed: ${err.message}`);
  }

  return callback(null, new Twilio.twiml.VoiceResponse());
};
