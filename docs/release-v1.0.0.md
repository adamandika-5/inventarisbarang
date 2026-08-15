# Inventaris Barang v1.0.0

## Status
Production release.

## Core Features
- Item, category, and unit management with conversion factors
- Stock-in (Admin only, quantity-based)
- Stock-out (Employee & Admin, with live camera barcode scanning)
- Stock adjustment with strict idempotency and row-level locking
- Transaction reversal with double-reversal prevention
- Barcode printing and Code128 generation
- Inventory summaries and transaction reports with Excel export (.xlsx)
- User management (Admin & Employee roles)
- Append-only audit logs with detailed change metadata
- System and account settings
- Dark and light responsive UI with PWA support

## Security
- Server-side authorization and route protection (Defense-in-depth: Middleware + Server Layouts + DB)
- Supabase Row Level Security (RLS) on all exposed tables
- Multi-layer login rate limiting with HMAC-SHA256 account/IP hashing
- Forced password change workflow for new and reset employee accounts
- Immediate block on inactive user accounts
- Append-only audit trail for all business mutations
- Atomic transactions with `SECURITY DEFINER` RPCs and explicit concurrency controls

## Validation
- 35 unit and integration test files passing (500+ assertions)
- Playwright E2E test suite verified on dedicated testing environment
- Production smoke test passed across all public and protected routes
- Controlled production stock and reversal transaction test passed (baseline integrity preserved)
- Migration consistency audit passed (001–015 fully matched)

## Deployment
- Frontend: Vercel Production ([https://inventarisbarang.vercel.app](https://inventarisbarang.vercel.app))
- Backend & Database: Supabase PostgreSQL (`ruvfxziudpfyntahupqn`)

## Known Operational Note
Manual logical production backup is **DEFERRED** due to local storage constraints and Docker dependency for CLI dump utilities. A complete disaster recovery plan is documented, but no manual backup file should be claimed to exist. Manual backups must be created once local storage or Docker capability is provisioned.
