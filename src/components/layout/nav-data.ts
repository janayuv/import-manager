import {
  Users,
  Ship,
  FileText,
  Package,
  Landmark,
  CircleDollarSign,
  BarChart3,
  LayoutDashboard
} from "lucide-react";

export const navItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Supplier",
    url: "/supplier",
    icon: Users,
  },
  {
    title: "Shipment",
    url: "/shipment",
    icon: Ship,
  },
  {
    title: "Invoice",
    url: "/invoice",
    icon: FileText,
  },
  {
    title: "Item Master",
    url: "/item-master",
    icon: Package,
  },
  {
    title: "BOE",
    url: "/boe",
    icon: Landmark,
    items: [
        { title: "View All BOE", url: "/boe" },
        { title: "BOE Entry", url: "/boe-entry" },
        { title: "BOE Summary", url: "/boe-summary" },
    ]
  },
  {
    title: "Expenses",
    url: "/expenses",
    icon: CircleDollarSign,
  },
  {
    title: "Report",
    url: "/report",
    icon: BarChart3,
  },
];
