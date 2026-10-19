import {
  Bell, Boxes, Briefcase, CalendarDays, CheckSquare, FileText, Funnel, LayoutDashboard, Network, Receipt, Settings, ShoppingCart, Store, Users, Wallet, BarChart3, FileSignature,
  type LucideIcon,
} from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  { label: "Clients", items: [{ href: "/clients", label: "Clients", icon: Users }, { href: "/leads", label: "Leads", icon: Funnel }] },
  {
    label: "Operations", items: [
      { href: "/events", label: "Events", icon: Briefcase }, { href: "/calendar", label: "Calendar", icon: CalendarDays }, { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/departments", label: "Departments", icon: Network }, { href: "/inventory", label: "Inventory", icon: Boxes },
    ],
  },
  { label: "Vendors", items: [{ href: "/vendors", label: "Vendors", icon: Store }, { href: "/procurement", label: "Work orders", icon: ShoppingCart }] },
  { label: "Sales & finance", items: [{ href: "/quotations", label: "Quotations", icon: FileSignature }, { href: "/invoices", label: "Invoices & payments", icon: Receipt }, { href: "/finance", label: "Finance", icon: Wallet }] },
  { label: "Insights", items: [{ href: "/reports", label: "Reports", icon: BarChart3 }, { href: "/documents", label: "Documents", icon: FileText }] },
  { label: "System", items: [{ href: "/notifications", label: "Notifications", icon: Bell }, { href: "/settings", label: "Settings", icon: Settings }] },
];

export const MOBILE_PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard }, { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/events", label: "Events", icon: Briefcase },
];
