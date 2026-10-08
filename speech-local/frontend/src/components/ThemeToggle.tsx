import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("forma-theme", theme);
  } catch {
    /* private mode */
  }
}

export function ThemeToggle({ onChange }: { onChange?: (theme: Theme) => void }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("forma-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      /* private mode */
    }
    return "dark";
  });

  useEffect(() => {
    applyTheme(theme);
    onChange?.(theme);
  }, [theme, onChange]);

  const pick = useCallback((next: Theme) => setTheme(next), []);

  return (
    <div
      className="flex items-center gap-1 rounded-full border border-border bg-card p-1"
      role="group"
      aria-label="Colour theme"
    >
      <button
        type="button"
        aria-label="Light mode"
        aria-pressed={theme === "light"}
        onClick={() => pick("light")}
        className={`grid h-8 w-9 place-items-center rounded-full transition-colors ${
          theme === "light" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Dark mode"
        aria-pressed={theme === "dark"}
        onClick={() => pick("dark")}
        className={`grid h-8 w-9 place-items-center rounded-full transition-colors ${
          theme === "dark" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Moon className="h-4 w-4" />
      </button>
    </div>
  );
}
