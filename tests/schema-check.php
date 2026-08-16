<?php
/**
 * Standalone check for the LTAZ MCP Tools surface.
 *
 * Runs without WordPress: it stubs the handful of WP functions the tool
 * *registration* path touches, then asserts that the advertised surface is
 * exactly what the PPS staging server exposes and that every tool is wired to
 * a handler. Handler bodies are not executed -- those need a real site.
 *
 *   php tests/schema-check.php
 *
 * Exits non-zero on any failure, so it drops straight into CI.
 */

define( 'ABSPATH', __DIR__ );

// Pretend both optional dependencies are present so all 48 tools register.
class WooCommerce {}

function add_action() {}
function add_filter() {}
function get_option( $key, $default = false ) {
	return $key === 'astra-settings' ? array( 'placeholder' => 1 ) : $default;
}
function get_stylesheet() { return 'astra-child'; }
class LTAZ_Test_Theme {
	public function get_stylesheet() { return 'astra-child'; }
	public function get_template() { return 'astra'; }
}
function wp_get_theme() { return new LTAZ_Test_Theme(); }

require __DIR__ . '/../ltaz-mcp-tools/ltaz-mcp-tools.php';

$expected = array(
	'assign_menu_location', 'create_nav_menu', 'delete_menu_item', 'delete_reusable_block',
	'get_astra_setting', 'get_custom_css', 'get_nav_menu', 'get_reusable_block',
	'get_sidebars_widgets', 'get_site_identity', 'get_theme_mods', 'list_nav_menus',
	'list_reusable_blocks', 'list_sidebars', 'plugin_delete_file', 'plugin_download_url',
	'plugin_list_files', 'plugin_read_file', 'plugin_write_file', 'save_menu_item',
	'save_reusable_block', 'set_astra_setting', 'set_custom_css', 'set_site_identity',
	'set_theme_mod', 'theme_list_files', 'theme_read_file', 'theme_write_file',
	'uploads_delete_batch', 'uploads_delete_file', 'uploads_list_files',
	'uploads_retention_get', 'uploads_retention_run_now', 'uploads_retention_set',
	'woo_add_order_note', 'woo_get_category', 'woo_get_order', 'woo_get_product',
	'woo_list_categories', 'woo_list_orders', 'woo_list_products',
	'woo_update_order_status', 'woo_update_product', 'wp_check_updates',
	'wp_get_plugin_versions', 'wp_update_core', 'wp_update_plugin', 'wp_update_theme',
);
$expected = array_map( fn( $n ) => 'pps_' . $n, $expected );
sort( $expected );

$failures = array();
$tools    = ( new LTAZ_MCP_Tools() )->register_tools( array() );
$names    = array_map( fn( $t ) => $t['name'], $tools );
sort( $names );

// 1. The advertised surface matches PPS staging exactly.
foreach ( array_diff( $expected, $names ) as $missing ) {
	$failures[] = "missing tool: $missing";
}
foreach ( array_diff( $names, $expected ) as $extra ) {
	$failures[] = "unexpected tool: $extra";
}

// 2. Every tool is well-formed and its schema survives the JSON trip MCP makes.
foreach ( $tools as $tool ) {
	$name = $tool['name'];
	foreach ( array( 'name', 'description', 'inputSchema', 'category', 'annotations' ) as $key ) {
		if ( ! isset( $tool[ $key ] ) ) {
			$failures[] = "$name: missing '$key'";
		}
	}

	$json = json_encode( $tool['inputSchema'] );
	if ( $json === false ) {
		$failures[] = "$name: inputSchema is not JSON-encodable";
		continue;
	}

	// An empty PHP array encodes as [] and MCP validators reject it there.
	if ( str_contains( $json, '"properties":[]' ) ) {
		$failures[] = "$name: empty properties encoded as [] instead of {}";
	}

	$schema = json_decode( $json, true );
	if ( ( $schema['type'] ?? null ) !== 'object' ) {
		$failures[] = "$name: inputSchema type is not 'object'";
	}
	foreach ( ( $schema['required'] ?? array() ) as $required ) {
		if ( ! array_key_exists( $required, (array) ( $schema['properties'] ?? array() ) ) ) {
			$failures[] = "$name: required '$required' is not declared in properties";
		}
	}
}

// 3. Every advertised tool reaches a handler that exists.
$source  = file_get_contents( __DIR__ . '/../ltaz-mcp-tools/ltaz-mcp-tools.php' );
preg_match_all( "/case \\\$this->prefix \. '([a-z_0-9]+)':\s+\\\$data = \\\$this->([a-z_0-9]+)\(/", $source, $m, PREG_SET_ORDER );
$dispatch = array();
foreach ( $m as $match ) {
	$dispatch[ 'pps_' . $match[1] ] = $match[2];
}
preg_match_all( '/private function ([a-z_0-9]+)\s*\(/', $source, $fn );
$methods = $fn[1];

foreach ( $names as $name ) {
	if ( ! isset( $dispatch[ $name ] ) ) {
		$failures[] = "$name: advertised but has no dispatch case";
	}
	elseif ( ! in_array( $dispatch[ $name ], $methods, true ) ) {
		$failures[] = "$name: dispatches to {$dispatch[$name]}() which does not exist";
	}
}

// 4. Optional dependencies gate their tool groups.
$gated = ( new LTAZ_MCP_Tools() )->register_tools( array() );
if ( count( $gated ) !== count( $tools ) ) {
	$failures[] = 'registration is not deterministic across calls';
}

if ( $failures ) {
	echo "FAIL (" . count( $failures ) . ")\n  " . implode( "\n  ", $failures ) . "\n";
	exit( 1 );
}

echo 'PASS: ' . count( $names ) . " tools, surface matches PPS staging, all handlers wired\n";
