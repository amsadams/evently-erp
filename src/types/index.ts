/**
 * Shared domain types. These are framework-free so they can be reused by a
 * future backend (Prisma/PostgreSQL) and a React Native app.
 * All money values are INTEGER MINOR UNITS (paise). Never store floats.
 */

export type ID = string;
export type ISODate = string; // yyyy-MM-dd
export type ISODateTime = string; // full ISO timestamp
export type Money = number; // minor units

/* ---------- Access ---------- */
export type PermissionCode =
  | "events.read" | "events.write"
  | "clients.read" | "clients.write"
  | "vendors.read" | "vendors.write"
  | "quotes.read" | "quotes.write" | "quotes.approve"
  | "finance.read" | "finance.write"
  | "tasks.write" | "inventory.write"
  | "reports.read" | "settings.manage" | "audit.read";

export interface Role {
  id: ID;
  name: string;
  description: string;
  permissions: PermissionCode[];
}

export interface User {
  id: ID;
  name: string;
  email: string;
  phone: string;
  roleId: ID;
  departmentId: ID;
  active: boolean;
}

export interface Department {
  id: ID;
  name: string;
  color: string;
  active: boolean;
  order: number;
  description: string;
}

/* ---------- CRM ---------- */
export interface Contact { id: ID; name: string; role: string; phone: string; email: string }

export interface Client {
  id: ID;
  type: "individual" | "corporate";
  name: string;
  company?: string;
  email: string;
  phone: string;
  address: string;
  gstin?: string;
  contacts: Contact[];
  preferences: string;
  tags: string[];
  archived: boolean;
  createdAt: ISODateTime;
}

export type CommKind = "call" | "email" | "meeting" | "whatsapp" | "note";
export interface Communication {
  id: ID; clientId: ID; kind: CommKind; summary: string; at: ISODateTime; byUserId: ID;
  minutes?: string; followUpAt?: ISODate;
}

export type LeadStage = "New" | "Contacted" | "Proposal" | "Negotiation" | "Won" | "Lost";
export const LEAD_STAGES: LeadStage[] = ["New", "Contacted", "Proposal", "Negotiation", "Won", "Lost"];
export interface Lead {
  id: ID; name: string; phone: string; email: string; source: string; eventTypeId: ID;
  expectedDate: ISODate; budget: Money; guests: number; stage: LeadStage;
  followUpAt?: ISODate; notes: string; clientId?: ID; eventId?: ID; createdAt: ISODateTime;
}

/* ---------- Events ---------- */
export type EventStatus = "Enquiry" | "Planning" | "Confirmed" | "In Progress" | "Completed" | "Cancelled" | "On Hold";
export const EVENT_STATUSES: EventStatus[] = ["Enquiry", "Planning", "Confirmed", "In Progress", "Completed", "Cancelled", "On Hold"];
export type Priority = "Low" | "Medium" | "High" | "Critical";

export interface EventType {
  id: ID; name: string; category: "wedding" | "corporate" | "private"; color: string;
  defaultFunctions: string[]; defaultDepartmentIds: ID[]; taskTemplate: { title: string; offsetDays: number; departmentId?: ID }[];
  milestoneTemplate: { title: string; offsetDays: number }[];
}

export interface EventFunction { id: ID; name: string; date: ISODate; startTime: string; endTime: string; venue: string; guests: number }
export interface Milestone { id: ID; title: string; date: ISODate; done: boolean }
export interface DepartmentPlan { departmentId: ID; budget: Money; requirements: string; notes: string }

export interface EventRecord {
  id: ID; ref: string; title: string; clientId: ID; typeId: ID; status: EventStatus; priority: Priority;
  coordinatorId: ID; venue: string; city: string; startDate: ISODate; endDate: ISODate;
  startTime: string; endTime: string; guests: number; budget: Money; description: string;
  logistics: string; functions: EventFunction[]; milestones: Milestone[]; plans: DepartmentPlan[];
  createdAt: ISODateTime; closure?: { closedAt: ISODateTime; byUserId: ID; note: string };
}

/* ---------- Catalogue & vendors ---------- */
export interface Unit { id: ID; name: string; short: string }

export interface CatalogueItem {
  id: ID; scope: "vendor" | "company"; vendorId?: ID; departmentId: ID; name: string; unit: string;
  rate: Money; // vendor cost rate for vendor scope, selling rate for company scope
  taxRate: number; active: boolean; description?: string;
}

export interface VendorCategory { id: ID; name: string }
export interface VendorDocument { id: ID; name: string; type: string; expiry?: ISODate }
export interface VendorFeedback { id: ID; eventId?: ID; rating: number; comment: string; at: ISODateTime; byUserId: ID }

export interface Vendor {
  id: ID; name: string; categoryId: ID; departmentIds: ID[]; services: string[]; contacts: Contact[];
  phone: string; email: string; city: string; serviceLocations: string[]; status: "Active" | "On Hold" | "Archived";
  paymentTerms: string; gstin?: string; bank: { holder: string; bankName: string; account: string; ifsc: string; upi?: string };
  documents: VendorDocument[]; feedback: VendorFeedback[]; unavailableDates: ISODate[]; createdAt: ISODateTime;
}

