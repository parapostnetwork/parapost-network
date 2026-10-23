export function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18" cy="12" r="1.8" />
    </svg>
  );
}

export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path
        d="M12 20.5C12 20.5 4 15.2 4 9.5C4 6.462 6.462 4 9.5 4C11.243 4 12.798 4.811 13.8 6.076C14.802 4.811 16.357 4 18.1 4C21.138 4 23.6 6.462 23.6 9.5C23.6 15.2 15.6 20.5 15.6 20.5H12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CommentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 17L4 20V6C4 4.895 4.895 4 6 4H18C19.105 4 20 4.895 20 6V15C20 16.105 19.105 17 18 17H7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 4.75L3.85 11.95C3.05 12.29 3.07 13.45 3.88 13.76L10.05 16.05L12.34 22.12C12.65 22.93 13.81 22.95 14.15 22.15L21 4.75Z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
    </svg>
  );
}
