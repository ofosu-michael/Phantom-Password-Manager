# Changelog

## [Unreleased]

- Add project governance, licensing, and contribution guidelines
- Implement salt-based PBKDF2 hashing with brute-force lockout persistence
- Add DOMPurify markdown sanitization

## [1.0.0] - 2026-05-22

Initial public release.

### Features

- AES-256-GCM encryption — all vault data encrypted in-browser
- Password strength audit with real-time scoring and crack-time estimates
- Breach detection via Have I Been Pwned API
- TOTP support for built-in 2FA code generation
- Import/Export — CSV import from other managers, encrypted `.pv` backups
- Auto-lock with configurable inactivity timeout
- Password history tracking (up to 5 per item)
- Categories: Logins, Cards, Notes, and Identity items
- Custom folders with drag-and-drop organization
- Dark theme UI built with Tailwind CSS
- Salt-based PBKDF2 key derivation with brute-force lockout
- DOMPurify markdown sanitization for notes
- HIBP API caching for offline breach checks
- Asynchronous decryption with Vitest support
- Security dashboard with password strength analysis and audit checklist
- Auto-scroll support during drag-and-drop operations

### Refactors

- Redesigned UI components and dashboard layout
- Compact design for VaultList header components
- Bottom navigation with consolidated vault item management
- Streamlined UI components across the app
