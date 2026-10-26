# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Password reset by email (one-time link, valid for 1 hour, closes every session) and a "forgot your password" page.
- Email confirmation: a link is sent at sign-up and can be sent again from the dashboard. Alert emails go only to confirmed addresses.
- Change password (asks for the current one, closes the other sessions) and change email (the new address must confirm a link first).
- Spanish and English interface with a selector (remembered, default from the browser language), including the server's error messages and every email.
- Local dev outbox at `/__outbox` instead of sending account emails.

### Changed

- Deleting an account also removes its pending links and rate-limit counters.

### Security

- Patched the `body-parser` denial-of-service advisory; PGlite 0.5.12.

## [0.1.0] - 2026-10-22

First release.

### Added

- Accounts: sign-up, sign-in, sign-out with cookie sessions, password-confirmed account deletion, read-only demo account.
- Items: TLS certificate, domain (RDAP) and manual items with per-user isolation and a cap per account.
- Checks: SSRF-safe TLS and RDAP checkers, hourly scheduled run with an advisory lock, "check now" with a per-item rate limit.
- Alerts: idempotent engine (one alert per item, threshold and expiry date, re-armed by renewal), in-app inbox, configurable thresholds.
- Email: Resend sender with a daily cap overall and per user.
- Interface: landing page with a radar graphic, light and dark themes, self-hosted IBM Plex fonts, responsive dashboard, keyboard and screen-reader support, privacy page.
- Hardening: security headers and CSP, Origin check on writes, per-user write limits, rate limits by IP (IPv6 by /64).
- Tests: unit and integration tests, Playwright end-to-end tests, CI on GitHub Actions.
