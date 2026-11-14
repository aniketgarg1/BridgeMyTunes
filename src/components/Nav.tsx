"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "share" },
  { href: "/switch", label: "switch" },
  { href: "/transfers", label: "transfers" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((l) => {
        const current = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={current ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
