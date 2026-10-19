# Evently — Event Management ERP (Next.js PWA, frontend demo)

A complete, interactive **frontend** for an event-management ERP (weddings, destination weddings, corporate events, launches, activations). It runs entirely in the browser on realistic seed data persisted in `localStorage`, behind a service/repository layer so a real backend can replace it later without rewriting the UI.

> **Demo status.** All data is demo data. Payments, e-mail/WhatsApp sending, vendor replies, bank feeds and push delivery are **simulated** — the UI says so wherever it matters. Tax documents are configurable templates, not legal advice.

Built from `event_management_system_architecture.md` (Event = operational centre; receivables ≠ payables; documents are immutable snapshots; ad-hoc items are first-class; money is exact).

---

## Quick start

Requires **Node 20+** (developed on Node 22) and npm.

```bash
npm install          # .npmrc sets legacy-peer-deps (one optional peer of @hookform/resolvers conflicts)
npm run dev          # http://localhost:3000 — service worker is OFF in dev
```

Production build (enables the service worker / installability):

```bash
npm run build
npm run start        # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (0 errors, 0 warnings) |
| `npm test` | Vitest unit tests for the money / quote / inventory / funnel / finance rules |
| `npm run test:e2e` | Playwright (builds + starts on :3100): every route, critical journeys, PWA/offline |

First-time Playwright setup: `npx playwright install chromium`. To test against an already-running server: `BASE_URL=http://localhost:3000 npx playwright test`.

Everything is reset-able: **Settings → Application & PWA → Reset demo data**.

## What you can do (walk-through)

Switch roles from the avatar menu (Administrator, Manager, Coordinator, Finance, Viewer) — modules, tabs and actions follow the role's permission codes.

