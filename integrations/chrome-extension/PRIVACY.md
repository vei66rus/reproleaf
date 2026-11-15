# Reproleaf SEO & GEO Inspector Privacy Policy

Reproleaf SEO & GEO Inspector runs strictly on demand inside the popup window when the user clicks Inspect Active Tab or Extract SERP / Competitor.

- **Permissions:** Uses only `activeTab` and `scripting` to read the DOM of the currently focused tab after an explicit click. No `<all_urls>` or `host_permissions` are requested, and no background service worker collects browsing history.
- **Data Handling:** Page title, metadata, headings, image attributes, JSON-LD types, and SERP result links stay in local extension memory until copied to the clipboard by the user. Zero analytics scripts, cookies, or third-party servers are contacted.
- **Web Handoff:** Clicking Open in `evolkov.tech` copies the local JSON packet to the user's clipboard and opens a clean tool URL without embedding draft text, HTML, or findings in query parameters.
