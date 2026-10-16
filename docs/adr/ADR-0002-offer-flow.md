# ADR-0002: Offer-based Flow Replaces Two-sided Matching (A4 revision)

- **Status:** Accepted — 2026-07-06 (supersedes the buy_requests/matches model
  in the original blueprint draft)
- **Context:** Product owner confirmed the flow: seller posts an item →
  buyer sends a price offer on the listing → seller is push-notified →
  seller accepts → meetup is arranged → **the buyer inspects that the item
  matches the listing before the transaction proceeds** ("ของต้องตรง").

## Decision

1. Drop `buy_requests` + `matches` tables and the match-engine Edge Function.
2. Add `conversations` (one per buyer×listing) and `offers` (many per
   conversation; exactly one `pending` at a time via partial unique index;
   48h expiry).
3. `deals` now references `offers` (1:0..1). Deal state machine gains an
   **inspection gate**: `accepted → meetup_planned → inspection_passed →
   (paid_held →) completed`, with `inspection_failed` → auto-cancel, **fee is
   zeroed**, listing reopens, seller takes a trust-score strike.
4. Only the **buyer** may trigger `inspection_passed` / `inspection_failed`
   (enforced in `transition_deal()` in Postgres, not in the client).
5. Accepting an offer auto-declines all other pending offers on the listing
   and sets `listing.status = 'matched'` — done atomically in `accept_offer()`.

## Impact on prior work

- BLUEPRINT.md §1, §3, §4, §5, §6(17), §8 updated in the same commit.
- No client code had been written yet → no app-side migration needed.
- Local DB: outbox op types will be `create_offer` / `send_message` /
  `transition_deal` instead of buy-request ops. No schema change required
  (outbox stores opaque payloads).
- API backward compatibility: N/A (pre-release). This is the v1 contract.

## Consequences

- Simpler MVP (no matching engine to tune) and clearer liability story:
  the platform fee is only ever charged after buyer-confirmed inspection.
- "Buyer demand" discovery is preserved later via saved searches + push,
  without a second posting type.
