import { Check, ChevronDown } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import "./select.css";

export interface SelectProps {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  /**
   * "anime" is the ink-and-sky look of the anime pages; "soft" is the rounded
   * look of the 书架 / 音乐 / 足迹 / 游戏库 pages and picks up their accent
   * through `--select-accent` and friends.
   */
  variant?: "anime" | "soft";
  /** "pill" matches a round search box; "field" matches a form input. */
  shape?: "pill" | "field";
}

/** Accessible custom listbox, so no page falls back to the native dropdown. */
export function Select({
  label,
  value,
  options,
  onChange,
  className = "",
  disabled = false,
  hideLabel = false,
  variant = "anime",
  shape = "field",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex(([optionValue]) => optionValue === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replaceAll(":", "");
  const labelId = `anime-select-label-${reactId}`;
  const valueId = `anime-select-value-${reactId}`;
  const listboxId = `anime-select-listbox-${reactId}`;

  useEffect(() => {
    if (!open) {
      return;
    }
    setActiveIndex(selectedIndex);
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open, selectedIndex]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option) {
      return;
    }
    onChange(option[0]);
    setOpen(false);
  };

  const handleKeys = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!open) {
        setOpen(true);
        setActiveIndex(selectedIndex);
        return;
      }
      setActiveIndex(
        (index) => (index + direction + options.length) % options.length,
      );
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        commit(activeIndex);
      } else {
        setOpen(true);
      }
      return;
    }
    if ((event.key === "Escape" || event.key === "Tab") && open) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      setOpen(false);
    }
  };

  const selectedLabel = options[selectedIndex]?.[1] ?? "请选择";

  return (
    <div
      className={[
        "anime-select",
        variant === "soft" ? `is-soft is-${shape}` : "",
        open ? "is-open" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      ref={rootRef}
    >
      <span
        className={hideLabel ? "anime-select-label sr-only" : "anime-select-label"}
        id={labelId}
      >
        {label}
      </span>
      <button
        className="anime-select-trigger"
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-activedescendant={
          open ? `${listboxId}-option-${activeIndex}` : undefined
        }
        disabled={disabled}
        onClick={() => setOpen((shown) => !shown)}
        onKeyDown={handleKeys}
      >
        <span id={valueId}>{selectedLabel}</span>
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      {open ? (
        <div className="anime-select-menu" id={listboxId} role="listbox">
          {options.map(([optionValue, optionLabel], index) => (
            <button
              className={[
                "anime-select-option",
                index === activeIndex ? "is-active" : "",
                optionValue === value ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              id={`${listboxId}-option-${index}`}
              key={optionValue}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={optionValue === value}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(index)}
            >
              <span>{optionLabel}</span>
              {optionValue === value ? (
                <Check aria-hidden="true" size={14} />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
