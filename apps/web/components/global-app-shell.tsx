"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { GlobalBottomNavigation, isOverviewPath } from "./global-bottom-navigation";

export function GlobalAppShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const showGlobalChrome = isOverviewPath(pathname);

  return <>
    <div className={showGlobalChrome ? "global-shell-content" : undefined}>{children}</div>
    {showGlobalChrome && <GlobalBottomNavigation pathname={pathname} />}
  </>;
}
