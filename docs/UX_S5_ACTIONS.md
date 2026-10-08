# UX-S5 — Action, progress, feedback and next step

**Authority boundary:** no new loan, acquisition, notification or Koha state lives in the UI. Backend authorization, receipts and external reconciliation remain authoritative.

## Canonical action state machine

```
idle → pending (one request) → confirmed (receipt verified)
                      ├── rejected (explicit API 4xx)
                      ├── uncertain (POST/network, invalid JSON, server 5xx)
                      └── unavailable (read-only network error)
```

**Never infer that failed HTTP delivery means the mutation did not occur.** For an uncertain write, show verification guidance, preserve the same idempotency key for an identical request, and do not automatically retry. This is especially important for Koha checkouts/holds. This application layer cannot promise server-side exactly-once semantics for every possible remote fault.

## Runtime contracts

| Surface | Control | DoD |
|---|---|---|
| Navigation | Epoch ticket for each asynchronous render | Late response cannot overwrite more recent route or title; focus only the committed route |
| Forms | One disabled, `aria-busy` submit at a time | Second click cannot launch another POST while pending; restore button markup on rejection |
| Action buttons | Same gate and original button content | Native modal can be cancelled with Escape; focus returns to the trigger |
| Local hold | Receipt `ready / queued / unknown` from LUMEN | One compact persistent link to `/me`, truthful explanation; no claim of an issued loan |
| Acquisition | Backend proposal `pending` receipt | One persistent link to `/acquisti`, never claim purchase complete |
| HTTP GET | Network failure | Safe read retry explanation |
| HTTP mutation | Response missing/invalid or 5xx | Warn that the result may have been recorded; verify before repeating |
| Browser/PWA | Service worker precache | New standalone interaction module available offline; API still never invents cached authoritative states |

No unnecessary overlay, giant status object or new front-end framework. The result indicator is a compact semantic region under the page title and reuses existing button tokens. UI controls do not grant authorization.

## Evidence and falsification

- Pure Node tests: old render epoch rejected; read versus write failure semantics; busy gate prevents repeat and restores original button markup.
- Browser tests: delayed catalog GET followed by navigation; blocked hold POST cannot be submitted twice; aborting POST shows *uncertain* guidance; Escape returns focus to the source action.
- Existing cross-role, S4 pixel budget and 200% text reflow tests are regression gates.
- Operator/manual blockers: WCAG 2.2 AA assessment with screen reader, real Chrome Android/Windows installation/push, live Render/Koha/IdP and 2,000 concurrent enterprise workload.

## Release cuts

UX-S5 passes source-level DoD on exact SHA only when both standard GitHub CI and Playwright are green. UX-S6 then examines full composition and multi-route epistemic consistency; R10 Render, R11 institution integration and R9c mobile PWA can be verified independently. R12 target load/security/HA and R13 institution signoff remain blocked.
