"use client";

import Link from "next/link";

export const overviewItems = [
  { label: "홈", href: "/", icon: "/assets/lifehacker/nav-home.png" },
  { label: "플랜", href: "/work", icon: "/assets/lifehacker/nav-plan.png" },
  { label: "학습", href: "/learning", icon: "/assets/lifehacker/nav-learning.png" },
  { label: "프로젝트", href: "/projects", icon: "/assets/lifehacker/nav-projects.png" },
  { label: "설정", href: "/settings", icon: "/assets/lifehacker/nav-settings.png" }
] as const;

export const isOverviewPath = (pathname: string): boolean => overviewItems.some((item) => item.href === pathname);

export function GlobalBottomNavigation({ pathname }: { readonly pathname: string }) {
  return <nav className="game-dock" aria-label="주요 탐색">
    {overviewItems.map((item) => <Link className={`game-dock-item${pathname === item.href ? " active" : ""}`} href={item.href} key={item.href} aria-current={pathname === item.href ? "page" : undefined}>
      <img className="game-dock-icon" src={item.icon} alt="" />
      <span className="game-dock-label">{item.label}</span>
    </Link>)}
  </nav>;
}
