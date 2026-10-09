# proj6

Static site published with GitHub Pages: https://1clan.github.io/proj6

**GovOne** — a government-portal style platform for managing an individual life.

- Eight departments: Daily Briefing · Finance · Metrics · Operations · Habit Compliance · Planning · Records · Attention
- Finance issues financial instruments and passes them into force; only passed instruments count toward the treasury balance
- Metrics calculates six indicators, grades them (A+ … F) and issues a national index assessment
- Square-cornered public Sans / IBM Plex Mono portal aesthetic with an official banner, ledger tables, chips and PASSED stamps
- Everything persists in `localStorage` (`gov.v1`) — no account, no server
- Keyboard: `1`–`8` navigate departments
- Export / reset your data from the sidebar

## Tests

```
node tests/run.mjs
```

Drives headless Chrome over the DevTools protocol (no npm dependencies) through 85 assertions across 4 phases: smoke (debug hook, seed, all 8 departments, keyboard navigation), deep functional (finance lifecycle Pass/Recall/Void/Reinstate, ledger filters, metrics grades, national index), persistence round-trip after reload, and recovery from 11 corrupted/hostile `localStorage` payloads plus a reseed and final smoke pass. Exits non-zero on any failure or uncaught page error. Requires `google-chrome` (override with `CHROME=...`).
