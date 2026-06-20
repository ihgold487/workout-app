import { useEffect, useState } from "react";

export default function ExerciseThumbnail({
  alt,
  imageUrl,
  size = 56,
}) {
  const [poster, setPoster] = useState({
    failed: false,
    imageUrl: "",
    url: "",
  });
  const posterUrl = poster.imageUrl === imageUrl ? poster.url : "";
  const posterFailed = poster.imageUrl === imageUrl && poster.failed;
  const displayUrl = posterUrl || (posterFailed ? imageUrl : "");

  useEffect(() => {
    let cancelled = false;

    if (!imageUrl) {
      return undefined;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) {
        return;
      }

      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        setPoster({
          failed: false,
          imageUrl,
          url: canvas.toDataURL("image/webp", 0.82),
        });
      } catch (error) {
        console.error("Failed to create exercise image poster:", error);
        setPoster({
          failed: true,
          imageUrl,
          url: "",
        });
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        setPoster({
          failed: true,
          imageUrl,
          url: "",
        });
      }
    };
    image.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  if (!imageUrl) {
    return null;
  }

  return (
    <span
      style={{
        alignItems: "center",
        background: "var(--surface-muted)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        display: "flex",
        flex: `0 0 ${size}px`,
        height: `${size}px`,
        justifyContent: "center",
        overflow: "hidden",
        width: `${size}px`,
      }}
    >
      {!displayUrl ? (
        <span
          aria-label={alt}
          role="img"
          style={{
            background: posterFailed
              ? "linear-gradient(135deg, var(--surface-muted), var(--surface))"
              : "var(--surface-muted)",
            display: "block",
            height: "100%",
            width: "100%",
          }}
        />
      ) : (
        <img
          alt={alt}
          src={displayUrl}
          style={{
            display: "block",
            height: "100%",
            objectFit: "contain",
            width: "100%",
          }}
        />
      )}
    </span>
  );
}
