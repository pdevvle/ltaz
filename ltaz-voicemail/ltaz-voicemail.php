<?php
/**
 * Plugin Name: LTAZ Voicemail Inbox
 * Plugin URI:  https://github.com/pdevvle/ltaz
 * Description: Receives voicemails from the Twilio IVR on 623-400-5499, stores each one privately with its transcript and recording, emails it out, and exposes a PIN-protected log page for reading them without a WordPress login.
 * Version:     1.1.0
 * Author:      Lee's Trees
 * License:     GPL v2 or later
 * Requires PHP: 8.0
 *
 * WHY THIS EXISTS
 *  US long codes cannot send application SMS until the number is registered for
 *  A2P 10DLC. Rather than go through that to text yourself, the Twilio Function
 *  POSTs each voicemail here. WordPress keeps the written record and sends the
 *  email (Post SMTP is already configured on this site), so no messaging
 *  registration is involved anywhere.
 *
 * SETUP
 *  1. Add a shared secret to wp-config.php, above "That's all, stop editing":
 *
 *         define( 'LTAZ_VM_SECRET', '<a long random string>' );
 *
 *     Generate one with: openssl rand -hex 32
 *     Without it the intake endpoint refuses every request, so the plugin is
 *     inert until deliberately configured.
 *
 *  2. Optionally override the defaults:
 *
 *         define( 'LTAZ_VM_NOTIFY_EMAIL', 'you@example.com' );  // default: admin email
 *         define( 'LTAZ_VM_PIN', '5499' );                      // default: 5499
 *
 *  3. In the Twilio Function service, set environment variables:
 *         WP_ENDPOINT = https://leestreesaz.com/wp-json/ltaz/v1/voicemail
 *         WP_SECRET   = the same string as LTAZ_VM_SECRET
 *
 *  4. Create a page (e.g. /voicemails) whose only content is the shortcode:
 *
 *         [ltaz_voicemail_log]
 *
 *     Then EXCLUDE THAT URL FROM CACHING in WP Rocket. The plugin sets
 *     DONOTCACHEPAGE and no-cache headers itself, which WP Rocket normally
 *     honours, but an explicit exclusion is the belt to that suspenders: a
 *     cached copy of the unlocked page would serve the log to everyone.
 *
 * PRIVACY
 *  Voicemails hold customer names, numbers and project details.
 *   - The post type is public => false and every record is saved 'private', so
 *     nothing is web-visible through WordPress itself and nothing is indexable.
 *   - The log page is reachable without a login by design, gated on a PIN. A
 *     four-digit PIN is 10,000 combinations, so the gate rate-limits by IP:
 *     MAX_ATTEMPTS wrong guesses locks that address out for LOCKOUT_MINUTES.
 *     That turns an exhaustive search into weeks of work rather than seconds,
 *     but it is not a substitute for a password. Anyone who learns the PIN and
 *     the URL can read every message.
 *   - The unlock cookie is an HMAC signed with this site's auth salt, so it
 *     cannot be forged by editing the cookie value, and it expires.
 *   - The page sends noindex, so it will not turn up in search results.
 *
 * THE ENDPOINT
 *  POST /wp-json/ltaz/v1/voicemail
 *  Header: X-LTAZ-Secret: <shared secret>
 *  Body (JSON): call_sid, from, to, duration, recording_url, transcript
 *
 *  Twilio posts twice per voicemail: once when recording stops (no transcript
 *  yet) and again when transcription finishes. Both carry the same call_sid, so
 *  the second updates the first record rather than creating a duplicate.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class LTAZ_Voicemail {

	const POST_TYPE  = 'ltaz_voicemail';
	const REST_NS    = 'ltaz/v1';
	const REST_ROUTE = '/voicemail';
	const SHORTCODE  = 'ltaz_voicemail_log';

	const META_SID    = '_ltaz_vm_call_sid';
	const META_FROM   = '_ltaz_vm_from';
	const META_URL    = '_ltaz_vm_recording';
	const META_SECS   = '_ltaz_vm_duration';
	const META_MAILED = '_ltaz_vm_transcript_mailed';

	const COOKIE          = 'ltaz_vm_unlocked';
	const SESSION_HOURS   = 12;
	const MAX_ATTEMPTS    = 8;
	const LOCKOUT_MINUTES = 15;
	const PER_PAGE        = 50;

	public static function boot(): void {
		$self = new self();
		add_action( 'init', array( $self, 'register_post_type' ) );
		add_action( 'init', array( $self, 'register_shortcode' ) );
		add_action( 'rest_api_init', array( $self, 'register_routes' ) );
		add_action( 'template_redirect', array( $self, 'prepare_log_page' ) );
		add_filter( 'wp_robots', array( $self, 'robots' ) );
		add_filter( 'manage_' . self::POST_TYPE . '_posts_columns', array( $self, 'columns' ) );
		add_action( 'manage_' . self::POST_TYPE . '_posts_custom_column', array( $self, 'column' ), 10, 2 );
	}

	// ------------------------------------------------------------ storage

	public function register_post_type(): void {
		register_post_type(
			self::POST_TYPE,
			array(
				'labels'              => array(
					'name'          => __( 'Voicemails', 'ltaz' ),
					'singular_name' => __( 'Voicemail', 'ltaz' ),
					'menu_name'     => __( 'Voicemails', 'ltaz' ),
					'all_items'     => __( 'All Voicemails', 'ltaz' ),
					'search_items'  => __( 'Search Voicemails', 'ltaz' ),
					'not_found'     => __( 'No voicemails yet.', 'ltaz' ),
				),
				// Never web-visible: these hold customer names and numbers. The
				// log page below reads them deliberately, behind the PIN.
				'public'              => false,
				'publicly_queryable'  => false,
				'exclude_from_search' => true,
				'show_ui'             => true,
				'show_in_menu'        => true,
				'show_in_rest'        => false,
				'menu_icon'           => 'dashicons-microphone',
				'menu_position'       => 26,
				'supports'            => array( 'title', 'editor' ),
				'capability_type'     => 'post',
				'map_meta_cap'        => true,
				'has_archive'         => false,
				'rewrite'             => false,
			)
		);
	}

	// ------------------------------------------------------------- intake

	public function register_routes(): void {
		register_rest_route(
			self::REST_NS,
			self::REST_ROUTE,
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'receive' ),
				'permission_callback' => array( $this, 'authorize' ),
			)
		);
	}

	/**
	 * Shared-secret check. Fails closed: with no secret defined in wp-config.php
	 * nothing is accepted, so an unconfigured install cannot be written to.
	 */
	public function authorize( WP_REST_Request $request ) {
		if ( ! defined( 'LTAZ_VM_SECRET' ) || '' === (string) LTAZ_VM_SECRET ) {
			return new WP_Error(
				'ltaz_vm_unconfigured',
				'LTAZ_VM_SECRET is not defined in wp-config.php.',
				array( 'status' => 503 )
			);
		}

		$sent = (string) $request->get_header( 'x-ltaz-secret' );

		// hash_equals is constant-time, so a wrong secret cannot be recovered
		// by timing the responses.
		if ( '' === $sent || ! hash_equals( (string) LTAZ_VM_SECRET, $sent ) ) {
			return new WP_Error( 'ltaz_vm_forbidden', 'Bad secret.', array( 'status' => 403 ) );
		}

		return true;
	}

	public function receive( WP_REST_Request $request ) {
		$call_sid   = sanitize_text_field( (string) $request->get_param( 'call_sid' ) );
		$from       = sanitize_text_field( (string) $request->get_param( 'from' ) );
		$duration   = absint( $request->get_param( 'duration' ) );
		$recording  = esc_url_raw( (string) $request->get_param( 'recording_url' ) );
		$transcript = trim( sanitize_textarea_field( (string) $request->get_param( 'transcript' ) ) );

		if ( '' === $call_sid ) {
			return new WP_Error( 'ltaz_vm_no_sid', 'call_sid is required.', array( 'status' => 400 ) );
		}

		// Only ever store a recording link on Twilio's own domain, so a forged
		// request cannot plant an arbitrary URL in the log or an email.
		if ( '' !== $recording ) {
			$host = wp_parse_url( $recording, PHP_URL_HOST );
			if ( ! is_string( $host ) || ! preg_match( '/(^|\.)twilio\.com$/i', $host ) ) {
				$recording = '';
			}
		}

		$existing = $this->find_by_call_sid( $call_sid );
		$body     = '' !== $transcript ? $transcript : '(no transcript)';

		if ( $existing ) {
			// The transcript callback arriving after the recording callback.
			$post_id = $existing;
			wp_update_post(
				array(
					'ID'           => $post_id,
					'post_content' => $body,
				)
			);
		} else {
			$post_id = wp_insert_post(
				array(
					'post_type'    => self::POST_TYPE,
					'post_title'   => $this->build_title( $from ),
					'post_content' => $body,
					'post_status'  => 'private',
				),
				true
			);

			if ( is_wp_error( $post_id ) ) {
				return $post_id;
			}

			update_post_meta( $post_id, self::META_SID, $call_sid );
		}

		if ( '' !== $from ) {
			update_post_meta( $post_id, self::META_FROM, $from );
		}
		if ( '' !== $recording ) {
			update_post_meta( $post_id, self::META_URL, $recording );
		}
		if ( $duration > 0 ) {
			update_post_meta( $post_id, self::META_SECS, $duration );
		}

		$mailed = $this->maybe_email( $post_id, $from, $duration, $recording, $transcript, (bool) $existing );

		return new WP_REST_Response(
			array(
				'ok'      => true,
				'post_id' => $post_id,
				'created' => ! $existing,
				'emailed' => $mailed,
			),
			200
		);
	}

	private function find_by_call_sid( string $call_sid ): int {
		$found = get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => array( 'private', 'publish', 'draft' ),
				'meta_key'       => self::META_SID,
				'meta_value'     => $call_sid,
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'no_found_rows'  => true,
			)
		);

		return $found ? (int) $found[0] : 0;
	}

	private function build_title( string $from ): string {
		// wp_date() renders in the site's timezone, not UTC.
		return sprintf(
			/* translators: 1: caller number, 2: date and time */
			__( 'Voicemail from %1$s — %2$s', 'ltaz' ),
			$this->pretty_number( $from ),
			wp_date( 'M j, Y g:i a' )
		);
	}

	private function pretty_number( string $raw ): string {
		$digits = preg_replace( '/\D/', '', $raw );
		if ( is_string( $digits ) && 10 === strlen( $digits ) ) {
			return sprintf( '(%s) %s-%s', substr( $digits, 0, 3 ), substr( $digits, 3, 3 ), substr( $digits, 6 ) );
		}
		if ( is_string( $digits ) && 11 === strlen( $digits ) && '1' === $digits[0] ) {
			return sprintf( '(%s) %s-%s', substr( $digits, 1, 3 ), substr( $digits, 4, 3 ), substr( $digits, 7 ) );
		}
		return '' !== $raw ? $raw : __( 'an unknown number', 'ltaz' );
	}

	// -------------------------------------------------------------- email

	/**
	 * Two emails at most per voicemail: one the moment it lands (so the alert is
	 * not held up by transcription), and one carrying the transcript when it
	 * arrives. META_MAILED stops the second from repeating if Twilio retries.
	 */
	private function maybe_email(
		int $post_id,
		string $from,
		int $duration,
		string $recording,
		string $transcript,
		bool $is_update
	): bool {
		$to = defined( 'LTAZ_VM_NOTIFY_EMAIL' ) && '' !== (string) LTAZ_VM_NOTIFY_EMAIL
			? (string) LTAZ_VM_NOTIFY_EMAIL
			: (string) get_option( 'admin_email' );

		if ( '' === $to || ! is_email( $to ) ) {
			return false;
		}

		$who   = $this->pretty_number( $from );
		$admin = admin_url( 'post.php?post=' . $post_id . '&action=edit' );

		if ( ! $is_update ) {
			$lines = array(
				sprintf( __( 'New voicemail from %s.', 'ltaz' ), $who ),
				$duration > 0 ? sprintf( __( 'Length: %d seconds', 'ltaz' ), $duration ) : '',
				'',
				'' !== $recording ? sprintf( __( 'Listen: %s', 'ltaz' ), $recording ) : '',
				sprintf( __( 'In the admin: %s', 'ltaz' ), $admin ),
				'',
				__( 'The transcript follows in a second email once Twilio finishes it.', 'ltaz' ),
			);

			return wp_mail(
				$to,
				sprintf( __( 'New voicemail from %s', 'ltaz' ), $who ),
				implode( "\n", array_filter( $lines, 'strlen' ) )
			);
		}

		if ( '' === $transcript || get_post_meta( $post_id, self::META_MAILED, true ) ) {
			return false;
		}

		update_post_meta( $post_id, self::META_MAILED, 1 );

		$lines = array(
			sprintf( __( 'Voicemail from %s:', 'ltaz' ), $who ),
			'',
			$transcript,
			'',
			'' !== $recording ? sprintf( __( 'Listen: %s', 'ltaz' ), $recording ) : '',
			sprintf( __( 'In the admin: %s', 'ltaz' ), $admin ),
		);

		return wp_mail(
			$to,
			sprintf( __( 'Transcript: voicemail from %s', 'ltaz' ), $who ),
			implode( "\n", array_filter( $lines, 'strlen' ) )
		);
	}

	// ------------------------------------------------------- the PIN gate

	private function pin(): string {
		return defined( 'LTAZ_VM_PIN' ) && '' !== (string) LTAZ_VM_PIN ? (string) LTAZ_VM_PIN : '5499';
	}

	/** Per-IP counter so a four-digit PIN cannot simply be enumerated. */
	private function attempts_key(): string {
		$ip = isset( $_SERVER['REMOTE_ADDR'] )
			? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) )
			: 'unknown';

		return 'ltaz_vm_pin_' . md5( $ip );
	}

	private function is_locked_out(): bool {
		return (int) get_transient( $this->attempts_key() ) >= self::MAX_ATTEMPTS;
	}

	private function record_failure(): void {
		$key   = $this->attempts_key();
		$tries = (int) get_transient( $key ) + 1;
		set_transient( $key, $tries, self::LOCKOUT_MINUTES * MINUTE_IN_SECONDS );
	}

	/**
	 * Unlock token: "<expiry>|<hmac>", signed with this site's auth salt. The
	 * cookie cannot be forged by editing it, and it stops working on its own.
	 */
	private function issue_token(): string {
		$expires = time() + ( self::SESSION_HOURS * HOUR_IN_SECONDS );

		return $expires . '|' . hash_hmac( 'sha256', 'ltaz_vm|' . $expires, wp_salt( 'auth' ) );
	}

	private function token_is_valid( string $token ): bool {
		$parts = explode( '|', $token, 2 );
		if ( 2 !== count( $parts ) ) {
			return false;
		}

		list( $expires, $sig ) = $parts;

		if ( ! ctype_digit( $expires ) || (int) $expires < time() ) {
			return false;
		}

		return hash_equals( hash_hmac( 'sha256', 'ltaz_vm|' . $expires, wp_salt( 'auth' ) ), $sig );
	}

	private function is_unlocked(): bool {
		// Someone already logged in as an editor does not need the PIN.
		if ( current_user_can( 'edit_posts' ) ) {
			return true;
		}

		if ( empty( $_COOKIE[ self::COOKIE ] ) ) {
			return false;
		}

		return $this->token_is_valid( sanitize_text_field( wp_unslash( $_COOKIE[ self::COOKIE ] ) ) );
	}

	private function set_cookie( string $value, int $expires ): void {
		setcookie(
			self::COOKIE,
			$value,
			array(
				'expires'  => $expires,
				'path'     => COOKIEPATH ? COOKIEPATH : '/',
				'domain'   => COOKIE_DOMAIN,
				'secure'   => is_ssl(),
				'httponly' => true,
				'samesite' => 'Lax',
			)
		);
	}

	/**
	 * Runs before any output, which is the only point at which a cookie can be
	 * set and caching can be turned off for this request.
	 */
	public function prepare_log_page(): void {
		if ( ! $this->on_log_page() ) {
			return;
		}

		// A cached copy of the unlocked page would serve the log to everyone.
		if ( ! defined( 'DONOTCACHEPAGE' ) ) {
			define( 'DONOTCACHEPAGE', true );
		}
		nocache_headers();

		if ( ! isset( $_POST['ltaz_vm_action'] ) ) {
			return;
		}

		$action = sanitize_text_field( wp_unslash( $_POST['ltaz_vm_action'] ) );
		$nonce  = isset( $_POST['ltaz_vm_nonce'] )
			? sanitize_text_field( wp_unslash( $_POST['ltaz_vm_nonce'] ) )
			: '';

		if ( ! wp_verify_nonce( $nonce, 'ltaz_vm_gate' ) ) {
			return;
		}

		if ( 'lock' === $action ) {
			$this->set_cookie( '', time() - HOUR_IN_SECONDS );
			wp_safe_redirect( get_permalink() );
			exit;
		}

		if ( 'unlock' !== $action || $this->is_locked_out() ) {
			return;
		}

		$sent = isset( $_POST['ltaz_vm_pin'] )
			? trim( sanitize_text_field( wp_unslash( $_POST['ltaz_vm_pin'] ) ) )
			: '';

		if ( '' !== $sent && hash_equals( $this->pin(), $sent ) ) {
			delete_transient( $this->attempts_key() );
			$this->set_cookie( $this->issue_token(), time() + ( self::SESSION_HOURS * HOUR_IN_SECONDS ) );
			// Redirect so a refresh does not re-submit the PIN.
			wp_safe_redirect( get_permalink() );
			exit;
		}

		$this->record_failure();
		wp_safe_redirect( add_query_arg( 'bad', '1', get_permalink() ) );
		exit;
	}

	private function on_log_page(): bool {
		if ( is_admin() || ! is_singular() ) {
			return false;
		}

		$post = get_post();

		return $post instanceof WP_Post && has_shortcode( (string) $post->post_content, self::SHORTCODE );
	}

	/** Keep the log out of search results. */
	public function robots( array $robots ): array {
		if ( $this->on_log_page() ) {
			$robots['noindex']  = true;
			$robots['nofollow'] = true;
		}

		return $robots;
	}

	// ----------------------------------------------------------- the page

	public function register_shortcode(): void {
		add_shortcode( self::SHORTCODE, array( $this, 'render' ) );
	}

	public function render(): string {
		$css = '<style>
			.ltaz-vm{max-width:46rem;margin:0 auto}
			.ltaz-vm-gate{max-width:22rem;margin:2rem auto;text-align:center}
			.ltaz-vm-gate input[type=password]{font-size:1.6rem;letter-spacing:.5em;text-align:center;width:100%;padding:.6em;margin:.75rem 0}
			.ltaz-vm-gate button,.ltaz-vm-lock button{padding:.6em 1.4em;cursor:pointer}
			.ltaz-vm-err{color:#b32d2e;font-weight:600}
			.ltaz-vm-item{border:1px solid #ddd;border-radius:6px;padding:1rem 1.25rem;margin:0 0 1rem}
			.ltaz-vm-who{font-weight:700;font-size:1.05rem}
			.ltaz-vm-meta{color:#666;font-size:.85rem;margin:.15rem 0 .6rem}
			.ltaz-vm-text{white-space:pre-wrap;margin:0 0 .75rem}
			.ltaz-vm-item audio{width:100%}
			.ltaz-vm-lock{text-align:right;margin:1.5rem 0 0}
		</style>';

		return $css . ( $this->is_unlocked() ? $this->render_log() : $this->render_gate() );
	}

	private function render_gate(): string {
		$out = '<div class="ltaz-vm ltaz-vm-gate">';

		if ( $this->is_locked_out() ) {
			return $out . '<p class="ltaz-vm-err">' . esc_html(
				sprintf(
					/* translators: %d: minutes */
					__( 'Too many incorrect attempts. Try again in %d minutes.', 'ltaz' ),
					self::LOCKOUT_MINUTES
				)
			) . '</p></div>';
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only.
		if ( isset( $_GET['bad'] ) ) {
			$left = max( 0, self::MAX_ATTEMPTS - (int) get_transient( $this->attempts_key() ) );
			$out .= '<p class="ltaz-vm-err">' . esc_html(
				sprintf(
					/* translators: %d: remaining attempts */
					__( 'Incorrect PIN. %d attempts left.', 'ltaz' ),
					$left
				)
			) . '</p>';
		}

		$out .= '<form method="post">';
		$out .= '<label for="ltaz-vm-pin">' . esc_html__( 'Enter PIN to view voicemails', 'ltaz' ) . '</label>';
		$out .= '<input id="ltaz-vm-pin" name="ltaz_vm_pin" type="password" inputmode="numeric" '
			. 'autocomplete="off" autofocus required>';
		$out .= '<input type="hidden" name="ltaz_vm_action" value="unlock">';
		$out .= wp_nonce_field( 'ltaz_vm_gate', 'ltaz_vm_nonce', true, false );
		$out .= '<button type="submit">' . esc_html__( 'Unlock', 'ltaz' ) . '</button>';
		$out .= '</form></div>';

		return $out;
	}

	private function render_log(): string {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- pagination only.
		$paged = isset( $_GET['vm_page'] ) ? max( 1, absint( $_GET['vm_page'] ) ) : 1;

		$query = new WP_Query(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => array( 'private', 'publish', 'draft' ),
				'posts_per_page' => self::PER_PAGE,
				'paged'          => $paged,
				'orderby'        => 'date',
				'order'          => 'DESC',
			)
		);

		$out = '<div class="ltaz-vm">';

		if ( ! $query->have_posts() ) {
			$out .= '<p>' . esc_html__( 'No voicemails yet.', 'ltaz' ) . '</p>';
		}

		foreach ( $query->posts as $post ) {
			$from = (string) get_post_meta( $post->ID, self::META_FROM, true );
			$url  = (string) get_post_meta( $post->ID, self::META_URL, true );
			$secs = (int) get_post_meta( $post->ID, self::META_SECS, true );

			$meta = wp_date( 'M j, Y g:i a', get_post_timestamp( $post ) );
			if ( $secs > 0 ) {
				$meta .= sprintf( ' &middot; %d:%02d', intdiv( $secs, 60 ), $secs % 60 );
			}

			$out .= '<div class="ltaz-vm-item">';
			$out .= '<div class="ltaz-vm-who">' . esc_html( $this->pretty_number( $from ) ) . '</div>';
			$out .= '<div class="ltaz-vm-meta">' . wp_kses_post( $meta ) . '</div>';
			$out .= '<p class="ltaz-vm-text">' . esc_html( $post->post_content ) . '</p>';

			if ( '' !== $url ) {
				$out .= '<audio controls preload="none" src="' . esc_url( $url ) . '"></audio>';
			}

			if ( '' !== $from ) {
				$out .= '<p><a href="tel:' . esc_attr( preg_replace( '/\D/', '', $from ) ) . '">'
					. esc_html__( 'Call back', 'ltaz' ) . '</a></p>';
			}

			$out .= '</div>';
		}

		wp_reset_postdata();

		if ( $query->max_num_pages > 1 ) {
			$out .= '<p>';
			if ( $paged > 1 ) {
				$out .= '<a href="' . esc_url( add_query_arg( 'vm_page', $paged - 1, get_permalink() ) ) . '">'
					. esc_html__( 'Newer', 'ltaz' ) . '</a> ';
			}
			if ( $paged < $query->max_num_pages ) {
				$out .= '<a href="' . esc_url( add_query_arg( 'vm_page', $paged + 1, get_permalink() ) ) . '">'
					. esc_html__( 'Older', 'ltaz' ) . '</a>';
			}
			$out .= '</p>';
		}

		$out .= '<form method="post" class="ltaz-vm-lock">';
		$out .= '<input type="hidden" name="ltaz_vm_action" value="lock">';
		$out .= wp_nonce_field( 'ltaz_vm_gate', 'ltaz_vm_nonce', true, false );
		$out .= '<button type="submit">' . esc_html__( 'Lock again', 'ltaz' ) . '</button>';
		$out .= '</form></div>';

		return $out;
	}

	// --------------------------------------------------------- admin list

	public function columns( array $columns ): array {
		return array(
			'cb'              => isset( $columns['cb'] ) ? $columns['cb'] : '',
			'title'           => __( 'Caller', 'ltaz' ),
			'ltaz_vm_message' => __( 'Message', 'ltaz' ),
			'ltaz_vm_length'  => __( 'Length', 'ltaz' ),
			'ltaz_vm_listen'  => __( 'Recording', 'ltaz' ),
			'date'            => __( 'Received', 'ltaz' ),
		);
	}

	public function column( string $column, int $post_id ): void {
		if ( 'ltaz_vm_message' === $column ) {
			$post = get_post( $post_id );
			echo esc_html( wp_trim_words( $post ? $post->post_content : '', 20 ) );
			return;
		}

		if ( 'ltaz_vm_length' === $column ) {
			$secs = (int) get_post_meta( $post_id, self::META_SECS, true );
			echo $secs > 0 ? esc_html( sprintf( '%d:%02d', intdiv( $secs, 60 ), $secs % 60 ) ) : '&mdash;';
			return;
		}

		if ( 'ltaz_vm_listen' === $column ) {
			$url = (string) get_post_meta( $post_id, self::META_URL, true );
			if ( '' === $url ) {
				echo '&mdash;';
				return;
			}
			printf(
				'<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>',
				esc_url( $url ),
				esc_html__( 'Play', 'ltaz' )
			);
		}
	}
}

LTAZ_Voicemail::boot();
