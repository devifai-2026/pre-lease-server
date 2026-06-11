# P-Lease-Grid — Product Overview (Roles, Flows & Lifecycle)

> Reverse-engineered from the `production` branch of all three repos and verified against the live Supabase Postgres DB and prod API. Counts in parentheses are real DB row counts as of 2026-06-11.

---

## 1. What the product is

**P-Lease-Grid** is a **pre-leased commercial real-estate marketplace + internal sales CRM** for the Indian market.

It connects the **supply side** (property Owners, Brokers listing on behalf of clients, Investors) with the **demand side** (prospective tenants/buyers who submit enquiries), and gives an **internal sales team** the tooling to verify listings, distribute leads, and track conversions.

"Pre-lease" is the core value proposition: properties that are **already leased to a tenant** are sold/marketed to investors on the basis of a guaranteed rental yield / ROI. That is why the property detail pages are heavily financial (ROI, cashflow, escalation, PLG returns calculator at `/api/v1/calculator/plg`).

**Two apps, one backend:**

| App | Repo | Stack | Audience |
|---|---|---|---|
| Consumer app | `propertyGridMasterApp` | React Native (iOS / Android / Web) | Public — owners, investors, brokers, guests |
| Admin dashboard | `p-grid_admin` | Vite + React 19 + Tailwind (Web) | Internal — sales team, admins |
| API + DB | `pre-lease-server` | Node/Express + Sequelize (Postgres) + MongoDB (logs) + socket.io | Both |

---

## 2. The 8 roles (verified from DB)

Roles are split into two `role_type`s: **client** (external users) and **admin** (internal staff). A user can hold multiple roles.

| # | Role | Type | Users | Permissions in DB | What they do |
|---|---|---|---:|---|---|
| 1 | **Owner** | client | 8 | PROPERTY_CREATE / UPDATE / DELETE | Lists and manages their own properties |
| 2 | **Investor** | client | 6 | *(none)* | Browses, compares, enquires, buys |
| 3 | **Broker** | client | 29 | PROPERTY_CREATE / UPDATE / VIEW | Lists properties on behalf of clients |
| 4 | **Sales Executive – Property Manager** | admin | 4 | PROPERTY_NOTES | Verifies & manages **assigned properties** |
| 5 | **Sales Executive – Client Dealer** | admin | 3 | PROPERTY_INQUIRY_VIEW | Works **assigned enquiries / leads** |
| 6 | **Sales Manager** | admin | 4 | USER_CREATE / USER_VIEW | Supervises executives, creates users |
| 7 | **Admin** | admin | 2 | USER_*, ROLE_ASSIGN/REVOKE, AUDIT_LOG_VIEW, SYSTEM_CONFIG | Full user & role management |
| 8 | **Super Admin** | admin | 1 | *(same 8 as Admin)* | Top-level; bootstraps the system |

**Full permission catalogue (16):** `PROPERTY_CREATE, PROPERTY_UPDATE, PROPERTY_DELETE, PROPERTY_VIEW, PROPERTY_INQUIRY_VIEW, PROPERTY_NOTES, REPORT_ANALYTICS, REPORT_SALES, ROLE_ASSIGN, ROLE_REVOKE, AUDIT_LOG_VIEW, SYSTEM_CONFIG, USER_CREATE, USER_UPDATE, USER_DELETE, USER_VIEW`.

> Note: `REPORT_ANALYTICS` / `REPORT_SALES` exist but are not currently granted to any role in the DB.

**The hierarchy (sales side):**

```
Super Admin / Admin
        │ creates & assigns
        ▼
   Sales Manager ──── supervises ────┐
        │                            │
        ▼                            ▼
Sales Executive –            Sales Executive –
Property Manager             Client Dealer
(verifies properties)        (handles enquiries)
```

The `sales_relationship` table (7 active rows) maps each executive → their manager, with `assigned_by` pointing at the Super Admin.

---

## 3. What a user can do WITHOUT logging in (guest flow)

