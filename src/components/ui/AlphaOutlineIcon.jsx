/* global __IS_NATIVE_BUILD__ */
export default function AlphaOutlineIcon({
  className,
  color = "currentColor",
  size = 24,
  src,
  strokeExpansion = 0,
}) {
  const resolvedSrc = __IS_NATIVE_BUILD__
    ? src
    : `${import.meta.env.BASE_URL}${src.replace(/^\/+/, "")}`;
  const expansion = (strokeExpansion / 512) * size;
  const expansionOffsets =
    expansion > 0
      ? [
          [-expansion, 0],
          [expansion, 0],
          [0, -expansion],
          [0, expansion],
          [-expansion * 0.7, -expansion * 0.7],
          [expansion * 0.7, -expansion * 0.7],
          [-expansion * 0.7, expansion * 0.7],
          [expansion * 0.7, expansion * 0.7],
        ]
      : [];
  const maskStyle = {
    backgroundColor: color,
    inset: 0,
    maskImage: `url("${resolvedSrc}")`,
    maskPosition: "center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
    position: "absolute",
    WebkitMaskImage: `url("${resolvedSrc}")`,
    WebkitMaskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
  };

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-block",
        flexShrink: 0,
        height: size,
        lineHeight: 0,
        position: "relative",
        width: size,
      }}
    >
      {expansionOffsets.map(([x, y]) => (
        <span
          key={`${x}:${y}`}
          style={{
            ...maskStyle,
            transform: `translate(${x}px, ${y}px)`,
          }}
        />
      ))}
      <span
        style={maskStyle}
      />
    </span>
  );
}
