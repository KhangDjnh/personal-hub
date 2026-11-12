import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme.ts';

export function ThemeToggle() {
  const { resolvedScheme, toggleTheme } = useTheme();
  const nextLabel =
    resolvedScheme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';

  return (
    <button
      type="button"
      className="btn theme-toggle"
      onClick={toggleTheme}
      aria-label={nextLabel}
      title={nextLabel}
    >
      <span className="theme-opt-dark">
        <Moon size={16} aria-hidden="true" />
        <span className="visually-hidden">Chuyển sang giao diện tối</span>
      </span>
      <span className="theme-opt-light">
        <Sun size={16} aria-hidden="true" />
        <span className="visually-hidden">Chuyển sang giao diện sáng</span>
      </span>
    </button>
  );
}

