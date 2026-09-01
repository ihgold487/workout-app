import { useId } from "react";

export default function AlphaOutlineIcon({
  className,
  color = "currentColor",
  size = 24,
  src,
  strokeExpansion = 0,
}) {
  const filterId = `alpha-outline-${useId().replaceAll(":", "")}`;

  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 512 512"
      width={size}
    >
      <defs>
        <filter
          colorInterpolationFilters="sRGB"
          height="120%"
          id={filterId}
          width="120%"
          x="-10%"
          y="-10%"
        >
          <feMorphology
            in="SourceAlpha"
            operator="dilate"
            radius={strokeExpansion}
            result="expanded"
          />
          <feFlood floodColor={color} result="color" />
          <feComposite in="color" in2="expanded" operator="in" />
        </filter>
      </defs>
      <image
        filter={`url(#${filterId})`}
        height="512"
        href={src}
        preserveAspectRatio="xMidYMid meet"
        width="512"
      />
    </svg>
  );
}
