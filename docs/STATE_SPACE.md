# Finite transition model and mutation audit

The phrase 'Cartesian product of every possible local computation' is not literally finite for arbitrary user strings, timestamps, datasets or interleavings. LUMEN instead defines **bounded partitions and invariants** that can be enumerated and tested.

Actor = {anonymous, student, faculty, librarian}
Hold = {queued, ready, fulfilled, cancelled}
Loan = {active, returned}
Suggestion = {pending, approved, rejected, ordered}
Copy = {available, on-loan, ready-reserved} derived by constraints
Network = {success, client-retry, timeout, disconnect}
Write = {invalid, forbidden, conflict, committed}

All role x operation pairs must be denied by default. Critical cross-product slices include:
1. two simultaneous holds for one last available copy
2. hold cancellation followed by promotion
3. return followed by oldest queued reservation
4. renewal with queued hold and with no queued hold
5. duplicate issue/return/retry
6. patron acting on another patron's loan
7. faculty vs student acquisition suggestion
8. malformed payload, oversized body, malicious search string
9. expired session and missing/incorrect CSRF
10. push permission rejected, subscription expired and worker retry

Formal invariants:
I1: at most one active loan per copy;
I2: a ready hold reserves at most one available copy capacity per title;
I3: an open hold is unique per user/title;
I4: no direct cross-user mutation by patrons;
I5: FIFO promotions by (created_at, id);
I6: acknowledgement implies transaction commit;
I7: a failed transaction changes no domain state.

Saturation gate: run k6 at 100 / 250 / 500 / 1,000 / 2,000 sessions with realistic read/write mix and datasets; sample p95, error rate, SQLite lock time, memory, CPU and invariants. No load result is included in this version.
