import { NavLink, useLocation } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  items?: Omit<NavItem, 'icon' | 'items'>[];
}

export function NavMain({ items }: { items: NavItem[] }) {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;
  const isGroupActive = (path: string, subItems?: Omit<NavItem, 'icon' | 'items'>[]) => {
      if (!subItems) return false;
      // Check if the current path starts with the parent path, or if any sub-item is active
      return location.pathname.startsWith(path) || subItems.some(item => location.pathname === item.url);
  }

  return (
    <SidebarMenu>
      {items.map((item) =>
        item.items && item.items.length > 0 ? (
          // Render as a collapsible menu item if it has sub-items
          <Collapsible
            key={item.title}
            asChild
            defaultOpen={isGroupActive(item.url, item.items)}
          >
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                isActive={isGroupActive(item.url, item.items)}
              >
                <NavLink to={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </NavLink>
              </SidebarMenuButton>

              <CollapsibleTrigger asChild>
                {/* UPDATED: Added classes to make the trigger smaller and remove button styles */}
                <SidebarMenuAction className="data-[state=open]:rotate-90 size-5 p-0 bg-transparent hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0">
                  <ChevronRight className="size-4" />
                  <span className="sr-only">Toggle</span>
                </SidebarMenuAction>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <SidebarMenuSub>
                  {item.items.map((subItem) => (
                    <SidebarMenuSubItem key={subItem.title}>
                      <SidebarMenuSubButton asChild isActive={isActive(subItem.url)}>
                        <NavLink to={subItem.url}>{subItem.title}</NavLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        ) : (
          // Render as a simple menu item if it has no sub-items
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              asChild
              tooltip={item.title}
              isActive={isActive(item.url)}
            >
              <NavLink to={item.url}>
                <item.icon />
                <span>{item.title}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      )}
    </SidebarMenu>
  );
}
