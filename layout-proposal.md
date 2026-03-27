# Layout Proposal: Dashboard Overview, Daily Activity, and Sidebar

**Document Version:** 1.3  
**Date:** March 26, 2026  
**Author:** Manus AI (revised: flexible layout + Dribbble inspiration index)

## 1. Introduction

This document details the layout proposal for the initial build of the HR dashboard, focusing on the Dashboard Overview, Daily Activity section, and primary sidebar navigation. It aligns with the Visual Design Language (`design-language.md`) for color, typography, and components.

**What is frozen:** `Project-PRD.md` defines **product scope, features, personas, and functional requirements**—those stay as specified. This file does not change **what** the app does.

**What is fluid:** **Layout** (flex/grid shell, sticky vs fixed, responsive breakpoints, scroll behavior) and **color treatment** (gradients, opacity, layering—see `design-language.md` §3.3) so the UI feels modern and breathable.

**Layout philosophy:** The shell should feel **fluid and breathable**, not locked to `position: fixed` for the sidebar and header. Prefer **flexbox/grid page structure**, **sticky** regions where persistence helps (e.g. top bar while scrolling main content), and **collapsible** navigation—patterns common in modern SaaS and dashboard work on Dribbble (see §2). Same routes and modules as the PRD; only **presentation structure** is fluid.

## 2. Design inspiration (Dribbble references)

Use these shots for **composition, density, card rhythm, and nav placement**—not pixel-perfect copies. Several are HR-, admin-, or operations-adjacent; others are strong generic dashboard references (fintech, merchant, task, etc.) for **grid balance, whitespace, and hierarchy**.

### 2.1 Curated list (primary)

