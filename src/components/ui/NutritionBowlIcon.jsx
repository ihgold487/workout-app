export default function NutritionBowlIcon({
  className,
  detailed = false,
  size = 24,
  strokeWidth = 2,
  ...props
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="2.5 6.25 19 15"
      width={size}
      {...props}
    >
      {detailed ? (
        <>
          <path
            d="M3.4 12.4h17.2c-.35 4.95-3.55 8-8.6 8s-8.25-3.05-8.6-8Z"
            fill="color-mix(in srgb, var(--accent) 10%, var(--surface-raised))"
          />
          <path
            d="M4.4 11.7c.05-2.35 1.7-4.15 3.9-4.15 1.72 0 3.14 1.03 3.7 2.55"
            stroke="color-mix(in srgb, var(--accent) 48%, currentColor)"
          />
          <circle
            cx="6.25"
            cy="9.15"
            fill="color-mix(in srgb, var(--accent) 24%, var(--surface-raised))"
            r=".72"
          />
          <circle
            cx="8.35"
            cy="8.35"
            fill="color-mix(in srgb, var(--accent) 24%, var(--surface-raised))"
            r=".65"
          />
          <path
            d="m12.2 10.7 2.4-2.75c.78-.9 2.12-.98 3-.2.88.79.96 2.13.17 3.02l-1.25 1.42"
            stroke="color-mix(in srgb, #00866f 72%, currentColor)"
          />
          <path
            d="m17.32 7.93.62-.69m.18 1.58.74-.82"
            stroke="color-mix(in srgb, #00866f 72%, currentColor)"
          />
        </>
      ) : (
        <path d="M5.2 11.5c.35-2.2 1.9-3.6 3.85-3.6 1.6 0 2.92.86 3.62 2.2m1.1 1.4 2.65-3.05m.52-.6.65-.75" />
      )}

      <path d="M3.4 12.4h17.2c-.35 4.95-3.55 8-8.6 8s-8.25-3.05-8.6-8Z" />
      <path d="M4.15 15.1h15.7M8.55 20.05h6.9" />
    </svg>
  );
}