export type AgreementStatus =
  | "Draft" | "Sent" | "Awaiting Confirmation" | "Confirmed" | "Revised" | "Approved"
  | "Ordered" | "Partially Completed" | "Completed" | "Cancelled";
export const AGREEMENT_STATUSES: AgreementStatus[] = [
  "Draft", "Sent", "Awaiting Confirmation", "Confirmed", "Revised", "Approved", "Ordered", "Partially Completed", "Completed", "Cancelled",
];

export interface AgreementLine {
  id: ID; catalogueItemId?: ID; name: string; unit: string; qty: number;
  catalogueRate: Money; // catalogue price when the line was added (reference only)
  quotedRate: Money; // vendor quote
  agreedRate: Money; // negotiated / agreed
  discountPct: number; remarks: string; responsible: "vendor" | "internal"; deliveredQty: number;
}
export interface PayScheduleItem { id: ID; label: string; pct: number; dueDate: ISODate }
export interface AgreementSnapshot {
  version: number; at: ISODateTime; byUserId: ID; status: AgreementStatus; reason: string;
  lines: AgreementLine[]; total: Money; quotedTotal: Money;
}
export interface VendorAssignment {
  id: ID; ref: string; eventId: ID; vendorId: ID; departmentId: ID; scope: string; status: AgreementStatus; version: number;
  lines: AgreementLine[]; setupTime: string; accessInstructions: string; deliveryDetails: string; deadline?: ISODate;
  terms: string; schedule: PayScheduleItem[]; snapshots: AgreementSnapshot[]; poRef?: string; orderedAt?: ISODateTime;
  requirementDocIds: ID[]; createdAt: ISODateTime;
}
export type BillStatus = "Pending" | "Approved" | "Disputed" | "Cancelled";
export interface VendorBill {
  id: ID; ref: string; vendorBillNo: string; assignmentId: ID; eventId: ID; vendorId: ID;
  date: ISODate; dueDate: ISODate; amount: Money; status: BillStatus; note: string;
}

/* ---------- Sales ---------- */
export type QuoteStatus = "Draft" | "Internal Review" | "Sent" | "Approved" | "Rejected" | "Expired" | "Converted";
export type TaxMode = "exclusive" | "inclusive" | "none";
export interface QuoteLine {
  id: ID; departmentId: ID; catalogueItemId?: ID; name: string; description: string; qty: number; unit: string;
  rate: Money; discountPct: number; taxRate: number;
}
export interface QuoteCharge { id: ID; label: string; amount: Money; taxRate: number }
export interface QuoteBody {
  lines: QuoteLine[]; charges: QuoteCharge[]; taxMode: TaxMode; advancePct: number; terms: string; paymentTerms: string; notes: string;
}
export interface QuoteVersion { version: number; at: ISODateTime; byUserId: ID; reason: string; total: Money; body: QuoteBody; status: QuoteStatus }
export interface Quotation {
  id: ID; ref: string; eventId: ID; clientId: ID; title: string; status: QuoteStatus; version: number; validUntil: ISODate;
  body: QuoteBody; versions: QuoteVersion[]; reviewApproved: boolean; sentAt?: ISODateTime; decidedAt?: ISODateTime;
  convertedTo?: { kind: "booking"; salesOrderId: ID } | { kind: "invoice"; invoiceId: ID }; createdAt: ISODateTime; createdBy: ID;
}

export interface Milestone2 { id: ID; name: string; pct: number; amount: Money; dueDate: ISODate; invoiceId?: ID }
export interface SalesOrder {
  id: ID; ref: string; quotationId: ID; quotationVersion: number; eventId: ID; clientId: ID; total: Money; taxTotal: Money;
  milestones: Milestone2[]; createdAt: ISODateTime; body: QuoteBody;
}

export type InvoiceType = "Proforma" | "Tax Invoice" | "Bill of Supply" | "Credit Note";
export type InvoiceKind = "Advance" | "Milestone" | "Partial" | "Final" | "Adjustment";
export type InvoiceStatus = "Draft" | "Issued" | "Void";
export interface InvoiceLine { id: ID; description: string; amount: Money; taxRate: number }
export interface Invoice {
  id: ID; ref: string; type: InvoiceType; kind: InvoiceKind; eventId: ID; clientId: ID; salesOrderId?: ID; milestoneId?: ID;
  lines: InvoiceLine[]; taxMode: TaxMode; subtotal: Money; tax: Money; total: Money; issueDate: ISODate; dueDate: ISODate;
  status: InvoiceStatus; note: string; refInvoiceId?: ID; voidReason?: string;
}

/* ---------- Money movements ---------- */
export type PayMethod = "Cash" | "Bank Transfer" | "UPI" | "Cheque" | "Card";
export type PaymentCategory = "client" | "vendor" | "refund" ;
export interface Payment {
  id: ID; ref: string; direction: "in" | "out"; category: PaymentCategory; eventId: ID; partyId: ID; amount: Money;
  method: PayMethod; date: ISODate; reference: string; note: string;
  invoiceId?: ID; billId?: ID; assignmentId?: ID; // allocation targets
}
export type ExpenseStatus = "Pending" | "Approved" | "Paid" | "Rejected";
export interface Expense {
  id: ID; ref: string; eventId?: ID; departmentId?: ID; category: string; payee: string; date: ISODate; amount: Money;
  method: PayMethod; status: ExpenseStatus; pettyCash: boolean; note: string;
}

