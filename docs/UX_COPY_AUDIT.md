# UX-S1 semantic language and authority audit

**Code baseline:** PR #11 `feat/lumen-s1-business-semantic-truth`. **Class:** source-level copy/receipt coherence. This is neither a Koha interoperability certificate nor a real-device or enterprise performance claim.

## 1. Vocabulary, intentionality and banned implications

| User intent | Canonical label / CTA | Backend truth | Disallowed shortcut |
|---|---|---|---|
| Find a title | Cerca nel catalogo | LUMEN standalone bibliographic search | A successful search is not a guarantee that the book can be borrowed |
| Find holdings | Disponibilità: X copie / Nessuna copia disponibile ora / Da verificare | `books.available` valid nonnegative integer | Never say "In attesa" to describe zero inventory or missing proof |
| Request a title | Invia prenotazione | Local `POST /api/holds`; exact `queued` or `ready` receipt | No "Prenota senza attese"; request is not a loan |
| Track reservation | In coda / Pronto al ritiro / Consegnata / Annullata | Local hold status | Never infer ready from an available book before actual receipt |
| Track loan | In prestito / Restituito / Stato da verificare | Local loan status | Unknown must not become "Restituito" |
| Suggest acquisition | Invia proposta; In valutazione | Faculty proposal recorded as `pending` | Proposal is not purchasing approval |
| Library procurement | Approvata / Non accolta / Ordinata | Proposal review status | "Ordinata" is not evidence of receiving or cataloguing an item |
| Broadcast notification | Invia comunicazione | LUMEN inbox state | Do not claim OS push delivered/read |
| Koha catalog | Catalogo Koha | Koha bibliographic metadata | Never infer stock availability from count of registered items |
| Koha transaction | Request / verified / reconcile | Koha authoritative receipt & recovery | Do not turn remote timeout into confirmed operation |
| Install | Installa app, when browser event allows | Browser/PWA event | Never claim native APK or successful installation based on CTA click |

Words "book", "title", "copy", "reservation", "loan" refer to distinct domain levels. ISBN is a bibliographic identifier, not a physical-copy barcode. Source boundaries must survive any future UI abstraction.

## 2. Route and copy inventory

This inventory covers the navigable surfaces, route-specific primary decision and status categories. Field-level content is embedded in the existing native HTML forms in `public/app.js`; no claim is made that the source inventory is automatically generated.

| Route | End-user task | Primary action / copy owner | Error, blank, role state |
|---|---|---|---|
| `/` | Understand service, start search | Cerca / Catalogo, descriptive library context | No promise of opening hours or queue absence |
| `/catalogo` | Find standalone title | Search by title, creator, ISBN or subject; book card details | No results, 120-item limit, no invented availability |
| `/catalogo/:id` | Evaluate one book and request hold | Invia prenotazione; local available count | Not found, unauthenticated request, `ready`/`queued` receipt |
| `/me`, `/me/prenotazioni` | Track own holds and loans | Rinnova, Annulla, current status + due date | Empty holds/loans, denied transitions, unknown states |
| `/acquisti` | Faculty acquisition proposal | Invia proposta; review statuses | Faculty-only (backend RBAC), duplicate ISBN and validation |
| `/notifiche` | Read authoritative inbox | Segna come letta | Empty/unread/read, no OS-delivery inference |
| `/staff` | Operate library desk | Checkout/return, users, review proposals, broadcast | Staff-only (backend RBAC), conflict/denial/reconciliation |
| `/koha`, `/koha/:id` | Search external bibliographic source | Ricerca/holding based only on Koha flags | Unconfigured, read-only, mapping or unknown stock |
| `/koha/me`, `/koha/loans` | Inspect source-of-truth transactions | Koha holds/loan operations as permitted | Unmapped identity, external uncertain outcome |
| `/staff/koha-pending`, `/staff/koha-loans-pending`, `/staff/koha-returns` | Reconcile uncertain external operations | Verify and reconcile, staff only | No silent assumed PASS |
| `/accedi` | Establish an identity | Login / OIDC if configured | Invalid credentials, SSO only, expired session |
| `/impostazioni` | Account, push consent | Change password, opt-in/opt-out, sign out | VAPID unconfigured, denied, ownership mismatch |
| `/installazione` | PWA installation | Browser-owned Install CTA or manual instructions | Unsupported/not-promptable/install denied or installed |
| Unknown path | Recovery from navigation error | Back to catalogue | No fake content; explicit not-found message |

## 3. Mutation receipts and display obligations

Local holds render confirmation **only** from a backend receipt; `ready` and `queued` are exclusive alternatives. Any unrecognized value produces "Esito da verificare" and requires checking the personal area before retrying. The generic `Operazione registrata` success text is disallowed for state-bearing actions.

For local library mutations, a successful HTTP response enables a *scoped* acknowledgement: book created, account created, loan checkout recorded, notification inserted in recipient inbox. For local loan renewals, cancellation, returns, status reviews and mark-read, the action label is scoped to the server transition actually invoked. None of these implies Koha, Chrome Push, stock acquisition completion or mail dispatch.

Successful Koha actions preserve their existing receipt-based copy and are **not** reinterpreted by the standalone selectors introduced in UX-S1. Real Koha runtime integration remains a separate release gate.

## 4. Normative local/intermediate/global DoD

- **Local (automated):** pure selectors `localAvailability`, `localHoldResult`, `localStatus`, `localActionFeedback`, `localClickFeedback`; mutate boundary states (null/undefined/negative/string/zero/one/many, known/unknown receipt, every status) and reject overclaims.
- **Intermediate (automated):** standalone book cards and detail use the same local availability function; hold submit uses returned receipt; proposals/loans/reservations translate supported status; other local mutations show exact success feedback; Koha rendering unchanged; three profile navigation still works.
- **Global (automated):** `npm run check`, `npm test`, `npm run verify:boot`, Playwright desktop + Android emulation, and Render configuration gate PASS at the PR HEAD. No added production dependency.
- **External (blocked):** actual Render service/backup restore, real Koha+institutional IdP, physical Chrome install+push delivery, 2,000 realistic concurrent load and signed institutional enterprise acceptance.

## 5. Forward compatible rules

UX-S2 may compose role-specific non-authoritative cards, but only from these explicit state projections plus source metadata. UX-S3 can group pages and navigation; UX-S4 can compress large visuals; UX-S5 can verify every CTA and accessible task path; UX-S6 can publish SHA-bound screenshot/reflow and epistemic reports. None may weaken these source/receipt invariants to improve appearance.