1. **Client → Event** — `Leads` (drag cards between stages) → *Create event from lead* → 4-step **event wizard** (templates load functions, departments, tasks, milestones; venue/coordinator clashes are flagged live).
2. **Vendor agreement → payment** — `Events → Vendors → Assign vendor` → pick catalogue or custom items → record *vendor quote* and *agreed rate* separately → **Send** (generates a requirement/RFQ PDF) → **Confirm scope** (stores an immutable snapshot) → **Approve** → **Issue work order** (PO + PDF) → record delivery (partial/complete) → record vendor bill → approve → pay (advance or bill). Revising a confirmed agreement creates a new version.
3. **Quotation → invoice** — `Quotations → New` → lines grouped by department, discounts, tax mode (exclusive / inclusive / none), fees, advance %, terms → internal review → internal approval → send → client approved → **Convert to booking** (sales order + payment milestones, event confirmed) → invoice a milestone (proforma / tax invoice / bill of supply) → record payment → credit note / refund.
4. **Inventory** — allocate stock to an event (refused if it would double-book overlapping events) → dispatch → return → record damaged/missing → rental cost becomes a pending expense; availability calendar and reorder alerts.
5. **Tasks → notifications** — board / list / table / calendar, dependencies (blocked tasks can't start or finish), checklists, comments, attachments, priority funnel, overdue detection; the alert engine raises de-duplicated notifications.
6. **Financial closure** — `Event → Close event` runs reconciliation checks, generates a settlement statement PDF and writes an audit entry.

Also: dashboard (derived from the data, with range/type filters), global search (`Ctrl/⌘ K` or `/`), calendar (month/week/day/agenda, filters, clash markers), finance (profitability, payables, expenses, petty cash, cash flow), 12 reports with CSV export, documents centre (preview / download / version history), departments (add / edit / reorder / deactivate), vendor catalogue with price history, settings (company, users & roles matrix, catalogues, numbering, tax, workflow matrix, notification preferences, audit log).

## Architecture

```
src/
  app/(app)/…            Route pages (App Router). (app)/layout.tsx wraps everything in AppShell.
  components/
    ui/                  Button, inputs, Badge, Card, Modal/Sheet, Tabs, Toaster, Kanban (dnd-kit)
    tables/              DataTable (TanStack Table: search, filters, sort, pagination, CSV)
    forms/               FormDialog (React Hook Form + Zod, schema-driven), entity dialogs
    layout/              AppShell, sidebar, mobile nav, command menu, notification list
    charts/              Recharts wrappers   documents/  PDF preview dialog
  features/              Feature UIs that are too big for a page (event detail, vendor agreement editor,
                         quotation editor, billing dialogs, calendar, settings, tasks)
  services/              WRITE side. Workflow functions (createEvent, convertToBooking, payVendor …).
                         Replace these with API calls when a backend exists.
  stores/db.ts           Local "database" (Zustand + immer + persist). READ side via hooks.
  lib/
    calculations/        Pure, tested business rules: money, quote, invoice, finance, inventory, conflicts, tasks, metrics
    documents/builders   Document snapshots   pdf/render  Real PDF output (jsPDF + autotable)
    validation/          Zod schemas (portable)   pwa/  Service-worker / notification / push helpers
  mock-data/             Deterministic seed dataset (dates are relative to "today")
  types/index.ts         Domain model (framework-free, reusable by a backend / React Native)
public/sw.js             Service worker      app/manifest.ts   Web App Manifest
tests/                   Vitest              e2e/              Playwright
```

**Data flow:** UI reads with `useDB(...)` hooks → user actions call functions in `src/services` → they mutate the store (`mutate(draft => …)`), append an audit entry and, where relevant, create de-duplicated notifications. Swapping the store for TanStack Query + REST means re-implementing `services/*` and the read hooks; pages, forms and calculations stay.

**Key rules (all covered by unit tests where marked ✔):**
- **Money is integer minor units (paise)** — no floating-point totals ✔. Tax modes: exclusive / inclusive / none, rounded per line ✔.
- **Snapshots, not references** — quotation versions, sales orders, vendor agreement lines/snapshots, invoices and generated documents copy their values; editing a catalogue rate never changes issued records ✔.
- **Receivables and payables are separate.** Every figure is labelled *estimated / committed / invoiced / paid / outstanding*:
  - Estimated profit = revenue basis (sales order → approved quote → draft quote → budget) − committed vendors − recorded expenses.
  - Actual result = tax invoices (net of credit notes; proforma excluded) − approved vendor bills − expenses.
  - Cash = receipts − refunds − vendor payments − paid expenses. Nothing is counted twice ✔.
- **Document naming:** a *proforma* is a payment request, never a tax invoice; tax invoices are blocked when the company isn't tax-registered; vendor invoices are recorded (not issued) as *vendor bills*.
- **Task funnel buckets are mutually exclusive** (Overdue → Critical → Due today → Due soon → Upcoming → No deadline; completed separate) ✔.
- **Conflict engine:** venue, coordinator, vendor availability and stock double-booking.

## PWA

Implemented: manifest (standalone, icons incl. maskable, shortcuts), service worker (`public/sw.js`), install banner (`beforeinstallprompt`), online/offline indicator, offline fallback page, update-available banner (`SKIP_WAITING`), local browser notifications behind an explicit user action, push subscription UI.

- **Caching policy:** only the offline page, icons and `/_next/static/*` are cached. HTML and any `/api/*` response are **never** cached, so private client/vendor/financial data is not stored by the worker. (The demo's records live in `localStorage` on the device.)
- **Requirements:** service workers/installation need **HTTPS or `localhost`**. Install prompt: Chrome/Edge/Samsung Internet (desktop + Android). iOS/iPadOS Safari: *Share → Add to Home Screen* (no `beforeinstallprompt`; web push needs the app installed on iOS 16.4+). Firefox desktop doesn't install PWAs.
- The worker is registered **only in production builds** (append `?sw=1` in dev to opt in).
- **Push integration boundary (needs a backend):** the worker already handles `push` and `notificationclick`, and `lib/pwa/client.ts#subscribeToPush` returns a `PushSubscription` payload. To get real background delivery you must add: (1) VAPID keys → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; (2) `POST /api/push/subscribe` storing subscriptions per user/device; (3) a sender (e.g. `web-push`) fed by the notification/outbox worker. Today's alerts are produced client-side by the simulated alert engine (`services/ops.ts#syncAlerts`) and only surface as browser notifications while the app is open.

## Deployment

Any Node host (Vercel, Render, Fly, a container) — `npm run build && npm start`. No environment variables are required for the demo (see `.env.example`). Serve over HTTPS for installability. `next.config.ts` already sends `Cache-Control: no-cache` for `/sw.js`.

## Feature status

**Implemented & verified (unit + Playwright):** all modules above; schema-validated forms; role simulation; persistence across refresh; real PDFs (quotation, vendor requirement, work order, invoice/proforma/credit note, receipt, expense report, event summary, settlement); notifications with read states and deep links; installable PWA + offline fallback.

**Simulated in the demo:** payments and bank feeds, vendor/client replies (the *Simulate business events* buttons), e-mail/WhatsApp sending ("Mark as sent" only records status), file attachments (file *names* only), push delivery, authentication (role chooser), numbering atomicity (a local counter).

**Needs a backend before production:** authentication/MFA and server-side authorization with record scopes; PostgreSQL persistence and transactions for numbering, payments and document issuance; private file storage and signed URLs (vendor bills, logos, attachments); server-rendered/archived PDFs with checksums; background jobs for reminders and notification fan-out; Web Push sender; e-mail/WhatsApp providers; statutory tax-document rules reviewed by an accountant; audit log immutability.

**Not built (by design / next):** dark theme (the blueprint specifies a light theme), React Native app (types, Zod schemas, calculations and service contracts are portable for it), multi-currency, per-field event-type form builder, recurring tasks.

## Known limitations

- `localStorage` is small (~5 MB) — fine for the demo dataset, not for production data.
- Quotation/PDF generation uses jsPDF core fonts, so the PDF shows `Rs.` instead of `₹`.
- Calendar and board views are optimised for dozens, not thousands, of records.