/* ---------- Tasks ---------- */
export type TaskStatus = "To Do" | "Planning" | "Ongoing" | "Completed" | "Cancelled" | "Archived";
export const TASK_STATUSES: TaskStatus[] = ["To Do", "Planning", "Ongoing", "Completed", "Cancelled", "Archived"];
export interface Task {
  id: ID; title: string; description: string; status: TaskStatus; priority: Priority; assigneeId: ID; departmentId?: ID;
  eventId?: ID; start?: ISODate; due?: ISODate; reminderDays?: number; dependsOn: ID[];
  checklist: { id: ID; text: string; done: boolean }[];
  comments: { id: ID; userId: ID; text: string; at: ISODateTime }[];
  attachments: string[]; history: { at: ISODateTime; text: string }[]; kind: "task" | "meeting" | "followup"; createdAt: ISODateTime;
}

/* ---------- Inventory ---------- */
export interface InventoryItem {
  id: ID; sku: string; name: string; category: string; unit: string; total: number; damaged: number; unavailable: number;
  reorderLevel: number; location: string; rental: boolean; rentalRate: Money; vendorId?: ID;
}
export interface StockAllocation {
  id: ID; eventId: ID; itemId: ID; required: number; reserved: number; dispatched: number; returned: number;
  damaged: number; missing: number; from: ISODate; to: ISODate;
}
export type MovementType = "Reserve" | "Release" | "Dispatch" | "Return" | "Damaged" | "Missing" | "Adjustment" | "Purchase";
export interface StockMovement { id: ID; itemId: ID; eventId?: ID; type: MovementType; qty: number; at: ISODateTime; note: string; byUserId: ID }

/* ---------- System ---------- */
export type Severity = "info" | "success" | "warning" | "critical";
export type NotificationType =
  | "event" | "task" | "quotation" | "vendor" | "payment" | "inventory" | "conflict" | "document" | "assignment" | "system";
export interface AppNotification {
  id: ID; type: NotificationType; severity: Severity; title: string; body: string; link?: string; at: ISODateTime; read: boolean; dedupeKey?: string;
}
export interface AuditEntry { id: ID; at: ISODateTime; userId: ID; action: string; entity: string; entityId: ID; eventId?: ID; summary: string }

export type DocKind =
  | "Client Quotation" | "Vendor Requirement" | "Purchase / Work Order" | "Client Invoice" | "Payment Receipt"
  | "Expense Report" | "Event Summary" | "Settlement Statement" | "Credit Note";

export interface DocSnapshot {
  title: string; docLabel: string; ref: string; version: number; date: string; status: string;
  parties: { label: string; lines: string[] }[]; meta: [string, string][];
  tables: { heading?: string; columns: string[]; rows: string[][]; align?: ("left" | "right")[] }[];
  totals: [string, string, boolean?][]; notes: { heading: string; text: string }[]; signatures: string[]; disclaimer?: string;
}
export interface DocumentRecord {
  id: ID; kind: DocKind; ref: string; version: number; title: string; eventId?: ID; partyName: string; status: string;
  createdAt: ISODateTime; byUserId: ID; sourceId?: ID; superseded?: boolean; snapshot: DocSnapshot;
}

export interface NumberingRule { key: string; label: string; prefix: string; next: number; padding: number }
export interface TaxRate { id: ID; name: string; rate: number; active: boolean }
export interface CompanySettings {
  name: string; legalName: string; address: string; phone: string; email: string; gstin: string; pan: string;
  currency: string; taxRegistered: boolean; invoiceDefaultTaxMode: TaxMode; logoText: string; primary: string;
  bank: string; terms: string; paymentMethods: PayMethod[]; vendorCategories: VendorCategory[]; units: Unit[];
  taxRates: TaxRate[]; numbering: NumberingRule[];
  statusFlow: Record<EventStatus, EventStatus[]>;
  notificationPrefs: Record<NotificationType, boolean>;
}

/** Plain data shape of the whole ERP database (what the repository persists). */
export interface DB {
  settings: CompanySettings; roles: Role[]; users: User[]; departments: Department[]; eventTypes: EventType[];
  clients: Client[]; communications: Communication[]; leads: Lead[]; events: EventRecord[]; vendors: Vendor[];
  catalogue: CatalogueItem[]; assignments: VendorAssignment[]; bills: VendorBill[]; quotations: Quotation[];
  salesOrders: SalesOrder[]; invoices: Invoice[]; payments: Payment[]; expenses: Expense[]; tasks: Task[];
  inventory: InventoryItem[]; allocations: StockAllocation[]; movements: StockMovement[];
  notifications: AppNotification[]; audit: AuditEntry[]; documents: DocumentRecord[];
}
