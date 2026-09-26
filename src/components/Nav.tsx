"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/subjects", label: "Subjects" },
  { href: "/log", label: "Log" },
  { href: "/coming-up", label: "Homework & tests" },
  { href: "/mistakes", label: "Mistakes" },
  { href: "/week", label: "Week" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <nav className="nav">
      <div className="nav-inner">
        {LINKS.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={active ? "active" : undefined}>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
