/** The MANDATE mark: a check inside an open ring — authority that holds, with room to reopen. */
export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#12263A" />
      <path d="M25.6 12.2A10 10 0 1 0 26 16" stroke="#22D3EE" strokeWidth="3" strokeLinecap="round" />
      <path d="M11 16.2l3.4 3.4 6.8-7.2" stroke="#F4F7FA" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