The consumer API exposes a set of **public, no-auth endpoints** (declared "PUBLIC APIS (NO AUTHENTICATION)" in `src/routers/property.js`). A guest can browse the whole marketplace; they only hit a login wall when they try to *act* (enquire, like, list, contact a broker).

### Step by step — guest journey

1. **Open the app** → lands on the dashboard / home. No token required.
2. **Browse public data** (no login):
   - `GET /api/v1/properties` — list all properties (25)
   - `GET /api/v1/properties/counts` — counts by category
   - `GET /api/v1/properties/:propertyId` — full property detail
   - `GET /api/v1/properties/compare` — side-by-side comparison
   - `GET /api/v1/get-hot-properties` — featured listings
   - Static/info screens: blogs, how-it-works, calculators, legal, contact-us
3. **Use the ROI / PLG calculator** — runs client-side + `/calculator/plg`; no account needed.
4. **Hits the auth wall** the moment they try to:
   - **Submit an enquiry** on a property → must log in (`createPropertyInquiry` requires `authenticateUser`)
   - **Like / wishlist** a property → requires auth
   - **Contact a broker** → requires auth
   - **List a property** → requires auth
   - View **My Enquiries / Profile / Notifications**
5. **Authenticate via OTP** (mobile-first; no password for clients):
   - `POST /send-otp` { mobileNumber } → returns a `verificationId`
   - `POST /verify-otp` or `POST /login` { mobileNumber, otp, verificationId }
   - On first login a brand-new number → **guest user** (no roles yet); `signup` collects name/email/role.
   - ⚠️ **Security note:** OTP `111111` currently bypasses real verification on the backend (`controllers/user.js`) — a test backdoor that must be removed before production.

So: **guests can see everything, but cannot transact.** The product is "browse freely, log in to engage."

---

## 4. Property listing → assignment lifecycle (step by step)

This is the heart of the workflow. Verified against `controllers/property.js` (createProperty) and `controllers/admin.js` (verify/assign).

### Step 1 — A user lists a property
- Owner or Broker fills the multi-step wizard (basic details, location, lease, legal, financial, amenities, media) and calls `POST /api/v1/properties`.
- The route **intentionally does not enforce `PROPERTY_CREATE` permission** (comment: *"Removed strict checkPermission to allow self-service listing"*). The controller decides eligibility instead.
- On success, the creator is **auto-granted the `Owner` role** (`autoAssignRole(userId, "Owner", "property_created")`) — even a guest becomes an Owner by listing.
- Media files (≤10) are uploaded to **Google Cloud Storage** and stored in `property_media`.

### Step 2 — The property is AUTO-ASSIGNED to a Sales Executive (Property Manager)
This happens automatically inside `createProperty`, not in a separate admin action:

1. Find all **active "Sales Executive – Property Manager"** users.
2. Count how many active properties each of them currently owns (`salesId` grouping).
3. **Assign the new property to the Property Manager with the FEWEST active properties** (load-balancing via a `reduce` over the count map).
4. Set `properties.sales_id = <chosen executive>`, with `salesAssignmentType = "auto"`, `salesAssignedBy = "system"`.

> Verified live: **all 25 properties have a `sales_id`** — i.e. every listing is assigned. If no Property Manager exists, `sales_id` stays null and the property is unassigned.

### Step 3 — Notifications cascade (socket.io + `property_notification_event`)
When the property is created and assigned, events are emitted to:
1. **The creator** (Owner/Broker) — "your property was listed"
2. **The assigned Sales Executive (Property Manager)** — "a property was assigned to you"
3. **That executive's Sales Manager** — looked up via `sales_relationship` — "your executive received a new property"

(877 such notification events exist in the DB.)

### Step 4 — Verification (two-group rule)
The assigned Property Manager (and Admins) verify the listing via `POST /api/v1/admin/properties/:propertyId/verify`. Rules (from the route docs + `controllers/admin.js`):
- **Allowed roles:** Admin, Super Admin, Sales Executive – Property Manager (own assignments only).
- **One person can verify only once.**
- Status becomes **`partial`** after the first verifier.
- Status becomes **`completed`** only when **both role groups have verified** — i.e. the *sales* side (Property Manager) **and** the *admin* side (Admin/Super Admin).
- Each verification is logged in `property_verification_logs`; `properties.is_verified` is recalculated from the logs.
- A verifier can remove only their own verification (`DELETE .../verify`), which recalculates the status.

