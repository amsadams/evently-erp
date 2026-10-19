import { addDays } from "date-fns";
import type {
  AgreementLine, AgreementStatus, AppNotification, CatalogueItem, Client, CompanySettings, DB, Department, EventRecord,
  EventStatus, EventType, Expense, Invoice, InvoiceLine, InventoryItem, Lead, Payment, PayMethod, Quotation, QuoteBody, QuoteLine,
  Role, SalesOrder, StockAllocation, StockMovement, Task, TaskStatus, User, Vendor, VendorAssignment, VendorBill, Priority,
} from "@/types";
import { toISODate } from "@/lib/formatting";
import { computeQuote } from "@/lib/calculations/quote";
import { agreementTotal } from "@/lib/calculations/quote";

const today = new Date();
export const dayOffset = (n: number) => toISODate(addDays(today, n));
const ts = (n: number, h = 10) => { const d = addDays(today, n); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const R = (n: number) => Math.round(n * 100);

const TERMS = "1. Rates are valid until the validity date shown.\n2. Advance payment confirms the booking; dates are held only after receipt of the advance.\n3. Scope changes after approval are billed as change orders.\n4. Cancellation: advance is non-refundable within 30 days of the event.";

/* ---------------- roles, users, departments ---------------- */
const ALL = [
  "events.read", "events.write", "clients.read", "clients.write", "vendors.read", "vendors.write", "quotes.read", "quotes.write",
  "quotes.approve", "finance.read", "finance.write", "tasks.write", "inventory.write", "reports.read", "settings.manage", "audit.read",
] as const;

const roles: Role[] = [
  { id: "r_admin", name: "Administrator", description: "Full access incl. settings, roles and audit", permissions: [...ALL] },
  { id: "r_manager", name: "Manager", description: "Everything operational and financial, no settings", permissions: ALL.filter((p) => p !== "settings.manage") },
  { id: "r_coord", name: "Coordinator", description: "Events, vendors, tasks, quotations; no finance", permissions: ["events.read", "events.write", "clients.read", "clients.write", "vendors.read", "vendors.write", "quotes.read", "quotes.write", "tasks.write", "inventory.write"] },
  { id: "r_finance", name: "Finance", description: "Invoices, payments, expenses and finance reports", permissions: ["events.read", "clients.read", "vendors.read", "quotes.read", "finance.read", "finance.write", "reports.read", "audit.read"] },
  { id: "r_viewer", name: "Viewer", description: "Read-only access", permissions: ["events.read", "clients.read", "vendors.read", "quotes.read", "tasks.write"] },
];

const users: User[] = [
  { id: "u1", name: "Aarav Mehta", email: "aarav@evently.demo", phone: "+91 98200 11001", roleId: "r_admin", departmentId: "dp0", active: true },
  { id: "u2", name: "Priya Nair", email: "priya@evently.demo", phone: "+91 98200 11002", roleId: "r_manager", departmentId: "dp0", active: true },
  { id: "u3", name: "Rohan Kapoor", email: "rohan@evently.demo", phone: "+91 98200 11003", roleId: "r_coord", departmentId: "dp1", active: true },
  { id: "u4", name: "Sneha Iyer", email: "sneha@evently.demo", phone: "+91 98200 11004", roleId: "r_coord", departmentId: "dp3", active: true },
  { id: "u5", name: "Karan Shah", email: "karan@evently.demo", phone: "+91 98200 11005", roleId: "r_finance", departmentId: "dp5", active: true },
  { id: "u6", name: "Meera Joshi", email: "meera@evently.demo", phone: "+91 98200 11006", roleId: "r_viewer", departmentId: "dp2", active: true },
];

const dept = (id: string, name: string, color: string, order: number, description: string): Department => ({ id, name, color, active: true, order, description });
const departments: Department[] = [
  dept("dp0", "Management", "#475569", 0, "Leadership and approvals"),
  dept("dp1", "Decor & Production", "#be185d", 1, "Stage, floral, set design and production"),
  dept("dp2", "Photography & Videography", "#0f766e", 2, "Photo, film, drone and live streaming"),
  dept("dp3", "Catering", "#b45309", 3, "Menus, live counters and beverage service"),
  dept("dp4", "Entertainment & Artists", "#7c3aed", 4, "Performers, DJs, emcees and artists"),
  dept("dp5", "Venue & Accommodation", "#2563eb", 5, "Venue booking, rooms and guest stay"),
  dept("dp6", "Transport & Logistics", "#0369a1", 6, "Guest transfers, cargo and site logistics"),
  dept("dp7", "Audio, Lighting & Staging", "#4d7c0f", 7, "Sound, light, LED walls and rigging"),
  dept("dp8", "Printing & Invitations", "#a21caf", 8, "Invitations, signage and stationery"),
  dept("dp9", "Corporate Branding & Fabrication", "#c2410c", 9, "Booths, branded fabrication and activations"),
];

const eventTypes: EventType[] = [
  {
    id: "et_wedding", name: "Wedding", category: "wedding", color: "#be185d", defaultFunctions: ["Mehendi", "Sangeet", "Wedding Ceremony", "Reception"],
    defaultDepartmentIds: ["dp1", "dp2", "dp3", "dp4", "dp5", "dp6", "dp7", "dp8"],
    taskTemplate: [
      { title: "Finalise venue contract", offsetDays: -60, departmentId: "dp5" }, { title: "Confirm decor theme & mood board", offsetDays: -45, departmentId: "dp1" },
      { title: "Lock caterer menu tasting", offsetDays: -30, departmentId: "dp3" }, { title: "Send invitations to print", offsetDays: -35, departmentId: "dp8" },
      { title: "Guest transport plan", offsetDays: -14, departmentId: "dp6" }, { title: "Final run-of-show review", offsetDays: -3 },
    ],
    milestoneTemplate: [{ title: "Booking advance received", offsetDays: -75 }, { title: "Vendors confirmed", offsetDays: -30 }, { title: "Final guest count", offsetDays: -10 }, { title: "Site recce complete", offsetDays: -7 }],
  },
  {
    id: "et_dest", name: "Destination Wedding", category: "wedding", color: "#9d174d", defaultFunctions: ["Welcome Dinner", "Haldi", "Wedding Ceremony", "Reception"],
    defaultDepartmentIds: ["dp1", "dp2", "dp3", "dp4", "dp5", "dp6", "dp7"],
    taskTemplate: [{ title: "Book guest accommodation block", offsetDays: -90, departmentId: "dp5" }, { title: "Arrange flight & transfer matrix", offsetDays: -45, departmentId: "dp6" }, { title: "Shipping of decor material", offsetDays: -20, departmentId: "dp6" }],
    milestoneTemplate: [{ title: "Booking advance received", offsetDays: -120 }, { title: "Room block confirmed", offsetDays: -75 }, { title: "Final guest list", offsetDays: -21 }],
  },
  {
    id: "et_conf", name: "Corporate Conference", category: "corporate", color: "#1d4ed8", defaultFunctions: ["Registration", "Keynote", "Breakout Sessions", "Networking Dinner"],
    defaultDepartmentIds: ["dp5", "dp7", "dp9", "dp3", "dp2", "dp8"],
    taskTemplate: [{ title: "Speaker confirmations", offsetDays: -30 }, { title: "Registration microsite live", offsetDays: -40 }, { title: "AV technical rehearsal", offsetDays: -2, departmentId: "dp7" }],
    milestoneTemplate: [{ title: "Agenda frozen", offsetDays: -30 }, { title: "Branding approved", offsetDays: -21 }],
  },
  {
    id: "et_launch", name: "Product Launch", category: "corporate", color: "#0f766e", defaultFunctions: ["Press Preview", "Launch Show", "After-party"],
    defaultDepartmentIds: ["dp7", "dp9", "dp4", "dp2", "dp8", "dp3"],
    taskTemplate: [{ title: "Creative concept sign-off", offsetDays: -35, departmentId: "dp9" }, { title: "Media invite list", offsetDays: -21 }, { title: "Stage rehearsal", offsetDays: -2, departmentId: "dp7" }],
    milestoneTemplate: [{ title: "Concept approved", offsetDays: -35 }, { title: "Fabrication complete", offsetDays: -7 }],
  },
  {
    id: "et_activation", name: "Brand Activation", category: "corporate", color: "#c2410c", defaultFunctions: ["Setup", "Activation Day"],
    defaultDepartmentIds: ["dp9", "dp7", "dp6"], taskTemplate: [{ title: "Permissions & mall approvals", offsetDays: -21 }],
    milestoneTemplate: [{ title: "Permissions received", offsetDays: -14 }],
  },
  {
    id: "et_private", name: "Private Celebration", category: "private", color: "#7c3aed", defaultFunctions: ["Celebration"],
    defaultDepartmentIds: ["dp1", "dp3", "dp4", "dp2"], taskTemplate: [{ title: "Confirm guest list & menu", offsetDays: -14, departmentId: "dp3" }],
    milestoneTemplate: [{ title: "Advance received", offsetDays: -30 }],
  },
];

/* ---------------- clients ---------------- */
const ct = (id: string, name: string, role: string, phone: string, email: string) => ({ id, name, role, phone, email });
const clients: Client[] = [
  { id: "c1", type: "individual", name: "Ananya Sharma", email: "ananya.sharma@mail.demo", phone: "+91 98111 20001", address: "14 Pali Hill, Mumbai", contacts: [ct("c1a", "Rajesh Sharma", "Father", "+91 98111 20002", "rajesh@mail.demo")], preferences: "Pastel palette, floral-forward decor, vegetarian menu, live classical music at ceremony.", tags: ["VIP", "Wedding"], archived: false, createdAt: ts(-120) },
  { id: "c2", type: "corporate", name: "Aurora Technologies Pvt Ltd", company: "Aurora Technologies", email: "events@aurora.demo", phone: "+91 80450 33001", address: "Whitefield, Bengaluru", gstin: "29AABCA1234F1Z5", contacts: [ct("c2a", "Divya Rao", "Marketing Head", "+91 98450 33002", "divya.rao@aurora.demo")], preferences: "Strict brand guidelines, hybrid streaming, early vendor access.", tags: ["Corporate", "Repeat"], archived: false, createdAt: ts(-300) },
  { id: "c3", type: "individual", name: "Vikram & Neha Verma", email: "verma.family@mail.demo", phone: "+91 98222 40001", address: "Jubilee Hills, Hyderabad", contacts: [], preferences: "25th anniversary, 120 guests, live ghazal evening.", tags: ["Private"], archived: false, createdAt: ts(-60) },
  { id: "c4", type: "corporate", name: "NovaPhone India", company: "NovaPhone", email: "launch@novaphone.demo", phone: "+91 22450 55001", address: "BKC, Mumbai", gstin: "27AAECN9876K1Z2", contacts: [ct("c4a", "Arjun Malhotra", "Brand Manager", "+91 98200 55002", "arjun@novaphone.demo")], preferences: "Premium finish, media-friendly layout, strict NDA.", tags: ["Corporate"], archived: false, createdAt: ts(-90) },
  { id: "c5", type: "individual", name: "Sanjana Reddy", email: "sanjana.r@mail.demo", phone: "+91 98333 60001", address: "Indiranagar, Bengaluru", contacts: [], preferences: "Intimate engagement, 150 guests, South Indian menu.", tags: ["Wedding"], archived: false, createdAt: ts(-110) },
  { id: "c6", type: "corporate", name: "Brandstorm Retail", company: "Brandstorm", email: "mkt@brandstorm.demo", phone: "+91 22400 77001", address: "Lower Parel, Mumbai", contacts: [ct("c6a", "Tanya Bose", "Activation Lead", "+91 98200 77002", "tanya@brandstorm.demo")], preferences: "Quick turnaround, mall permissions handled by us.", tags: ["Corporate"], archived: false, createdAt: ts(-45) },
  { id: "c7", type: "individual", name: "Gurpreet Singh", email: "gurpreet.s@mail.demo", phone: "+91 98444 80001", address: "Sector 17, Chandigarh", contacts: [], preferences: "Big fat Punjabi wedding, 600+ guests.", tags: ["Wedding", "Lead"], archived: false, createdAt: ts(-10) },
  { id: "c8", type: "individual", name: "Ishaan Gupta", email: "ishaan.g@mail.demo", phone: "+91 98555 90001", address: "Civil Lines, Jaipur", contacts: [], preferences: "Reception with celebrity DJ.", tags: ["Wedding"], archived: false, createdAt: ts(-40) },
  { id: "c9", type: "individual", name: "Pooja Mehta", email: "pooja.m@mail.demo", phone: "+91 98666 10001", address: "Koregaon Park, Pune", contacts: [], preferences: "Kids birthday, theme-based.", tags: ["Private"], archived: false, createdAt: ts(-30) },
  { id: "c10", type: "corporate", name: "Helix Pharma Ltd", company: "Helix Pharma", email: "events@helix.demo", phone: "+91 40450 12001", address: "HITEC City, Hyderabad", contacts: [], preferences: "Annual dealers meet, compliance-heavy.", tags: ["Corporate"], archived: false, createdAt: ts(-200) },
];

const leadsSeed: Lead[] = [
  { id: "l1", name: "Gurpreet Singh", phone: "+91 98444 80001", email: "gurpreet.s@mail.demo", source: "Referral", eventTypeId: "et_wedding", expectedDate: dayOffset(95), budget: R(4500000), guests: 650, stage: "Proposal", followUpAt: dayOffset(2), notes: "Wants a palace venue in Jaipur.", clientId: "c7", eventId: "e7", createdAt: ts(-10) },
  { id: "l2", name: "Meghna Kulkarni", phone: "+91 98777 11111", email: "meghna@mail.demo", source: "Instagram", eventTypeId: "et_wedding", expectedDate: dayOffset(150), budget: R(2800000), guests: 300, stage: "New", followUpAt: dayOffset(0), notes: "Enquired via DM; wants beach wedding in Goa.", createdAt: ts(-2) },
  { id: "l3", name: "Orbit Fintech", phone: "+91 98777 22222", email: "events@orbit.demo", source: "Website", eventTypeId: "et_conf", expectedDate: dayOffset(75), budget: R(3500000), guests: 400, stage: "Contacted", followUpAt: dayOffset(-1), notes: "Customer conference, two days.", createdAt: ts(-6) },
  { id: "l4", name: "Rhea Desai", phone: "+91 98777 33333", email: "rhea@mail.demo", source: "Wedding fair", eventTypeId: "et_dest", expectedDate: dayOffset(200), budget: R(7500000), guests: 180, stage: "Negotiation", followUpAt: dayOffset(4), notes: "Considering Udaipur or Jaisalmer.", createdAt: ts(-18) },
  { id: "l5", name: "Kabir Anand", phone: "+91 98777 44444", email: "kabir@mail.demo", source: "Google Ads", eventTypeId: "et_private", expectedDate: dayOffset(40), budget: R(600000), guests: 80, stage: "Lost", notes: "Went with in-house venue team.", createdAt: ts(-25) },
  { id: "l6", name: "Zenith Motors", phone: "+91 98777 55555", email: "pr@zenith.demo", source: "Referral", eventTypeId: "et_launch", expectedDate: dayOffset(120), budget: R(9000000), guests: 500, stage: "New", followUpAt: dayOffset(1), notes: "SUV launch, outdoor.", createdAt: ts(-1) },
];

/* ---------------- vendors & catalogue ---------------- */
const vcats = [
  { id: "vc1", name: "Decor & Florals" }, { id: "vc2", name: "Photo & Video" }, { id: "vc3", name: "Catering" }, { id: "vc4", name: "Audio-Visual" },
  { id: "vc5", name: "Artists & Entertainment" }, { id: "vc6", name: "Venue & Stay" }, { id: "vc7", name: "Transport" }, { id: "vc8", name: "Printing" },
  { id: "vc9", name: "Fabrication" }, { id: "vc10", name: "Rentals & Furniture" },
];

interface VSeed { id: string; name: string; cat: string; depts: string[]; city: string; rating: number; items: [string, string, number, number][]; unavailable?: number[] }
const vseeds: VSeed[] = [
  { id: "v1", name: "Petal & Pillar Decorators", cat: "vc1", depts: ["dp1"], city: "Mumbai", rating: 5, items: [["Floral mandap (premium)", "set", 185000, 18], ["Stage backdrop with fresh flowers", "set", 120000, 18], ["Entrance floral arch", "piece", 35000, 18], ["Table centrepieces", "piece", 1800, 18]] },
  { id: "v2", name: "Lumière Studios", cat: "vc2", depts: ["dp2"], city: "Mumbai", rating: 4, items: [["Candid photography (per day)", "day", 65000, 18], ["Cinematic wedding film", "film", 140000, 18], ["Drone coverage", "day", 25000, 18], ["Live streaming crew", "day", 45000, 18]] },
  { id: "v3", name: "Spice Route Caterers", cat: "vc3", depts: ["dp3"], city: "Mumbai", rating: 5, items: [["Premium veg buffet", "plate", 1800, 5], ["Live counters (per counter)", "counter", 22000, 5], ["Premium beverage package", "guest", 650, 5], ["Cocktail snacks", "plate", 900, 5]] },
  { id: "v4", name: "SoundWave Productions", cat: "vc4", depts: ["dp7"], city: "Bengaluru", rating: 4, items: [["Line-array sound system", "day", 60000, 18], ["LED wall (per sq.ft)", "sqft", 450, 18], ["Intelligent lighting rig", "day", 80000, 18], ["Stage truss & rigging", "set", 90000, 18]] },
  { id: "v5", name: "Raga Entertainment", cat: "vc5", depts: ["dp4"], city: "Delhi", rating: 4, items: [["Sufi night live band", "show", 150000, 18], ["Celebrity DJ", "show", 300000, 18], ["Emcee / host", "event", 40000, 18], ["Dhol ensemble", "show", 25000, 18]] },
  { id: "v6", name: "Heritage Stays & Venues", cat: "vc6", depts: ["dp5"], city: "Udaipur", rating: 5, items: [["Palace lawn hire", "day", 450000, 18], ["Deluxe room block", "room-night", 14000, 12], ["Banquet hall hire", "day", 180000, 18]], unavailable: [200] },
  { id: "v7", name: "SwiftMove Logistics", cat: "vc7", depts: ["dp6"], city: "Mumbai", rating: 3, items: [["Guest coach 45-seater", "day", 18000, 5], ["Sedan transfers", "trip", 2200, 5], ["Cargo truck (decor)", "trip", 42000, 5]] },
  { id: "v8", name: "InkWell Prints", cat: "vc8", depts: ["dp8"], city: "Mumbai", rating: 4, items: [["Wedding invitation suite", "piece", 380, 12], ["Signage & wayfinding set", "set", 28000, 12], ["Badges & lanyards", "piece", 85, 12]] },
  { id: "v9", name: "BrandForge Fabrication", cat: "vc9", depts: ["dp9"], city: "Bengaluru", rating: 4, items: [["Exhibition booth fabrication", "sqft", 2200, 18], ["Branded photo wall", "piece", 65000, 18], ["Standees & signage", "piece", 4500, 18]] },
  { id: "v10", name: "Royal Rentals", cat: "vc10", depts: ["dp1", "dp7"], city: "Mumbai", rating: 4, items: [["Banquet chairs (covered)", "piece", 55, 18], ["Round tables with linen", "piece", 450, 18], ["Lounge furniture set", "set", 14000, 18], ["Generator 125 kVA", "day", 12000, 18]] },
];

const vendors: Vendor[] = vseeds.map((s, i) => ({
  id: s.id, name: s.name, categoryId: s.cat, departmentIds: s.depts, services: s.items.map((x) => x[0]),
  contacts: [ct(`${s.id}c`, ["Manish Patel", "Leena D'Souza", "Chef Imran", "Vivek Rao", "Simran Kaur", "Harsh Rathore", "Dinesh Pawar", "Jaya Menon", "Nikhil Gowda", "Salim Khan"][i], "Owner", `+91 99200 0${i}00${i}`, `contact@${s.id}.demo`)],
  phone: `+91 99200 0${i}00${i}`, email: `contact@${s.id}.demo`, city: s.city, serviceLocations: [s.city, "Pan-India on request"], status: "Active",
  paymentTerms: i % 2 ? "30% advance, balance within 15 days of event" : "50% advance, 50% on completion", gstin: `27AA${s.id.toUpperCase()}1234F1Z${i}`,
  bank: { holder: s.name, bankName: "HDFC Bank", account: `5010000${i}123456`, ifsc: "HDFC0001234", upi: `${s.id}@hdfcbank` },
  documents: [{ id: `${s.id}d1`, name: "GST Certificate", type: "Compliance" }, { id: `${s.id}d2`, name: "Service Agreement 2026", type: "Contract", expiry: dayOffset(200 + i * 10) }],
  feedback: [{ id: `${s.id}f1`, rating: s.rating, comment: s.rating >= 4 ? "Reliable, on-time and flexible with changes." : "Delivery delays on last event; needs buffer.", at: ts(-40), byUserId: "u3" }],
  unavailableDates: (s.unavailable ?? []).map(dayOffset), createdAt: ts(-400),
}));

let ciN = 0;
const catalogue: CatalogueItem[] = [];
for (const s of vseeds) for (const [name, unit, rate, tax] of s.items)
  catalogue.push({ id: `ci${++ciN}`, scope: "vendor", vendorId: s.id, departmentId: s.depts[0], name, unit, rate: R(rate), taxRate: tax, active: true });
const company: [string, string, string, number, number][] = [
  ["dp1", "Event design & creative concept", "event", 150000, 18], ["dp1", "Production management fee", "event", 200000, 18], ["dp5", "Venue coordination", "event", 75000, 18],
  ["dp3", "F&B coordination", "event", 60000, 18], ["dp4", "Artist coordination & riders", "event", 50000, 18], ["dp6", "Guest logistics desk", "day", 35000, 18],
  ["dp7", "Technical direction", "day", 40000, 18], ["dp2", "Content coordination", "event", 30000, 18],
];
for (const [d, name, unit, rate, tax] of company) catalogue.push({ id: `ci${++ciN}`, scope: "company", departmentId: d, name, unit, rate: R(rate), taxRate: tax, active: true });
const cat = (vendorId: string, name: string) => catalogue.find((c) => c.vendorId === vendorId && c.name.startsWith(name))!;

/* ---------------- events ---------------- */
const fn = (id: string, name: string, date: string, st: string, et: string, venue: string, guests: number) => ({ id, name, date, startTime: st, endTime: et, venue, guests });
const ms = (id: string, title: string, date: string, done: boolean) => ({ id, title, date, done });
function ev(p: Partial<EventRecord> & Pick<EventRecord, "id" | "ref" | "title" | "clientId" | "typeId" | "status" | "venue" | "startDate" | "endDate">): EventRecord {
  return {
    priority: "Medium", coordinatorId: "u3", city: "Mumbai", startTime: "17:00", endTime: "23:30", guests: 200, budget: R(2000000), description: "", logistics: "",
    functions: [], milestones: [], plans: [], createdAt: ts(-60), ...p,
  };
}
const events: EventRecord[] = [
  ev({
    id: "e1", ref: "EVT-2026-0101", title: "Sharma–Kapoor Destination Wedding", clientId: "c1", typeId: "et_dest", status: "Confirmed", priority: "Critical", coordinatorId: "u3",
    venue: "Udaipur City Palace Lawns", city: "Udaipur", startDate: dayOffset(21), endDate: dayOffset(23), guests: 320, budget: R(12000000),
    description: "Three-day palace wedding with Haldi, Sangeet and Pheras. 320 guests flying in; room block at partner heritage hotel.",
    logistics: "Airport pickups from Maharana Pratap airport; 6 coaches for ceremony transfers; decor cargo leaves Mumbai D-5.",
    functions: [fn("f1a", "Welcome Dinner", dayOffset(21), "19:00", "23:00", "Udaipur City Palace Lawns", 320), fn("f1b", "Haldi & Sangeet", dayOffset(22), "11:00", "23:30", "Udaipur City Palace Lawns", 320), fn("f1c", "Wedding Ceremony & Reception", dayOffset(23), "17:00", "00:30", "Udaipur City Palace Lawns", 320)],
    milestones: [ms("m1a", "Booking advance received", dayOffset(-60), true), ms("m1b", "Room block confirmed", dayOffset(-20), true), ms("m1c", "Vendors confirmed", dayOffset(5), false), ms("m1d", "Final guest list", dayOffset(10), false)],
    plans: [{ departmentId: "dp1", budget: R(900000), requirements: "Floral mandap, sangeet stage, lounge decor.", notes: "" }, { departmentId: "dp3", budget: R(700000), requirements: "Three menus, live counters.", notes: "" }, { departmentId: "dp5", budget: R(600000), requirements: "Palace lawns + 80 rooms.", notes: "" }, { departmentId: "dp7", budget: R(300000), requirements: "Sound & lighting for 3 nights.", notes: "" }, { departmentId: "dp4", budget: R(250000), requirements: "Sufi night + DJ.", notes: "" }],
  }),
  ev({
    id: "e2", ref: "EVT-2026-0102", title: "Aurora Tech Summit 2026", clientId: "c2", typeId: "et_conf", status: "Confirmed", priority: "High", coordinatorId: "u4",
    venue: "Bengaluru International Convention Centre", city: "Bengaluru", startDate: dayOffset(12), endDate: dayOffset(13), startTime: "08:30", endTime: "18:30", guests: 600, budget: R(4200000),
    description: "Two-day customer and partner summit with keynote, 4 breakout tracks and networking dinner.",
    functions: [fn("f2a", "Registration & Keynote", dayOffset(12), "08:30", "13:00", "Hall A", 600), fn("f2b", "Breakouts", dayOffset(12), "14:00", "18:00", "Halls B–E", 600), fn("f2c", "Day 2 Sessions & Dinner", dayOffset(13), "09:00", "21:00", "Hall A", 500)],
    milestones: [ms("m2a", "Agenda frozen", dayOffset(-10), true), ms("m2b", "Branding approved", dayOffset(-3), true), ms("m2c", "Fabrication complete", dayOffset(8), false)],
    plans: [{ departmentId: "dp7", budget: R(1300000), requirements: "Main stage, LED, 4 breakout rooms.", notes: "" }, { departmentId: "dp9", budget: R(900000), requirements: "Branding, booths, signage.", notes: "" }, { departmentId: "dp3", budget: R(800000), requirements: "Lunch, tea, dinner.", notes: "" }],
  }),
  ev({
    id: "e3", ref: "EVT-2026-0103", title: "Verma 25th Anniversary", clientId: "c3", typeId: "et_private", status: "Planning", coordinatorId: "u4", venue: "Taj Falaknuma Courtyard", city: "Hyderabad",
    startDate: dayOffset(35), endDate: dayOffset(35), guests: 120, budget: R(1500000), description: "Ghazal evening with plated dinner.",
    functions: [fn("f3a", "Anniversary Evening", dayOffset(35), "18:30", "23:00", "Taj Falaknuma Courtyard", 120)], milestones: [ms("m3a", "Advance received", dayOffset(-5), true)],
    plans: [{ departmentId: "dp3", budget: R(500000), requirements: "Plated dinner.", notes: "" }, { departmentId: "dp4", budget: R(250000), requirements: "Ghazal singer + tabla.", notes: "" }],
  }),
  ev({
    id: "e4", ref: "EVT-2026-0104", title: "NovaPhone X Launch", clientId: "c4", typeId: "et_launch", status: "Planning", priority: "High", coordinatorId: "u3", venue: "Jio World Convention Centre", city: "Mumbai",
    startDate: dayOffset(45), endDate: dayOffset(45), startTime: "16:00", endTime: "22:00", guests: 500, budget: R(6000000), description: "Press preview followed by launch show and after-party.",
    functions: [fn("f4a", "Press Preview", dayOffset(45), "16:00", "17:30", "Foyer", 120), fn("f4b", "Launch Show", dayOffset(45), "18:00", "20:00", "Main Hall", 500), fn("f4c", "After-party", dayOffset(45), "20:30", "23:30", "Terrace", 300)],
    milestones: [ms("m4a", "Concept approved", dayOffset(8), false)],
    plans: [{ departmentId: "dp7", budget: R(1800000), requirements: "LED stage, lasers.", notes: "" }, { departmentId: "dp9", budget: R(1400000), requirements: "Product pods, branding.", notes: "" }],
  }),
  ev({
    id: "e5", ref: "EVT-2026-0095", title: "Reddy–Iyer Engagement", clientId: "c5", typeId: "et_wedding", status: "Completed", coordinatorId: "u4", venue: "The Leela Ambience", city: "Bengaluru",
    startDate: dayOffset(-18), endDate: dayOffset(-18), guests: 150, budget: R(1400000), description: "Intimate engagement ceremony and dinner.",
    functions: [fn("f5a", "Engagement", dayOffset(-18), "17:00", "22:30", "Ballroom", 150)], milestones: [ms("m5a", "Advance received", dayOffset(-60), true), ms("m5b", "Final guest count", dayOffset(-25), true)],
    plans: [{ departmentId: "dp1", budget: R(350000), requirements: "Floral stage.", notes: "" }, { departmentId: "dp3", budget: R(450000), requirements: "Dinner for 150.", notes: "" }],
  }),
  ev({
    id: "e6", ref: "EVT-2026-0099", title: "Brandstorm Summer Activation", clientId: "c6", typeId: "et_activation", status: "In Progress", coordinatorId: "u3", venue: "Phoenix Marketcity Atrium", city: "Mumbai",
    startDate: dayOffset(-1), endDate: dayOffset(2), startTime: "11:00", endTime: "21:00", guests: 3000, budget: R(1800000), description: "4-day mall activation with branded pods and sampling.",
    functions: [fn("f6a", "Activation Days", dayOffset(-1), "11:00", "21:00", "Atrium", 3000)], milestones: [ms("m6a", "Permissions received", dayOffset(-15), true)],
    plans: [{ departmentId: "dp9", budget: R(900000), requirements: "Branded pods.", notes: "" }],
  }),
  ev({
    id: "e7", ref: "EVT-2026-0106", title: "Singh Royal Wedding (Enquiry)", clientId: "c7", typeId: "et_wedding", status: "Enquiry", priority: "Medium", coordinatorId: "u4", venue: "Rambagh Palace Lawns", city: "Jaipur",
    startDate: dayOffset(95), endDate: dayOffset(97), guests: 650, budget: R(4500000), description: "Large traditional wedding; quotation in discussion.",
    functions: [fn("f7a", "Sangeet", dayOffset(95), "19:00", "00:00", "Rambagh Palace Lawns", 650), fn("f7b", "Wedding", dayOffset(97), "16:00", "00:00", "Rambagh Palace Lawns", 650)], milestones: [], plans: [],
  }),
  ev({
    id: "e8", ref: "EVT-2026-0107", title: "Gupta Wedding Reception", clientId: "c8", typeId: "et_wedding", status: "Planning", coordinatorId: "u3", venue: "Udaipur City Palace Lawns", city: "Udaipur",
    startDate: dayOffset(22), endDate: dayOffset(22), guests: 400, budget: R(2600000), description: "Reception with celebrity DJ. NOTE: venue overlaps Sharma wedding — under review.",
    functions: [fn("f8a", "Reception", dayOffset(22), "20:00", "01:00", "Udaipur City Palace Lawns", 400)], milestones: [], plans: [],
  }),
  ev({
    id: "e9", ref: "EVT-2026-0108", title: "Aarna's 7th Birthday", clientId: "c9", typeId: "et_private", status: "On Hold", priority: "Low", coordinatorId: "u4", venue: "Garden Court Banquets", city: "Pune",
    startDate: dayOffset(28), endDate: dayOffset(28), startTime: "16:00", endTime: "20:00", guests: 70, budget: R(450000), description: "Theme party on hold pending family travel.", functions: [], milestones: [], plans: [],
  }),
  ev({
    id: "e10", ref: "EVT-2026-0088", title: "Helix Pharma Dealers Meet", clientId: "c10", typeId: "et_conf", status: "Completed", priority: "High", coordinatorId: "u4", venue: "HICC Novotel", city: "Hyderabad",
    startDate: dayOffset(-40), endDate: dayOffset(-39), startTime: "09:00", endTime: "19:00", guests: 350, budget: R(2800000), description: "Annual dealers meet with awards dinner.",
    functions: [fn("f10a", "Day 1", dayOffset(-40), "09:00", "19:00", "Convention Hall", 350), fn("f10b", "Awards Dinner", dayOffset(-39), "19:00", "23:00", "Ballroom", 350)], milestones: [ms("m10a", "Agenda frozen", dayOffset(-70), true)],
    plans: [{ departmentId: "dp7", budget: R(800000), requirements: "Stage & AV.", notes: "" }],
  }),
];

/* ---------------- quotations & sales orders ---------------- */
let qlN = 0;
const ql = (departmentId: string, name: string, qty: number, unit: string, rate: number, discountPct = 0, taxRate = 18): QuoteLine =>
  ({ id: `ql${++qlN}`, departmentId, name, description: "", qty, unit, rate: R(rate), discountPct, taxRate });
const body = (lines: QuoteLine[], charges: { label: string; amount: number }[] = [], advancePct = 30, taxMode: QuoteBody["taxMode"] = "exclusive"): QuoteBody => ({
  lines, charges: charges.map((c, i) => ({ id: `qc${qlN}_${i}`, label: c.label, amount: R(c.amount), taxRate: 18 })), taxMode, advancePct, terms: TERMS,
  paymentTerms: `${advancePct}% advance on confirmation, 40% on completion of vendor confirmations, balance 7 days before the event.`, notes: "",
});
const quotations: Quotation[] = [];
function mkQuote(id: string, ref: string, eventId: string, status: Quotation["status"], b: QuoteBody, version = 1, extra: Partial<Quotation> = {}): Quotation {
  const ev = events.find((e) => e.id === eventId)!;
  const q: Quotation = { id, ref, eventId, clientId: ev.clientId, title: `Proposal – ${ev.title}`, status, version, validUntil: dayOffset(10), body: b, versions: [], reviewApproved: status !== "Draft", createdAt: ts(-50), createdBy: "u3", ...extra };
  quotations.push(q);
  return q;
}
const q1 = mkQuote("q1", "QT/2026-27/0001", "e1", "Converted", body([
  ql("dp1", "Event design & creative concept", 1, "event", 250000), ql("dp1", "Floral mandap & stage decor (3 days)", 1, "set", 780000, 5), ql("dp1", "Lounge & seating decor", 1, "set", 260000),
  ql("dp3", "Catering – 3 menus, 320 guests", 320, "guest", 4200, 0, 5), ql("dp3", "Live counters (8)", 8, "counter", 32000, 0, 5), ql("dp4", "Sufi night live band", 1, "show", 220000), ql("dp4", "Celebrity DJ", 1, "show", 420000),
  ql("dp5", "Palace lawns (3 days)", 3, "day", 600000), ql("dp5", "Room block – 80 rooms × 3 nights", 240, "room-night", 17500, 0, 12), ql("dp6", "Guest transport & airport transfers", 1, "event", 380000, 0, 5),
  ql("dp7", "Sound, light and LED for 3 nights", 3, "night", 190000), ql("dp2", "Photography, film & drone", 1, "package", 420000),
], [{ label: "Planning & coordination fee", amount: 350000 }], 30), 2, {
  status: "Converted", versions: [{ version: 1, at: ts(-50), byUserId: "u3", reason: "Initial proposal", total: R(5400000), body: body([ql("dp1", "Placeholder v1", 1, "lot", 1)]), status: "Rejected" }],
  sentAt: ts(-48), decidedAt: ts(-44), validUntil: dayOffset(-30),
});
const q2 = mkQuote("q2", "QT/2026-27/0002", "e2", "Converted", body([
  ql("dp7", "Main stage, LED wall & AV package (2 days)", 2, "day", 690000), ql("dp7", "Breakout room AV (4 rooms × 2 days)", 8, "room-day", 55000), ql("dp9", "Branding, signage & registration desks", 1, "lot", 780000),
  ql("dp9", "Exhibition booths (12)", 12, "booth", 90000), ql("dp3", "Lunch, tea & networking dinner", 1300, "cover", 1250, 0, 5), ql("dp2", "Photography & live streaming", 2, "day", 150000), ql("dp8", "Badges, lanyards & printed collateral", 1, "lot", 190000, 0, 12),
], [{ label: "Production management fee", amount: 380000 }], 40), 1, { sentAt: ts(-30), decidedAt: ts(-24), validUntil: dayOffset(-10) });
mkQuote("q3", "QT/2026-27/0003", "e3", "Approved", body([
  ql("dp3", "Plated dinner for 120 guests", 120, "plate", 3800, 0, 5), ql("dp4", "Ghazal singer with orchestra", 1, "show", 280000), ql("dp1", "Courtyard decor & lighting", 1, "set", 360000), ql("dp2", "Photography & short film", 1, "package", 140000),
], [{ label: "Coordination fee", amount: 110000 }], 30), 1, { sentAt: ts(-12), decidedAt: ts(-8) });
mkQuote("q4", "QT/2026-27/0004", "e4", "Sent", body([
  ql("dp7", "Launch stage, 60 sq.m LED & lasers", 1, "lot", 1900000), ql("dp9", "Product pods & demo zones", 6, "pod", 220000), ql("dp4", "Host + performance act", 1, "show", 450000), ql("dp9", "Brand fabrication & media wall", 1, "lot", 700000),
  ql("dp3", "Cocktails & canapés (500)", 500, "guest", 1900, 0, 5), ql("dp2", "Event coverage – photo/video", 1, "package", 260000),
], [{ label: "Production management fee", amount: 520000 }], 35), 1, { sentAt: ts(-4), validUntil: dayOffset(6) });
mkQuote("q5", "QT/2026-27/0005", "e5", "Converted", body([
  ql("dp1", "Floral stage & ring ceremony decor", 1, "set", 340000), ql("dp3", "Dinner for 150 (South Indian)", 150, "plate", 2800, 0, 5), ql("dp2", "Photography & video", 1, "package", 190000), ql("dp4", "Live nadaswaram + DJ", 1, "show", 200000),
], [{ label: "Coordination fee", amount: 150000 }], 30), 1, { sentAt: ts(-80), decidedAt: ts(-76), validUntil: dayOffset(-60) });
mkQuote("q6", "QT/2026-27/0006", "e6", "Converted", body([ql("dp9", "Branded activation pods (4 days)", 4, "day", 270000, 5), ql("dp7", "AV & lighting", 4, "day", 80000), ql("dp6", "Logistics & installation crew", 1, "lot", 120000)], [{ label: "Management fee", amount: 160000 }], 50), 1, { sentAt: ts(-30), decidedAt: ts(-27), validUntil: dayOffset(-20) });
mkQuote("q7", "QT/2026-27/0007", "e7", "Draft", body([ql("dp1", "Royal wedding decor – 2 functions", 1, "lot", 1800000), ql("dp3", "Catering for 650", 650, "guest", 3500, 0, 5), ql("dp5", "Palace lawn hire", 2, "day", 700000)], [{ label: "Planning fee", amount: 400000 }], 30), 1, { validUntil: dayOffset(20), reviewApproved: false });
mkQuote("q10", "QT/2026-27/0000", "e10", "Converted", body([ql("dp7", "Stage, AV and lighting", 2, "day", 420000), ql("dp3", "Meals & awards dinner", 700, "cover", 1500, 0, 5), ql("dp9", "Branding & signage", 1, "lot", 360000), ql("dp1", "Awards stage decor", 1, "set", 220000)], [{ label: "Management fee", amount: 200000 }], 30), 1, { sentAt: ts(-100), decidedAt: ts(-95), validUntil: dayOffset(-80) });
q1.versions[0].total = R(5400000);

/* ---------------- sales orders & invoices ---------------- */
const salesOrders: SalesOrder[] = [];
const invoices: Invoice[] = [];
const payments: Payment[] = [];
let invN = 0, payN = 0;
function mkSO(id: string, quote: Quotation, pcts: number[], names: string[], offsets: number[]): SalesOrder {
  const t = computeQuote(quote.body);
  const so: SalesOrder = {
    id, ref: `SO/2026-27/${String(salesOrders.length + 1).padStart(4, "0")}`, quotationId: quote.id, quotationVersion: quote.version, eventId: quote.eventId, clientId: quote.clientId,
    total: t.grandTotal, taxTotal: t.taxTotal, body: quote.body, createdAt: quote.decidedAt ?? ts(-30),
    milestones: pcts.map((p, i) => ({ id: `${id}_m${i}`, name: names[i], pct: p, amount: Math.round((t.grandTotal * p) / 100), dueDate: dayOffset(offsets[i]) })),
  };
  salesOrders.push(so);
  return so;
}
function mkInv(so: SalesOrder, mi: number, type: Invoice["type"], kind: Invoice["kind"], issueOffset: number, paid: number | "full" | 0, method: PayMethod = "Bank Transfer"): Invoice {
  const m = so.milestones[mi];
  const taxMode = so.body.taxMode;
  const rate = 18;
  const net = taxMode === "inclusive" ? m.amount : Math.round(m.amount / 1.18);
  const lines: InvoiceLine[] = [{ id: `il${invN}_1`, description: `${m.name} – ${events.find((e) => e.id === so.eventId)!.title}`, amount: net, taxRate: rate }];
  const tax = m.amount - net;
  const inv: Invoice = {
    id: `inv${++invN}`, ref: `${type === "Proforma" ? "PF" : "INV"}/2026-27/${String(invN).padStart(4, "0")}`, type, kind, eventId: so.eventId, clientId: so.clientId, salesOrderId: so.id, milestoneId: m.id,
    lines, taxMode: "exclusive", subtotal: net, tax, total: m.amount, issueDate: dayOffset(issueOffset), dueDate: m.dueDate, status: "Issued", note: "",
  };
  invoices.push(inv); m.invoiceId = inv.id;
  const amt = paid === "full" ? inv.total : paid;
  if (amt) payments.push({ id: `pay${++payN}`, ref: `RCT/2026-27/${String(payN).padStart(4, "0")}`, direction: "in", category: "client", eventId: so.eventId, partyId: so.clientId, amount: amt, method, date: dayOffset(Math.min(issueOffset + 3, 0)), reference: `UTR${700000 + payN * 37}`, note: "", invoiceId: inv.id });
  return inv;
}
const so1 = mkSO("so1", q1, [30, 40, 30], ["Booking advance", "Pre-event milestone", "Final balance"], [-44, 7, 16]);
mkInv(so1, 0, "Tax Invoice", "Advance", -44, "full");
mkInv(so1, 1, "Proforma", "Milestone", -3, R(500000), "UPI");
const so2 = mkSO("so2", q2, [40, 40, 20], ["Booking advance", "Mid payment", "Final balance"], [-24, 3, 14]);
mkInv(so2, 0, "Tax Invoice", "Advance", -24, "full");
mkInv(so2, 1, "Tax Invoice", "Milestone", -6, 0);
const so5 = mkSO("so5", quotations.find((q) => q.id === "q5")!, [30, 70], ["Booking advance", "Final balance"], [-76, -22]);
mkInv(so5, 0, "Tax Invoice", "Advance", -76, "full");
mkInv(so5, 1, "Tax Invoice", "Final", -20, "full");
const so6 = mkSO("so6", quotations.find((q) => q.id === "q6")!, [50, 50], ["Booking advance", "Final balance"], [-27, -2]);
mkInv(so6, 0, "Tax Invoice", "Advance", -27, "full", "Cheque");
mkInv(so6, 1, "Tax Invoice", "Final", -3, 0);
const so10 = mkSO("so10", quotations.find((q) => q.id === "q10")!, [30, 70], ["Booking advance", "Final balance"], [-95, -36]);
mkInv(so10, 0, "Tax Invoice", "Advance", -95, "full");
mkInv(so10, 1, "Tax Invoice", "Final", -38, "full");
const so3 = mkSO("so3", quotations.find((q) => q.id === "q3")!, [30, 70], ["Booking advance", "Final balance"], [-8, 28]);
mkInv(so3, 0, "Proforma", "Advance", -7, 0);
quotations.find((q) => q.id === "q3")!.status = "Converted";
quotations.find((q) => q.id === "q3")!.convertedTo = { kind: "booking", salesOrderId: so3.id };
for (const [qid, so] of [["q1", so1], ["q2", so2], ["q5", so5], ["q6", so6], ["q10", so10]] as const)
  quotations.find((q) => q.id === qid)!.convertedTo = { kind: "booking", salesOrderId: so.id };
events.find((e) => e.id === "e3")!.status = "Confirmed";

/* ---------------- vendor assignments, bills, vendor payments ---------------- */
const assignments: VendorAssignment[] = [];
const bills: VendorBill[] = [];
let alN = 0, asN = 0, billN = 0;
function mkAssign(eventId: string, vendorId: string, status: AgreementStatus, items: [string, number, number, number, number?][], extra: Partial<VendorAssignment> = {}): VendorAssignment {
  const ev = events.find((e) => e.id === eventId)!;
  const v = vendors.find((x) => x.id === vendorId)!;
  const lines: AgreementLine[] = items.map(([name, qty, quotedMul, agreedMul, delivered = 0]) => {
    const c = cat(vendorId, name);
    return { id: `al${++alN}`, catalogueItemId: c.id, name: c.name, unit: c.unit, qty, catalogueRate: c.rate, quotedRate: Math.round(c.rate * quotedMul), agreedRate: Math.round(c.rate * agreedMul), discountPct: 0, remarks: "", responsible: "vendor", deliveredQty: delivered };
  });
  const total = agreementTotal(lines);
  const a: VendorAssignment = {
    id: `as${++asN}`, ref: `VA/2026-27/${String(asN).padStart(4, "0")}`, eventId, vendorId, departmentId: v.departmentIds[0], scope: `${v.name} — ${ev.title}`, status, version: 1, lines,
    setupTime: "D-1, 14:00", accessInstructions: "Service gate B; vendor passes at security desk.", deliveryDetails: "Material to reach 12 hours before setup call.", deadline: ev.startDate,
    terms: v.paymentTerms, schedule: [{ id: `ps${asN}a`, label: "Advance", pct: 50, dueDate: dayOffset(-5) }, { id: `ps${asN}b`, label: "Balance on completion", pct: 50, dueDate: ev.endDate }],
    snapshots: [], requirementDocIds: [], createdAt: ts(-40), ...extra,
  };
  if (["Confirmed", "Approved", "Ordered", "Partially Completed", "Completed"].includes(status))
    a.snapshots.push({ version: 1, at: ts(-30), byUserId: "u3", status: "Confirmed", reason: "Scope confirmed with vendor", lines: JSON.parse(JSON.stringify(lines)), total, quotedTotal: lines.reduce((s, l) => s + Math.round(l.qty * l.quotedRate), 0) });
  if (["Ordered", "Partially Completed", "Completed"].includes(status)) { a.poRef = `PO/2026-27/${String(asN).padStart(4, "0")}`; a.orderedAt = ts(-28); }
  assignments.push(a);
  return a;
}
function mkBill(a: VendorAssignment, pct: number, status: VendorBill["status"], dueOffset: number, paidPct = 0): VendorBill {
  const amount = Math.round((agreementTotal(a.lines) * pct) / 100);
  const b: VendorBill = { id: `vb${++billN}`, ref: `VB/2026-27/${String(billN).padStart(4, "0")}`, vendorBillNo: `INV-${4000 + billN * 13}`, assignmentId: a.id, eventId: a.eventId, vendorId: a.vendorId, date: dayOffset(dueOffset - 15), dueDate: dayOffset(dueOffset), amount, status, note: "" };
  bills.push(b);
  if (paidPct) payments.push({ id: `pay${++payN}`, ref: `PAY/2026-27/${String(payN).padStart(4, "0")}`, direction: "out", category: "vendor", eventId: a.eventId, partyId: a.vendorId, amount: Math.round((amount * paidPct) / 100), method: "Bank Transfer", date: dayOffset(Math.min(dueOffset - 3, -1)), reference: `NEFT${880000 + payN * 11}`, note: "", billId: b.id, assignmentId: a.id });
  return b;
}
function mkAdvance(a: VendorAssignment, pct: number, dayOff: number) {
  payments.push({ id: `pay${++payN}`, ref: `PAY/2026-27/${String(payN).padStart(4, "0")}`, direction: "out", category: "vendor", eventId: a.eventId, partyId: a.vendorId, amount: Math.round((agreementTotal(a.lines) * pct) / 100), method: "Bank Transfer", date: dayOffset(dayOff), reference: `NEFT${880000 + payN * 11}`, note: "Advance", assignmentId: a.id });
}
// e1 wedding
const a1 = mkAssign("e1", "v1", "Ordered", [["Floral mandap", 1, 1.05, 0.96], ["Stage backdrop", 2, 1, 0.95], ["Entrance floral arch", 3, 1, 1], ["Table centrepieces", 120, 1, 0.9]]);
mkAdvance(a1, 50, -20);
const a2 = mkAssign("e1", "v3", "Approved", [["Premium veg buffet", 640, 1.05, 0.97], ["Live counters", 8, 1, 0.95], ["Premium beverage", 320, 1, 1]]);
mkAssign("e1", "v3", "Awaiting Confirmation", [["Cocktail snacks", 320, 1.1, 1.1]], { scope: "Second caterer — cocktail hour (multiple vendors in same department)" });
mkAssign("e1", "v5", "Confirmed", [["Sufi night", 1, 1, 0.95], ["Celebrity DJ", 1, 1.08, 1]]);
mkAssign("e1", "v6", "Ordered", [["Palace lawn hire", 3, 1, 0.92], ["Deluxe room block", 240, 1, 0.9]]);
mkAssign("e1", "v4", "Draft", [["Line-array", 3, 1, 1], ["Intelligent lighting", 3, 1, 1]]);
mkAssign("e1", "v7", "Sent", [["Guest coach", 12, 1, 1], ["Sedan transfers", 60, 1, 1], ["Cargo truck", 2, 1, 1]]);
mkAssign("e1", "v2", "Confirmed", [["Candid photography", 3, 1, 0.95], ["Cinematic", 1, 1, 0.97], ["Drone", 3, 1, 1]]);
// e2 conference
const a8 = mkAssign("e2", "v4", "Ordered", [["Line-array", 2, 1, 0.9], ["LED wall", 600, 1, 0.92], ["Intelligent lighting", 2, 1, 0.95], ["Stage truss", 1, 1, 1]]);
mkAdvance(a8, 50, -15);
mkAssign("e2", "v9", "Partially Completed", [["Exhibition booth", 800, 1, 0.9, 480], ["Branded photo wall", 2, 1, 1, 2], ["Standees", 40, 1, 1, 40]]);
mkAssign("e2", "v3", "Confirmed", [["Premium veg buffet", 1300, 1, 0.96]], { schedule: [{ id: "psx", label: "Advance", pct: 40, dueDate: dayOffset(5) }, { id: "psy", label: "Balance", pct: 60, dueDate: dayOffset(20) }] });
mkAssign("e2", "v8", "Ordered", [["Badges", 1300, 1, 0.9], ["Signage & wayfinding", 3, 1, 1]]);
// e5 completed engagement
const a12 = mkAssign("e5", "v1", "Completed", [["Stage backdrop", 1, 1, 0.95], ["Table centrepieces", 30, 1, 0.9]], { deadline: dayOffset(-18) });
mkBill(a12, 100, "Approved", -5, 100);
const a13 = mkAssign("e5", "v3", "Completed", [["Premium veg buffet", 150, 1, 0.95]], { deadline: dayOffset(-18) });
mkBill(a13, 100, "Approved", -4, 100);
const a14 = mkAssign("e5", "v2", "Completed", [["Candid photography", 1, 1, 1], ["Cinematic", 1, 1, 0.95]], { deadline: dayOffset(-18) });
mkBill(a14, 100, "Approved", 6, 0);
// e6 activation (in progress)
const a15 = mkAssign("e6", "v9", "Partially Completed", [["Branded photo wall", 4, 1, 0.95, 4], ["Standees", 20, 1, 1, 20]], { deadline: dayOffset(2) });
mkAdvance(a15, 50, -10);
mkAssign("e6", "v10", "Ordered", [["Lounge furniture", 6, 1, 1, 6], ["Generator", 4, 1, 1, 1]]);
// e10 completed corp
const a17 = mkAssign("e10", "v4", "Completed", [["Line-array", 2, 1, 0.9], ["LED wall", 400, 1, 0.9], ["Intelligent lighting", 2, 1, 1]], { deadline: dayOffset(-39) });
mkBill(a17, 100, "Approved", -25, 100);
const a18 = mkAssign("e10", "v3", "Completed", [["Premium veg buffet", 700, 1, 0.95]], { deadline: dayOffset(-39) });
mkBill(a18, 100, "Approved", -24, 100);
mkAssign("e3", "v5", "Awaiting Confirmation", [["Sufi night", 1, 1.05, 1.0]]);
mkAssign("e3", "v3", "Draft", [["Premium veg buffet", 120, 1, 1]]);
void a2;

/* ---------------- expenses ---------------- */
const expenses: Expense[] = [];
let exN = 0;
const ex = (eventId: string | undefined, category: string, payee: string, off: number, amount: number, status: Expense["status"], method: PayMethod = "Bank Transfer", pettyCash = false, departmentId?: string): void => {
  expenses.push({ id: `ex${++exN}`, ref: `EXP/2026-27/${String(exN).padStart(4, "0")}`, eventId, departmentId, category, payee, date: dayOffset(off), amount: R(amount), method, status, pettyCash, note: "" });
};
ex("e1", "Travel & recce", "Air India", -15, 68000, "Paid", "Card", false, "dp6");
ex("e1", "Staff accommodation", "Heritage Stays", -3, 42000, "Approved", "Bank Transfer", false, "dp5");
ex("e2", "Permits & licences", "BBMP Events Desk", -9, 36000, "Paid", "Cash", false);
ex("e2", "Courier & dispatch", "BlueDart", -4, 9800, "Paid", "UPI", true);
ex("e5", "Staff meals & travel", "Team", -18, 24000, "Paid", "Cash", true);
ex("e5", "Insurance", "ICICI Lombard", -25, 18000, "Paid", "Bank Transfer");
ex("e6", "Mall licence fee", "Phoenix Mall", -14, 120000, "Paid", "Bank Transfer");
ex("e6", "Sampling material", "Local vendor", 0, 38000, "Pending", "Cash", true);
ex("e10", "Staff travel", "Team", -41, 54000, "Paid", "Card");
ex("e10", "Insurance", "ICICI Lombard", -45, 22000, "Paid", "Bank Transfer");
ex(undefined, "Office petty cash", "Admin", -2, 6500, "Paid", "Cash", true);

/* ---------------- tasks ---------------- */
const tasks: Task[] = [];
let tN = 0;
const task = (title: string, status: TaskStatus, priority: Priority, assigneeId: string, eventId: string | undefined, dueOff: number | null, departmentId?: string, extra: Partial<Task> = {}): Task => {
  const t: Task = {
    id: `t${++tN}`, title, description: "", status, priority, assigneeId, departmentId, eventId, start: dueOff === null ? undefined : dayOffset(dueOff - 5), due: dueOff === null ? undefined : dayOffset(dueOff),
    dependsOn: [], checklist: [], comments: [], attachments: [], history: [{ at: ts(-10), text: "Task created" }], kind: "task", createdAt: ts(-10), ...extra,
  };
  tasks.push(t); return t;
};
const t1 = task("Confirm decor cargo schedule with SwiftMove", "Ongoing", "Critical", "u3", "e1", 2, "dp6", { checklist: [{ id: "c1", text: "Share packing list", done: true }, { id: "c2", text: "Confirm truck count", done: false }, { id: "c3", text: "Insurance cover", done: false }] });
task("Send room allocation sheet to Heritage Stays", "To Do", "High", "u3", "e1", 4, "dp5", { dependsOn: [t1.id] });
task("Lock Sangeet performance run-of-show", "Planning", "High", "u3", "e1", 8, "dp4");
task("Collect final guest count – Sharma wedding", "To Do", "Medium", "u3", "e1", 10);
task("Print wedding signage and welcome kits", "Ongoing", "Medium", "u4", "e1", -2, "dp8");
task("Vendor confirmation call: Spice Route", "To Do", "High", "u3", "e1", -1, "dp3");
task("Final AV technical rehearsal plan", "Planning", "Critical", "u4", "e2", 3, "dp7");
task("Collect speaker presentation decks", "Ongoing", "High", "u4", "e2", 0);
task("Approve booth fabrication final proofs", "Ongoing", "High", "u4", "e2", 1, "dp9");
task("Speaker green-room hospitality plan", "To Do", "Low", "u6", "e2", 6);
task("Security and entry badge plan", "To Do", "Medium", "u4", "e2", 5);
task("Chase NovaPhone concept sign-off", "To Do", "High", "u3", "e4", 5, "dp9");
task("Prepare creative moodboard v2", "Planning", "Medium", "u3", "e4", 9, "dp9");
task("Finalise Ghazal artist travel", "To Do", "Medium", "u4", "e3", 15, "dp4");
task("Daily activation report – Brandstorm", "Ongoing", "Medium", "u3", "e6", 0);
task("Dismantle & return of rented furniture", "To Do", "High", "u3", "e6", 3, "dp1");
task("Reconcile vendor bills – Reddy engagement", "Ongoing", "High", "u5", "e5", 2);
task("Send event settlement statement – Reddy", "To Do", "Medium", "u5", "e5", 4);
task("Collect testimonials from Helix", "Completed", "Low", "u2", "e10", -30);
task("Review Gupta reception venue clash", "To Do", "Critical", "u2", "e8", -3, undefined, { kind: "followup" });
task("Update vendor rate cards for Q4", "To Do", "Low", "u2", undefined, 14);
task("Staff training: new inventory app", "Planning", "Low", "u1", undefined, 20);
task("Client meeting – Singh family (proposal walkthrough)", "To Do", "High", "u4", "e7", 2, undefined, { kind: "meeting" });
task("Follow up lead: Meghna Kulkarni", "To Do", "Medium", "u4", undefined, 0, undefined, { kind: "followup" });
task("Book site recce flights – Rajasthan", "Completed", "Medium", "u3", "e1", -22);
task("Archive old brochures", "Archived", "Low", "u6", undefined, null);

/* ---------------- inventory ---------------- */
const inv = (id: string, sku: string, name: string, category: string, unit: string, total: number, damaged: number, reorder: number, location: string, rental = false, rentalRate = 0): InventoryItem =>
  ({ id, sku, name, category, unit, total, damaged, unavailable: 0, reorderLevel: reorder, location, rental, rentalRate: R(rentalRate) });
const inventory: InventoryItem[] = [
  inv("in1", "CH-001", "Banquet chair (gold)", "Furniture", "pcs", 800, 12, 100, "Mumbai Warehouse A", true, 55),
  inv("in2", "TB-001", "Round table 6ft", "Furniture", "pcs", 120, 3, 20, "Mumbai Warehouse A", true, 450),
  inv("in3", "LG-010", "Par can LED light", "Lighting", "pcs", 160, 6, 30, "Bengaluru Depot", false),
  inv("in4", "LG-020", "Moving head light", "Lighting", "pcs", 48, 2, 10, "Bengaluru Depot"),
  inv("in5", "AV-005", "Wireless handheld mic", "Audio", "pcs", 30, 1, 8, "Bengaluru Depot"),
  inv("in6", "DC-100", "Floral arch frame", "Decor", "pcs", 14, 0, 4, "Mumbai Warehouse B"),
  inv("in7", "DC-110", "Draping fabric roll (ivory)", "Decor", "rolls", 60, 4, 15, "Mumbai Warehouse B"),
  inv("in8", "FR-050", "Lounge sofa set", "Furniture", "sets", 22, 1, 5, "Mumbai Warehouse A", true, 3500),
  inv("in9", "ST-001", "Truss 3m", "Staging", "pcs", 90, 2, 20, "Bengaluru Depot"),
  inv("in10", "PW-020", "Generator 62 kVA", "Power", "pcs", 4, 0, 1, "Mumbai Warehouse A", true, 9000),
  inv("in11", "AV-030", "LED screen panel", "Audio-Visual", "pcs", 80, 3, 16, "Bengaluru Depot", true, 1200),
  inv("in12", "DC-200", "Pillar candle stand", "Decor", "pcs", 260, 10, 50, "Mumbai Warehouse B"),
];
const alloc = (id: string, eventId: string, itemId: string, required: number, reserved: number, dispatched: number, returned: number, damaged = 0, missing = 0): StockAllocation => {
  const e = events.find((x) => x.id === eventId)!;
  return { id, eventId, itemId, required, reserved, dispatched, returned, damaged, missing, from: e.startDate, to: e.endDate };
};
const allocations: StockAllocation[] = [
  alloc("al1", "e1", "in1", 400, 400, 0, 0), alloc("al2", "e1", "in2", 50, 50, 0, 0), alloc("al3", "e1", "in8", 12, 12, 0, 0), alloc("al4", "e1", "in12", 150, 120, 0, 0),
  alloc("al5", "e2", "in1", 600, 600, 0, 0), alloc("al6", "e2", "in11", 40, 40, 0, 0), alloc("al7", "e2", "in9", 40, 40, 0, 0), alloc("al8", "e2", "in5", 14, 14, 0, 0),
  alloc("al9", "e6", "in8", 6, 6, 6, 0), alloc("al10", "e6", "in3", 40, 40, 40, 0), alloc("al11", "e8", "in1", 450, 450, 0, 0), alloc("al12", "e8", "in12", 200, 180, 0, 0),
  alloc("al13", "e5", "in1", 160, 160, 160, 160, 3, 0),
];
const movements: StockMovement[] = [
  { id: "sm1", itemId: "in8", eventId: "e6", type: "Dispatch", qty: 6, at: ts(-2), note: "Dispatched to Phoenix Marketcity", byUserId: "u3" },
  { id: "sm2", itemId: "in3", eventId: "e6", type: "Dispatch", qty: 40, at: ts(-2), note: "Dispatched to Phoenix Marketcity", byUserId: "u3" },
  { id: "sm3", itemId: "in1", eventId: "e5", type: "Return", qty: 160, at: ts(-17), note: "Returned after engagement (3 damaged)", byUserId: "u4" },
  { id: "sm4", itemId: "in1", eventId: "e5", type: "Damaged", qty: 3, at: ts(-17), note: "Broken legs", byUserId: "u4" },
  { id: "sm5", itemId: "in7", type: "Purchase", qty: 20, at: ts(-30), note: "Restock draping", byUserId: "u2" },
];

/* ---------------- settings ---------------- */
const settings: CompanySettings = {
  name: "Evently Productions", legalName: "Evently Productions Pvt Ltd", address: "402, Crescent Business Park, Andheri East, Mumbai 400093", phone: "+91 22 4000 1234",
  email: "hello@evently.demo", gstin: "27AAECE4321K1Z8", pan: "AAECE4321K", currency: "INR", taxRegistered: true, invoiceDefaultTaxMode: "exclusive", logoText: "Evently", primary: "#6D4AFF",
  bank: "HDFC Bank · A/C 50200012345678 · IFSC HDFC0000123 · Andheri East", terms: TERMS, paymentMethods: ["Cash", "Bank Transfer", "UPI", "Cheque", "Card"],
  vendorCategories: vcats, units: ["event", "day", "piece", "set", "guest", "plate", "sqft", "show", "hour", "trip", "room-night", "lot"].map((u, i) => ({ id: `un${i}`, name: u, short: u })),
  taxRates: [{ id: "tx0", name: "Exempt / 0%", rate: 0, active: true }, { id: "tx1", name: "GST 5%", rate: 5, active: true }, { id: "tx2", name: "GST 12%", rate: 12, active: true }, { id: "tx3", name: "GST 18%", rate: 18, active: true }],
  numbering: [
    { key: "event", label: "Event reference", prefix: "EVT-2026-", next: 109, padding: 4 }, { key: "client", label: "Client", prefix: "CL-", next: 11, padding: 4 },
    { key: "quotation", label: "Client quotation", prefix: "QT/2026-27/", next: 8, padding: 4 }, { key: "salesOrder", label: "Sales order", prefix: "SO/2026-27/", next: 7, padding: 4 },
    { key: "invoice", label: "Tax invoice", prefix: "INV/2026-27/", next: invN + 1, padding: 4 }, { key: "proforma", label: "Proforma", prefix: "PF/2026-27/", next: 50, padding: 4 },
    { key: "creditNote", label: "Credit note", prefix: "CN/2026-27/", next: 1, padding: 4 }, { key: "receipt", label: "Payment receipt", prefix: "RCT/2026-27/", next: payN + 1, padding: 4 },
    { key: "assignment", label: "Vendor agreement", prefix: "VA/2026-27/", next: asN + 1, padding: 4 }, { key: "po", label: "Purchase / work order", prefix: "PO/2026-27/", next: asN + 1, padding: 4 },
    { key: "bill", label: "Vendor bill (internal)", prefix: "VB/2026-27/", next: billN + 1, padding: 4 }, { key: "vpay", label: "Vendor payment", prefix: "PAY/2026-27/", next: payN + 1, padding: 4 },
    { key: "expense", label: "Expense", prefix: "EXP/2026-27/", next: exN + 1, padding: 4 }, { key: "doc", label: "Generic document", prefix: "DOC/2026-27/", next: 1, padding: 4 },
  ],
  statusFlow: {
    Enquiry: ["Planning", "Confirmed", "On Hold", "Cancelled"], Planning: ["Confirmed", "On Hold", "Cancelled"], Confirmed: ["In Progress", "On Hold", "Cancelled", "Planning"],
    "In Progress": ["Completed", "Cancelled"], Completed: [], Cancelled: ["Enquiry"], "On Hold": ["Planning", "Confirmed", "Cancelled"],
  } as Record<EventStatus, EventStatus[]>,
  notificationPrefs: { event: true, task: true, quotation: true, vendor: true, payment: true, inventory: true, conflict: true, document: true, assignment: true, system: true },
};

const notifications: AppNotification[] = [
  { id: "n1", type: "system", severity: "info", title: "Welcome to the Evently ERP demo", body: "All data is simulated and stored in your browser. Reset it any time from Settings → Application.", link: "/settings", at: ts(0, 8), read: false },
];

export function buildSeed(): DB {
  return JSON.parse(JSON.stringify({
    settings, roles, users, departments, eventTypes, clients, communications: [
      { id: "cm1", clientId: "c1", kind: "meeting", summary: "Venue walkthrough in Udaipur with family. Agreed on pastel palette.", at: ts(-70), byUserId: "u3", minutes: "Attendees: Ananya, Rajesh Sharma, Rohan. Agreed theme: ivory & blush. Action: share 3 mandap options.", followUpAt: dayOffset(-60) },
      { id: "cm2", clientId: "c1", kind: "call", summary: "Discussed guest transport and airport pickups.", at: ts(-12), byUserId: "u3" },
      { id: "cm3", clientId: "c2", kind: "email", summary: "Sent revised branding checklist for the summit.", at: ts(-5), byUserId: "u4" },
      { id: "cm4", clientId: "c4", kind: "whatsapp", summary: "Client asked for LED stage options with lasers.", at: ts(-6), byUserId: "u3", followUpAt: dayOffset(1) },
    ], leads: leadsSeed, events, vendors, catalogue, assignments, bills, quotations, salesOrders, invoices, payments, expenses, tasks, inventory, allocations, movements,
    notifications, audit: [
      { id: "au1", at: ts(-2, 9), userId: "u3", action: "Created", entity: "Event", entityId: "e6", eventId: "e6", summary: "Dispatch recorded for Brandstorm Summer Activation" },
      { id: "au2", at: ts(-1, 11), userId: "u4", action: "Updated", entity: "Quotation", entityId: "q4", eventId: "e4", summary: "Quotation QT/2026-27/0004 marked as Sent" },
      { id: "au3", at: ts(-3, 15), userId: "u5", action: "Recorded", entity: "Payment", entityId: "pay1", eventId: "e1", summary: "Payment received for Sharma–Kapoor Destination Wedding" },
    ], documents: [],
  } satisfies DB));
}
