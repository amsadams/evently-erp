import { z } from "zod";

/** Validation schemas shared by forms (and reusable by a future backend / React Native client). */
const phone = z.string().trim().min(7, "Enter a valid phone number").max(20);
const optionalEmail = z.string().trim().refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address");
const isoDate = z.string().min(1, "Select a date");

export const clientSchema = z.object({
  type: z.enum(["individual", "corporate"]),
  name: z.string().trim().min(2, "Name is required"),
  company: z.string().optional(),
  email: optionalEmail,
  phone,
  address: z.string().optional(),
  gstin: z.string().optional(),
  preferences: z.string().optional(),
});

export const leadSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  phone: z.string().optional(),
  email: optionalEmail,
  source: z.string().min(1),
  eventTypeId: z.string().min(1, "Select an event type"),
  expectedDate: isoDate,
  budget: z.number().min(0),
  guests: z.number().int().min(1, "At least 1 guest"),
  followUpAt: z.string().optional(),
  notes: z.string().optional(),
});

export const taskSchema = z.object({
  title: z.string().trim().min(3, "Give the task a title"),
  description: z.string().optional(),
  kind: z.enum(["task", "meeting", "followup"]),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  status: z.enum(["To Do", "Planning", "Ongoing", "Completed", "Cancelled", "Archived"]),
  assigneeId: z.string().min(1, "Choose an assignee"),
  eventId: z.string().optional(),
  departmentId: z.string().optional(),
  start: z.string().optional(),
  due: z.string().optional(),
  reminderDays: z.number().int().min(0).max(30).optional(),
}).refine((v) => !v.start || !v.due || v.start <= v.due, { path: ["due"], message: "Due date must be on or after the start date" });

export const expenseSchema = z.object({
  eventId: z.string().optional(),
  departmentId: z.string().optional(),
  category: z.string().trim().min(2, "Category is required"),
  payee: z.string().trim().min(2, "Payee is required"),
  date: isoDate,
  amount: z.number().int().positive("Enter an amount"),
  method: z.enum(["Cash", "Bank Transfer", "UPI", "Cheque", "Card"]),
  status: z.enum(["Pending", "Approved", "Paid", "Rejected"]),
  pettyCash: z.boolean().optional(),
  note: z.string().optional(),
});

export const vendorSchema = z.object({
  name: z.string().trim().min(2, "Vendor name is required"),
  categoryId: z.string().min(1, "Select a category"),
  city: z.string().trim().min(2, "City is required"),
  phone,
  email: optionalEmail,
  gstin: z.string().optional(),
  paymentTerms: z.string().optional(),
  contactName: z.string().optional(),
  status: z.enum(["Active", "On Hold", "Archived"]),
});

export const inventorySchema = z.object({
  name: z.string().trim().min(2, "Item name is required"),
  sku: z.string().trim().min(2, "SKU is required"),
  category: z.string().min(2),
  unit: z.string().min(1),
  total: z.number().int().min(0),
  reorderLevel: z.number().int().min(0),
  location: z.string().min(2),
  rental: z.boolean().optional(),
  rentalRate: z.number().int().min(0),
});

export const departmentSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  description: z.string().optional(),
  color: z.string().min(4),
  active: z.boolean().optional(),
});

export const eventBasicsSchema = z.object({
  title: z.string().trim().min(3, "Event title is required"),
  clientId: z.string().min(1, "Select a client"),
  typeId: z.string().min(1, "Select an event type"),
  coordinatorId: z.string().min(1, "Assign a coordinator"),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  status: z.enum(["Enquiry", "Planning", "Confirmed", "In Progress", "Completed", "Cancelled", "On Hold"]),
  venue: z.string().trim().min(2, "Venue is required"),
  city: z.string().trim().min(2, "City is required"),
  startDate: isoDate,
  endDate: isoDate,
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  guests: z.number().int().min(1, "At least 1 guest"),
  budget: z.number().int().min(0),
  description: z.string().optional(),
  logistics: z.string().optional(),
}).refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be on or after the start date" });

export const paymentSchema = z.object({
  amount: z.number().int().positive("Enter an amount"),
  method: z.enum(["Cash", "Bank Transfer", "UPI", "Cheque", "Card"]),
  date: isoDate,
  reference: z.string().optional(),
  note: z.string().optional(),
});
