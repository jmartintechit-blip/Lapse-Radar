# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

First release (0.1.0) is in preparation.

### Added

- Accounts: sign-up, sign-in, sign-out with cookie sessions, password-confirmed account deletion, read-only demo account.
- Items: TLS certificate, domain (RDAP) and manual items with per-user isolation and a cap per account.
- Checks: SSRF-safe TLS and RDAP checkers, hourly scheduled run with an advisory lock, "check now" with a per-item rate limit.
- Alerts: idempotent engine (one alert per item, threshold and expiry date, re-armed by renewal), in-app inbox, configurable thresholds.
- Email: Resend sender with a daily cap overall and per user.
- Interface: landing page with a radar graphic, light and dark themes, self-hosted IBM Plex fonts, responsive dashboard, keyboard and screen-reader support, privacy page.
- Hardening: security headers and CSP, Origin check on writes, per-user write limits, rate limits by IP (IPv6 by /64).
- Tests: unit and integration tests, Playwright end-to-end tests, CI on GitHub Actions.
