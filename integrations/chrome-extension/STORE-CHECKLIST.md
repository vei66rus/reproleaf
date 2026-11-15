# Chrome Web Store Submission Checklist

1. **Manifest v3 Compliance:** `manifest_version: 3`, strict CSP `script-src 'self'; object-src 'self'`, zero remote code loading.
2. **Minimal Permissions:** `permissions: ["activeTab", "scripting"]`, zero `host_permissions`, zero persistent background workers.
3. **Icons & Assets:** Provided PNG icons at 16x16, 48x48, and 128x128 (`icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`).
4. **Bilingual UI (RU/EN):** Instant client-side language toggle with zero external translation API calls.
5. **Privacy Disclosure:** See `PRIVACY.md` for single-purpose active-tab inspection justification and zero-telemetry policy.
