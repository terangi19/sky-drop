/** Inline SVG — parachute canopy + suspension lines + box. */
export function skyDropMarkEmailSvg(size = 44): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" style="vertical-align:middle;display:block;">
  <defs>
    <linearGradient id="em-canopy" x1="24" y1="5" x2="24" y2="19" gradientUnits="userSpaceOnUse">
      <stop stop-color="#7dd3fc" stop-opacity="0.5"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0.2"/>
    </linearGradient>
    <linearGradient id="em-brand" x1="10" y1="6" x2="38" y2="40" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0284c7"/><stop offset="1" stop-color="#6366f1"/>
    </linearGradient>
    <linearGradient id="em-box" x1="17" y1="28" x2="31" y2="38" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0284c7"/><stop offset="1" stop-color="#6366f1"/>
    </linearGradient>
  </defs>
  <path d="M8 17.5 C8 8.5 15.5 4.5 24 4.5 C32.5 4.5 40 8.5 40 17.5" fill="url(#em-canopy)" stroke="url(#em-brand)" stroke-width="2" stroke-linecap="round"/>
  <circle cx="24" cy="7.5" r="1.6" fill="none" stroke="#7dd3fc" stroke-width="0.9" opacity="0.9"/>
  <path d="M24 8.5 L11 17" stroke="#7dd3fc" stroke-width="0.7" stroke-linecap="round" opacity="0.45"/>
  <path d="M24 8.5 L17 11.5" stroke="#7dd3fc" stroke-width="0.7" stroke-linecap="round" opacity="0.35"/>
  <path d="M24 8.5 L24 17" stroke="#7dd3fc" stroke-width="0.7" stroke-linecap="round" opacity="0.4"/>
  <path d="M24 8.5 L31 11.5" stroke="#7dd3fc" stroke-width="0.7" stroke-linecap="round" opacity="0.35"/>
  <path d="M24 8.5 L37 17" stroke="#7dd3fc" stroke-width="0.7" stroke-linecap="round" opacity="0.45"/>
  <line x1="11" y1="17.2" x2="18.5" y2="27.5" stroke="url(#em-brand)" stroke-width="1" stroke-linecap="round" opacity="0.75"/>
  <line x1="17" y1="17.2" x2="18.5" y2="27.5" stroke="url(#em-brand)" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
  <line x1="24" y1="17.2" x2="24" y2="27.5" stroke="url(#em-brand)" stroke-width="1" stroke-linecap="round" opacity="0.85"/>
  <line x1="31" y1="17.2" x2="29.5" y2="27.5" stroke="url(#em-brand)" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
  <line x1="37" y1="17.2" x2="29.5" y2="27.5" stroke="url(#em-brand)" stroke-width="1" stroke-linecap="round" opacity="0.75"/>
  <rect x="17" y="27.5" width="14" height="10" rx="1.8" fill="url(#em-box)"/>
  <path d="M17 30 H31" stroke="white" stroke-opacity="0.35" stroke-width="1" stroke-linecap="round"/>
  <circle cx="24" cy="40" r="1.1" fill="#0284c7" opacity="0.55"/>
  <circle cx="24" cy="42.2" r="0.75" fill="#7c3aed" opacity="0.4"/>
</svg>`;
}
