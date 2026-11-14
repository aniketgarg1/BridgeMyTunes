"use client";
import { useRef } from "react";
import { serviceName } from "@/components/ConnectButton";
import { ServiceLogo } from "@/components/ServiceLogo";
import type { Platform } from "@/lib/types";

/**
 * A segmented radio group of music apps with a sliding thumb. Arrow keys move the choice (roving tabindex).
 * The thumb slides with transform only; the chosen app also sets data-app on the group for brand accents.
 */
export function AppSwitch({
  options,
  value,
  onChange,
  label = "Your app",
  disabled = false,
}: {
  options: Platform[];
  value: Platform;
  onChange: (p: Platform) => void;
  label?: string;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.indexOf(value));
  const move = (d: number) => {
    const next = (index + d + options.length) % options.length;
    onChange(options[next]);
    refs.current[next]?.focus();
  };
  return (
    <div
      className="appswitch"
      role="radiogroup"
      aria-label={label}
      data-app={value}
      style={{ "--n": options.length, "--s": index } as React.CSSProperties}
    >
      <span className="appswitch__thumb" aria-hidden="true" />
      {options.map((p, i) => (
        <button
          key={p}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={p === value}
          tabIndex={p === value ? 0 : -1}
          disabled={disabled}
          className="appswitch__opt"
          onClick={() => onChange(p)}
          onKeyDown={(e) => {
            const d = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
            if (!d) return;
            e.preventDefault();
            move(d);
          }}
        >
          <ServiceLogo platform={p} size={20} />
          <span>{serviceName(p)}</span>
        </button>
      ))}
    </div>
  );
}
