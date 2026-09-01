import AlphaOutlineIcon from "./AlphaOutlineIcon";

export default function PlansBrainIcon({
  active = true,
  className,
  color = "currentColor",
  emphasized = false,
  monochrome = false,
  size = 24,
}) {
  if (monochrome) {
    return (
      <AlphaOutlineIcon
        className={className}
        color={color}
        size={size}
        src="/plans-brain-icon.png"
        strokeExpansion={emphasized ? 8 : 0}
      />
    );
  }

  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      src="/plans-brain-icon.png"
      style={{
        display: "block",
        height: size,
        objectFit: "contain",
        opacity: active ? 1 : 0.58,
        width: size,
      }}
    />
  );
}