### Step 5 — Manual reassignment (optional)
- `PUT /api/v1/admin/properties/:propertyId/assign` lets **Admin / Super Admin / Sales Manager / Property Manager** reassign a property to a different sales user (overriding the auto-assignment).

---

## 5. Enquiry → lead-assignment lifecycle (step by step)

The demand side mirrors the supply side, but routes leads to **Client Dealers** instead of Property Managers.

### Step 1 — A logged-in user enquires
- From a property detail page, the user submits `createPropertyInquiry` { propertyId, inquiry, ... }.
- Stored in `property_inquiries` with `inquirer_id`, `priority` (default `medium`), `source` (e.g. `web`), `inquirer_role_type` (default `investor`).

### Step 2 — Auto-assign to a Client Dealer (with stickiness)
`autoAssignInquiry` logic:
1. **Stickiness:** if this property already has a prior inquiry assigned to a Client Dealer who is **still active and still holds the Client Dealer role**, the new inquiry goes to that **same dealer** (continuity for the lead).
2. Otherwise `assignedTo` is left **null** and the **frontend / a manager decides** (manual assignment).
3. Manual assignment: `POST /api/v1/admin/inquiries/assign` { inquiryId, assignedTo } — `assignedTo` must be an active **Sales Executive – Client Dealer**. Reassignment is supported (tracks `oldAssignedTo`).
4. `POST /api/v1/admin/inquiries/auto-assign` triggers the auto logic on demand.

> Verified live: **21 of 26 inquiries are assigned**; 5 await assignment.

### Step 3 — Dealer works the lead
- The Client Dealer sees their queue via `GET /api/v1/sales/assigned-inquiries`; managers see the pool via `/admin/pending-inquiries`.
- Notes/activity are tracked; status transitions are handled in the admin WorkBoard.

---

## 6. Who lands where after login (admin dashboard redirects)

From `p-grid_admin/src/App.jsx` (`getRedirectPath`):

| Role | Default landing page |
|---|---|
| Sales Manager | `/dashboard/analytics` |
| Sales Executive – Property Manager / Property Dealer | `/dashboard/workboard` |
| Sales Executive – Client Dealer | `/enquiry` |
| Admin / Super Admin | `/dashboard/work-board` |
| anything else | `/property/property-details` |

---

## 7. Summary of the end-to-end flow

```
GUEST                     CLIENT (Owner/Broker/Investor)        SALES TEAM (internal)
  │                              │                                     │
  │ browse properties           │                                     │
  │ (public, no auth)            │                                     │
  ├────────────► wants to act ──► log in via OTP                       │
  │                              │                                     │
  │                    Owner/Broker lists property                     │
  │                              │  POST /properties                   │
  │                              ▼                                     │
  │                    AUTO-ASSIGN to Property Manager ───────────────►│ (fewest-load exec)
  │                              │                                  verify (2-group):
  │                              │                                  partial → completed
  │                              │                                     │
  │                    Investor enquires on property                   │
  │                              │  createPropertyInquiry              │
  │                              ▼                                     │
  │                    AUTO-ASSIGN to Client Dealer ─────────────────►│ (sticky, else manual)
  │                              │                                  works the lead
  │                              ▼                                     │
  │                    Notifications cascade (socket.io) ─────────────►│ exec + manager + creator
```

---

## ⚠️ Caveats (see `AUDIT_REPORT.md` / `BUGS_TABLE.md` in the parent folder)
- OTP `111111` is a hardcoded backdoor; OTP-send is currently stubbed (no SMS actually goes out).
- Broker `rating` / `experience` / `propertiesListed` are not stored in `broker_profiles` — the apps display hardcoded/placeholder values for them.
- Several consumer screens (blogs, notifications, property analytics tab, investor stats) show hardcoded data instead of the real (and available) API data.
- The verification "admin group" requirement means a property cannot reach `completed` from the sales side alone.
