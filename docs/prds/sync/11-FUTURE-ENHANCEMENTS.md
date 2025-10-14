# Future Enhancements

**← Previous:** [Risks & Mitigations](./10-RISKS-MITIGATIONS.md) | **Next:** [Subscription & Monetization](./12-SUBSCRIPTION-MONETIZATION.md) →

This document outlines potential future phases beyond the core multi-device sync implementation.

---

## Web Client (Phase 5)

Browser-based access to notes without requiring Electron installation.

**Key Features:**
- Same Automerge + R2 sync infrastructure
- Progressive Web App (PWA) with offline support
- Browser-based encryption using Web Crypto API
- Vault key management via IndexedDB with optional password unlock

**See:** [Web Client Implementation Plan](../WEB-CLIENT-IMPLEMENTATION-PLAN.md) for detailed specifications.

---

## Real-Time Sync (Phase 6)

Immediate change propagation for near-instant synchronization across devices.

**Key Features:**
- WebSocket or long-polling for live updates
- Live cursors for collaborative editing
- Presence indicators showing active users/devices
- Push notifications for changes

---

## Sharing and Collaboration (Phase 7)

Enable sharing individual notes with other Flint users.

**Key Features:**
- Share individual notes with other DIDs
- Real-time collaborative editing on shared notes
- Permission management (read-only vs. read-write access)
- Sharing via AT Protocol handles or DIDs

---

## Mobile Apps (Phase 8)

Native mobile applications for iOS and Android.

**Key Features:**
- React Native implementation
- Same Automerge + R2 sync architecture
- Platform-specific key storage:
  - iOS: Keychain with Face ID/Touch ID
  - Android: Keystore with biometric authentication
- Mobile-optimized UI and editing experience

---

## Selective Sync (Phase 9)

Control which content syncs to optimize bandwidth and storage.

**Key Features:**
- Choose which note types to sync
- Bandwidth optimization for slow connections
- Mobile data usage controls
- On-demand sync for archived notes
- Automatic sync pausing on metered connections

---

**← Previous:** [Risks & Mitigations](./10-RISKS-MITIGATIONS.md) | **Next:** [Subscription & Monetization](./12-SUBSCRIPTION-MONETIZATION.md) →
