// SealHour mark: a wax seal pressed with a clock dial on the hour. Geometry from scripts/brand.mjs (logo-mark.json),
// the same source as app/icon.svg and the favicons. Size follows font-size (1em).
import mark from "./logo-mark.json";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width="1em" height="1em" className={className} aria-hidden="true" focusable="false">
      <path fill="#465dff" d={mark.seal} />
      <circle cx={mark.face.cx} cy={mark.face.cy} r={mark.face.r} fill="#fff" />
      <path d={mark.hand} fill="none" stroke="#465dff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
