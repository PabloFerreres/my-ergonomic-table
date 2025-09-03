import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";

export type DockMode = "none" | "search" | "quickFilter";

export interface FocusableToolHandle {
  focusInput: () => void;
}

export interface FunctionDockHandle {
  getMode: () => DockMode;
  showSearch: () => void;
  showQuickFilter: () => void;
  hide: () => void;
  focus: () => void;
}

interface FunctionDockProps {
  renderSearch?: (ref: React.Ref<FocusableToolHandle>) => React.ReactNode;
  renderQuickFilter?: (ref: React.Ref<FocusableToolHandle>) => React.ReactNode;
  defaultMode?: DockMode;
  onModeChange?: (mode: DockMode) => void;
  style?: React.CSSProperties;
  /** Automatisch fokussieren, wenn der Dock sichtbar wird (default: true) */
  autoFocusOnShow?: boolean;
}

const FunctionDock = forwardRef<FunctionDockHandle, FunctionDockProps>(
  (
    {
      renderSearch,
      renderQuickFilter,
      defaultMode = "none",
      onModeChange,
      style,
      autoFocusOnShow = true,
    },
    ref
  ) => {
    const [mode, setMode] = useState<DockMode>(defaultMode);

    const searchRef = useRef<FocusableToolHandle | null>(null);
    const quickFilterRef = useRef<FocusableToolHandle | null>(null);

    const setModeSafe = useCallback(
      (m: DockMode) => {
        setMode(m);
        onModeChange?.(m);
      },
      [onModeChange]
    );

    useImperativeHandle(
      ref,
      () => ({
        getMode: () => mode,
        showSearch: () => setModeSafe("search"),
        showQuickFilter: () => setModeSafe("quickFilter"),
        hide: () => setModeSafe("none"),
        focus: () => {
          if (mode === "search") searchRef.current?.focusInput();
          else if (mode === "quickFilter") quickFilterRef.current?.focusInput();
        },
      }),
      [mode, setModeSafe]
    );

    const searchRefCb = useCallback((inst: FocusableToolHandle | null) => {
      searchRef.current = inst;
    }, []);
    const quickRefCb = useCallback((inst: FocusableToolHandle | null) => {
      quickFilterRef.current = inst;
    }, []);

    // 🔧 Kernfix: nach Sichtbar-Schalten automatisch fokussieren (doppelte RAF, um HOTs Fokus zu überleben)
    useEffect(() => {
      if (!autoFocusOnShow || mode === "none") return;
      let f1 = 0;
      let f2 = 0;
      f1 = requestAnimationFrame(() => {
        f2 = requestAnimationFrame(() => {
          if (mode === "search") searchRef.current?.focusInput();
          else if (mode === "quickFilter") quickFilterRef.current?.focusInput();
        });
      });
      return () => {
        if (f1) cancelAnimationFrame(f1);
        if (f2) cancelAnimationFrame(f2);
      };
    }, [mode, autoFocusOnShow]);

    const content = useMemo(() => {
      if (mode === "search")
        return renderSearch ? renderSearch(searchRefCb) : null;
      if (mode === "quickFilter")
        return renderQuickFilter ? renderQuickFilter(quickRefCb) : null;
      return null;
    }, [mode, renderSearch, renderQuickFilter, searchRefCb, quickRefCb]);

    return (
      <div
        style={{
          display: mode === "none" ? "none" : "block",
          ...style,
        }}
      >
        {content}
      </div>
    );
  }
);

export default FunctionDock;
