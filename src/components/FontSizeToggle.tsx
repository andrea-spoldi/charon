import { useEffect, useState } from "react";

export type FontSize = "small" | "medium" | "large";

const FONT_SIZE_KEY = "charon-font-size";

const FONT_SIZES: Record<FontSize, string> = {
  small: "13px",
  medium: "15px",
  large: "17px",
};

function applyFontSize(size: FontSize) {
  document.documentElement.style.setProperty("--font-size-base", FONT_SIZES[size]);
}

export function useFontSize() {
  const [fontSize, setFontSize] = useState<FontSize>(() => {
    const stored = localStorage.getItem(FONT_SIZE_KEY);
    return (stored as FontSize) || "small";
  });

  useEffect(() => {
    localStorage.setItem(FONT_SIZE_KEY, fontSize);
    applyFontSize(fontSize);
  }, [fontSize]);

  // Apply on mount
  useEffect(() => {
    applyFontSize(fontSize);
  }, []);

  return { fontSize, setFontSize };
}

interface FontSizeToggleProps {
  fontSize: FontSize;
  onChange: (size: FontSize) => void;
}

const sizes: { key: FontSize; label: string }[] = [
  { key: "small", label: "A" },
  { key: "medium", label: "A" },
  { key: "large", label: "A" },
];

export function FontSizeToggle({ fontSize, onChange }: FontSizeToggleProps) {
  return (
    <div className="font-size-toggle" title="Text size">
      {sizes.map(({ key, label }) => (
        <button
          key={key}
          className={`font-size-btn font-size-${key}${fontSize === key ? " font-size-active" : ""}`}
          onClick={() => onChange(key)}
          aria-label={`${key} text size`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
