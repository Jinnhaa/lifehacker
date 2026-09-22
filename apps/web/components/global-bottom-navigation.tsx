"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const overviewItems = [
  { label: "Home", href: "/", icon: "/assets/lifehacker/nav-home.png" },
  { label: "Plan", href: "/work", icon: "/assets/lifehacker/nav-plan.png" },
  { label: "Learning", href: "/learning", icon: "/assets/lifehacker/nav-learning.png" },
  { label: "Projects", href: "/projects", icon: "/assets/lifehacker/nav-projects.png" },
  { label: "Settings", href: "/settings", icon: "/assets/lifehacker/nav-settings.png" }
] as const;

export function GlobalBottomNavigation() {
  const pathname = usePathname();
  if (!overviewItems.some((item) => item.href === pathname)) return null;

  return <nav className="game-dock global-game-dock" aria-label="주요 탐색">
    {overviewItems.map((item) => <Link className={pathname === item.href ? "active" : ""} href={item.href} key={item.href} aria-current={pathname === item.href ? "page" : undefined}>
      <img className="global-nav-icon" src={item.icon} alt="" />
      <span>{item.label}</span>
    </Link>)}
  </nav>;
}
