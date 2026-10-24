import { Link } from "react-router";
import { cn } from "@/lib/utils";

/** The Engram mark: three memory traces converging on a node, on a signal-lime tile. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#d4ff3a" />
      <path d="M7.5 10.5c4 0 4 5.5 8 5.5M7.5 21.5c4 0 4-5.5 8-5.5M7.5 16h8" stroke="#0a0a09" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="21.5" cy="16" r="3.4" fill="#0a0a09" />
    </svg>
  );
}

export function Brand({ to = "/", className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn("group flex items-center gap-2.5", className)}>
      <Mark className="transition-transform duration-300 group-hover:-rotate-6" />
      <span className="font-display text-[19px] font-semibold tracking-[-0.03em]">engram</span>
    </Link>
  );
}
