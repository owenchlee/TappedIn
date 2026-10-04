import { clsx } from "clsx";

/**
 * The TappedIn mark: a solid 3D T seen from above. Black tile in light mode, white in dark (tokens in
 * globals.css). app/icon.svg is the standalone copy for the browser tab.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={clsx("shrink-0", className)}>
      <rect width="64" height="64" rx="15" fill="var(--logo-tile)" />
      <path d="M33 29l7-5v25l-7 5z" fill="var(--logo-side)" />
      <path d="M12 19h32l7-5H19z" fill="var(--logo-top)" />
      <path d="M44 19l7-5v10l-7 5z" fill="var(--logo-side)" />
      <path d="M12 19h32v10H33v25H23V29H12z" fill="var(--logo-face)" />
    </svg>
  );
}
