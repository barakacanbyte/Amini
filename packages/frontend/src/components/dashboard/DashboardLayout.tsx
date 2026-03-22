"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar, DashboardRole } from "@/components/dashboard/Sidebar";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Determine initial role from pathname
  const getInitialRole = (): DashboardRole => {
    if (pathname?.startsWith("/dashboard/admin")) return "admin";
    if (pathname?.startsWith("/dashboard/organization")) return "organization";
    return "donor";
  };

  const [role, setRole] = useState<DashboardRole>(getInitialRole());

  // Update role if pathname changes externally
  useEffect(() => {
    setRole(getInitialRole());
  }, [pathname]);

  const handleRoleChange = (newRole: DashboardRole) => {
    setRole(newRole);
    router.push(`/dashboard/${newRole}`);
  };

  return (
    <div className="flex h-screen w-full bg-[var(--ui-bg)] overflow-hidden">
      <Sidebar role={role} onRoleChange={handleRoleChange} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6 md:p-8 lg:p-10">
          {children}
        </div>
      </main>
    </div>
  );
}
