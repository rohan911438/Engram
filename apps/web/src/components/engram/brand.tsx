import { Link } from "react-router";
import { cn } from "@/lib/utils";

/** The Engram mark: three memory traces converging on a node. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <defs>
        <linearGradient id="engram-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="#0b0b10" stroke="url(#engram-g)" strokeOpacity="0.5" />
      <path d="M8 10.5c4 0 4 5.5 8 5.5M8 21.5c4 0 4-5.5 8-5.5M8 16h8" stroke="url(#engram-g)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="21.5" cy="16" r="3.2" fill="url(#engram-g)" />
      <circle cx="21.5" cy="16" r="6" fill="none" stroke="url(#engram-g)" strokeOpacity="0.35" />
    </svg>
  );
}

export function Brand({ to = "/", className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn("flex items-center gap-2.5", className)}>
      <Mark />
      <span className="text-[15px] font-semibold tracking-tight">engram</span>
    </Link>
  );
}
