import { ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const LOAD_ROOT_MARGIN = "240px";

export default function ExerciseThumbnail({
  active = false,
  alt,
  imageUrl,
  size = 56,
}) {
  const containerRef = useRef(null);
  const activeBackground =
    "color-mix(in srgb, var(--accent) 12%, var(--surface-raised))";

  const [shouldLoad, setShouldLoad] = useState(false);
  const [poster, setPoster] = useState({
    failed: false,
    imageUrl: "",
    url: "",
  });
  const posterUrl = poster.imageUrl === imageUrl ? poster.url : "";
  const posterFailed = poster.imageUrl === imageUrl && poster.failed;
  const displayUrl = posterUrl || (posterFailed ? imageUrl : "");

  useEffect(() => {
    setShouldLoad(false);

    if (!imageUrl) {
      return undefined;
    }

    const element = containerRef.current;

    if (!element || !("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: LOAD_ROOT_MARGIN,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [imageUrl]);

  useEffect(() => {
    let cancelled = false;

    if (!imageUrl || !shouldLoad) {
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
  }, [imageUrl, shouldLoad]);

  return (
    <span
      ref={containerRef}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        alignItems: "center",
        background: active ? activeBackground : "var(--surface-muted)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        display: "flex",
        flex: `0 0 ${size}px`,
        height: `${size}px`,
        justifyContent: "center",
        overflow: "hidden",
        userSelect: "none",
        WebkitTouchCallout: "none",
        width: `${size}px`,
      }}
    >
      {!imageUrl ? (
        <ImagePlus
          aria-label={alt}
          color="var(--text-muted)"
          role="img"
          size={Math.max(18, Math.round(size * 0.36))}
        />
      ) : !displayUrl ? (
        <span
          aria-label={alt}
          role="img"
          style={{
            background: posterFailed
              ? "linear-gradient(135deg, var(--surface-muted), var(--surface))"
              : active
              ? activeBackground
              : "var(--surface-muted)",
            display: "block",
            height: "100%",
            width: "100%",
          }}
        />
      ) : (
        <img
          alt={alt}
          draggable={false}
          loading="lazy"
          onContextMenu={(event) => event.preventDefault()}
          src={displayUrl}
          style={{
            display: "block",
            height: "100%",
            mixBlendMode: active ? "multiply" : undefined,
            objectFit: "contain",
            pointerEvents: "none",
            userSelect: "none",
            WebkitTouchCallout: "none",
            width: "100%",
          }}
        />
      )}
    </span>
  );
}
