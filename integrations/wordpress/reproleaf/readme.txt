=== Reproleaf — Blog Link Inventory ===
Contributors: vei66rus
Requires at least: 6.5
Requires PHP: 8.1
Stable tag: 0.7.0
License: MIT

Export published stored-content links for a local blog audit.

== Description ==
Tools > Reproleaf exports a JSON inventory after a capability and nonce check.
No external request, frontend link, tracking script, content edit, canonical,
robots, schema or Yoast setting is added or changed.

The export covers stored published posts/pages, excluding passwords and private
records. It does not execute shortcodes or expand navigation, widgets or synced
blocks. Text is limited to 2000-character excerpts. Missing targets are not
proof of broken URLs; no incoming edge in this data is not proof of a site-wide
orphan. 1000 pages and 5 MiB maximum. PHP DOM and mbstring are required.

Install by uploading the ZIP in Plugins, activate, then open Tools > Reproleaf.
The plugin is not submitted to or endorsed by the WordPress plugin directory.
