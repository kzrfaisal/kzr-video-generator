export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      suppressHydrationWarning
    >
      <path
        d="M12.25 9.5v21M13 20l13-10.5M13 20l13 10.5"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m20.2 15.2 8.15 4.8-8.15 4.8Z" fill="currentColor" />
    </svg>
  );
}
