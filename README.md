# proj6

Static site published with GitHub Pages: https://1clan.github.io/proj6

**GovOne** — a government-portal style platform for managing an individual life.

- Nine offices: Daily Briefing · Finance · Metrics · Operations · Habit Compliance · Planning · Records · Attention · City Council
- Finance issues financial instruments and passes them into force; only passed instruments count toward the treasury balance
- Metrics calculates six indicators, grades them (A+ … F) and issues a national index assessment
- City Council: parliamentarians and ward members, presided over by you as sole Mayor — seat members, call divisions, veto carried motions
- Square-cornered public Sans / IBM Plex Mono portal aesthetic with an official banner, ledger tables, chips and PASSED stamps
- Everything persists in `localStorage` (`gov.v1`) — no account, no server
- Keyboard: `1`–`9` navigate departments
- Export / reset your data from the sidebar

## Tests

```
node tests/run.mjs
```

Drives headless Chrome over the DevTools protocol (no npm dependencies) through 103 assertions across 5 phases: smoke (debug hook, seed, all 9 offices, keyboard navigation), deep functional (finance lifecycle Pass/Recall/Void/Reinstate, ledger filters, metrics grades, national index), city council (seating, stances, quorum, divisions, casting vote and veto), persistence round-trip after reload, and recovery from 11 corrupted/hostile `localStorage` payloads plus a reseed and final smoke pass. Exits non-zero on any failure or uncaught page error. Requires `google-chrome` (override with `CHROME=...`).