| Focus | Link |
|-------|------|
| Remote / app shell | [Mota — UX/UI web application design for remote work](https://dribbble.com/shots/23200911-Mota-UX-UI-web-application-design-for-remote-work) |
| HR-specific UI | [Sence Point — HR UX/UI design](https://dribbble.com/shots/23188844-Sence-Point-HR-UX-UI-design) |
| Planner / scheduling feel | [Fitplan — Planner Dashboard](https://dribbble.com/shots/23081011-Fitplan-Planner-Dashboard) |
| Video / content platform shell | [Video Sharing Platform](https://dribbble.com/shots/23178378-Video-Sharing-Platform) |

### 2.2 Broader dashboard & admin references

| Theme | Link |
|-------|------|
| Merchant overview | [Merchant dashboard — Overview page UI](https://dribbble.com/shots/21235669-Merchant-dashboard-Overview-page-UI) |
| Business analytics | [Business analysis dashboard](https://dribbble.com/shots/14413386-Business-analysis-dashboard) |
| Task / productivity | [Task Management Dashboard Design](https://dribbble.com/shots/16729003-Task-Management-Dashboard-Design) |
| Productivity / courses | [Course — Productivity Dashboard](https://dribbble.com/shots/18468528-Cource-Productivity-Dashboard) |
| AI / tracking | [Productips — AI Productive Tracker](https://dribbble.com/shots/22615214-Productips-AI-Productive-Tracker) |
| Finance | [Orelypay — Finance Management Dashboard](https://dribbble.com/shots/21656734-Orelypay-Finance-Management-Dashboard) |
| Fintech | [Fintech Dashboard](https://dribbble.com/shots/17342291-Fintech-Dashboard) |
| Healthcare ops | [Healthcare Management Dashboard](https://dribbble.com/shots/22191383-Healthcare-Management-Dashboard) |
| E-learning | [E-learning Dashboard](https://dribbble.com/shots/22887468-E-learning-Dashboard) |
| Academy | [Vektora — Academy Dashboard](https://dribbble.com/shots/17138694-Vektora-Academy-Dashboard) |
| POS / SaaS admin | [Bubble POS — Point Of Sales SaaS Admin Dashboard](https://dribbble.com/shots/23123967-Bubble-POS-Point-Of-Sales-Saas-Admin-Dashboard) |
| Project timeline | [SaaS Project Timeline](https://dribbble.com/shots/22664473-SaaS-Project-Timeline) |
| Shipping / orders | [Egghead — Shipping tracking order](https://dribbble.com/shots/22899045-Egghead-Shipping-tracking-order) |
| Parcel / delivery admin | [Parcel Delivery Admin with Custom Illustrations](https://dribbble.com/shots/21567265-Parcel-Delivery-Admin-with-Custom-Illustrations) |
| Smart home | [Smart Home Dashboard](https://dribbble.com/shots/22903820-Smart-Home-Dashboard) |
| Car / SaaS | [Car Dashboard UI SaaS](https://dribbble.com/shots/20723362-Car-Dashboard-UI-SaaS) |
| Sport | [Sportia — Sport Soccer Dashboard](https://dribbble.com/shots/20422049-Sportia-Sport-Soccer-Dashboard) |
| Smart farm | [Smartfarm Dashboard Design](https://dribbble.com/shots/17211535-Smartfarm-Dashboard-Design) |
| Cleaning app | [Mac Cleaning app dashboard](https://dribbble.com/shots/15707372-Mac-Cleaning-app-dashboard) |
| Misc shell | [Hoxye](https://dribbble.com/shots/14775845--Hoxye) |
| Generic dashboard | [Dashboard](https://dribbble.com/shots/20172082-Dashboard) |

### 2.3 NFT dashboard family (layout, cards, dark UI patterns)

Use for **card grids, stats rows, and sidebar + content balance** where applicable; adapt colors to the HR design language.

- [ValNFT — NFT Dashboard Concept](https://dribbble.com/shots/21198290-ValNFT-NFT-Dashboard-Concept)
- [Luval — NFT Dashboard](https://dribbble.com/shots/18388554-Luval-NFT-Dashboard)
- [NFT Dashboard — Manage your NFT Collection](https://dribbble.com/shots/19801976-NFT-Dashboard-Manage-your-NFT-Collection)
- [NFT Dashboard](https://dribbble.com/shots/17042125-NFT-Dashboard)
- [NFT Dashboard](https://dribbble.com/shots/22419706-NFT-Dashboard)
- [Spacety — NFT Dashboard](https://dribbble.com/shots/18115126-Spacety-NFT-Dashboard)

### 2.4 Patterns to borrow (from references above)

- **Shell:** Sidebar + main as one scrolling page on small screens; on `lg+`, sidebar column + scrollable main, optionally **sticky** subheader—not necessarily full-viewport `fixed` chrome.
- **Header:** **Sticky** top bar (`sticky top-0 z-20`) with light blur or solid background so content slides underneath elegantly.
- **Sidebar:** **Sticky** (`sticky top-0 h-screen max-h-screen overflow-y-auto`) or static column in a flex row—prefer over `fixed` + manual margin offsets unless a product decision explicitly requires overlay behavior.
- **Content:** Card-led grids, generous gaps, metric strips similar to merchant/fintech shots; activity feeds as **max-height + scroll** rather than rigid viewport-fixed panes where possible.
- **Motion:** Subtle transitions on collapse/expand (`transition-all duration-300`) consistent with modern Dribbble dashboard motion.

## 3. Overall Dashboard Layout

The dashboard uses a **flexible shell**: a primary navigation column and a **main column** that grows with content. The top bar sits **above** main content and can be **sticky** within the main column so it stays visible while scrolling long pages—without requiring global `fixed` positioning for every breakpoint.

| Component | Description | Styling Considerations (Tailwind CSS Examples) |
|-----------|-------------|-----------------------------------------------|
| **App root** | Full-height flexible layout; stack on mobile, row on desktop. | `min-h-screen flex flex-col lg:flex-row` *or* `min-h-screen grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)]` |
| **Sidebar** | Left column with primary nav; collapsible width. Prefer **sticky** sidebar on large screens so it scrolls with the document unless you need icon-only rail behavior. | `shrink-0 border-r border-slate-200 bg-white`, `w-64` / `w-20` collapsed, `lg:sticky lg:top-0 lg:self-start lg:max-h-screen lg:overflow-y-auto`, `shadow-sm` |
| **Main column** | Wraps optional **sticky header** + scrollable dashboard body. | `flex min-h-screen min-w-0 flex-1 flex-col` |
| **Top Header** | Global search, location, notifications, profile. **Sticky** under the viewport top when scrolling main content. | `sticky top-0 z-20 flex h-16 shrink-0 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-white/80` |
| **Main Content Area** | Padding and background for cards/grids; no extra margin hack for a `fixed` sidebar—spacing comes from the flex/grid parent. | `flex-1 bg-slate-50 p-4 sm:p-6` |

## 4. Sidebar Navigation

The sidebar remains a clean, minimalist component for core HR modules (e.g. Users, Time Clock, Schedule), with clear hierarchy—aligned with **Sence Point HR** and **Mota**-style clarity from the inspiration list.

| Element | Description | Styling Considerations (Tailwind CSS Examples) |
|---------|-------------|-----------------------------------------------|
| **Logo/Brand Area** | Top section of the sidebar, displaying the company logo. | `h-16`, `flex`, `items-center`, `justify-center`, `border-b`, `border-slate-200` |
| **Navigation Links** | List of primary links with icon + label. | `flex`, `items-center`, `py-3`, `px-4`, `text-slate-800`, `font-semibold`, `hover:bg-orange-50`, `hover:text-orange-600` |
| **Active Link State** | Current route clearly marked. | `bg-orange-100`, `text-orange-800`, `border-l-4`, `border-orange-500` |
| **Icons** | Line or filled icons (e.g. Heroicons). | `w-6`, `h-6`, `mr-3` |
| **Collapsible Functionality** | Toggle to expand/collapse width / labels. | `transition-all`, `duration-300`, `ease-in-out` |

## 5. Top Header

| Element | Description | Styling Considerations (Tailwind CSS Examples) |
|---------|-------------|-----------------------------------------------|
| **Global Search Bar** | Search across employees, schedules, etc. | `w-full max-w-md`, `p-2`, `rounded-md`, `border`, `border-slate-200`, `focus:ring-2`, `focus:ring-orange-500/40` |
| **Location Switcher** | Dropdown for multi-store context. | `relative`, `inline-block`, `text-slate-700`, neutral borders; focus `ring-accent/20` per `design-language.md` |
| **User Profile/Avatar** | Avatar, name, settings/logout. | `flex`, `items-center`, `gap-2`, `cursor-pointer` |
| **Notifications Icon** | Badge for unread counts. | `relative`, `text-slate-700`, `hover:text-orange-600` |

## 6. Dashboard Overview Layout

Card-centric grid similar to **merchant / fintech / task** references: KPI strip, location cards, charts, and daily activity as a first-class block.

| Section | Description | Styling Considerations (Tailwind CSS Examples) |
|---------|-------------|-----------------------------------------------|
| **Welcome/Greeting** | Personalized greeting. | `text-2xl`, `font-bold`, `text-slate-800`, `mb-6` |
| **Metric Cards (Top Row)** | KPIs (e.g. Total Employees, Active Now, Late Arrivals). | `grid`, `grid-cols-1`, `md:grid-cols-2`, `lg:grid-cols-4`, `gap-6`, `mb-6` |
| **Store Overview Cards** | Per-location summaries (Connecteam-style operational view). | `grid`, `grid-cols-1`, `md:grid-cols-2`, `lg:grid-cols-3`, `gap-6`, `mb-6` |
| **Main Charts Section** | Attendance trends, labor cost, etc. | `grid`, `grid-cols-1`, `lg:grid-cols-2`, `gap-6`, `mb-6` |
| **Daily Activity Section** | Real-time snapshot + feed; full width on small screens; can sit beside charts on `lg` via grid placement. | `col-span-full`, `lg:col-span-1` *or* separate row—choose based on content priority |

## 7. Daily Activity Section Layout

| Element | Description | Styling Considerations (Tailwind CSS Examples) |
|---------|-------------|-----------------------------------------------|
| **Operational Snapshot Widget** | Scheduled, late clock-ins, clocked in now, attendance, late clock-outs. | `bg-white`, `rounded-lg`, `shadow-md`, `p-4`, `mb-4` |
| **Activity Feed List** | Scrollable recent events; prefer **max-height** over viewport-fixed panes. | `bg-white`, `rounded-lg`, `shadow-md`, `p-4`, `max-h-96`, `overflow-y-auto` |
| **Activity Item** | Event, employee, timestamp. | `flex`, `items-center`, `py-2`, `border-b`, `border-slate-100`, `last:border-b-0` |

---

This layout proposal, the Visual Design Language, and the Dribbble index above together define a **flexible, modern shell** and a clear structure for the HR dashboard’s initial build.
