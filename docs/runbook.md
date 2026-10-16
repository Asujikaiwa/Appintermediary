# Runbook — Incident & Release Operations

## Bad release on the stores (binary cannot be rolled back)

1. **Halt rollout** — Play Console: pause staged rollout · App Store Connect:
   pause phased release.
2. **Kill switch** — flip the relevant flag in `app_config.kill_switches`
   (feature-level) — takes effect on next app foreground, no release needed.
3. **JS-level fix** — if the bug is in the JS bundle: `eas update --channel
   production` publishes an OTA fix immediately (store-compliant).
4. **Native-level fix** — ship a hotfix build; once live, raise
   `app_config.min_supported_version` to force-update broken binaries
   (the gate exists in the app since release 1).
5. Post-incident: blameless postmortem in `docs/incidents/`.

## Backend incident

- Dashboards: Supabase project → Logs/Reports; Sentry → Issues (app + edge).
- DB restore: Supabase Pro daily backup (RPO 24h). Restore to a new project,
  repoint staging first, verify, then prod. Also `pg_dump` nightly to R2 via
  GitHub Actions (`backup.yml`, added in the Infra step).
- Escrow/payment incidents (Phase 2): freeze transitions by setting
  `kill_switches.payments = true`; reconcile against Opn dashboard before
  unfreezing.

## Secrets rotation

- Supabase service-role key / Opn keys live only in GitHub + EAS secrets.
- Rotate: create new key → update secrets → redeploy Edge Functions →
  revoke old key. App is unaffected (anon key + RLS only).

## Alert thresholds (actionable only)

- Crash-free sessions < 99.5% within 24h of a release → halt rollout (step 1).
- Edge Function error rate > 2% over 15 min → page on-call.
- p95 API latency > 500ms sustained 30 min → investigate slow queries
  (`pg_stat_statements`).
