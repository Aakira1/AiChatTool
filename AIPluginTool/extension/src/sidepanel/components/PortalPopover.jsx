import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

export function PortalPopover({
  anchorRef,
  open,
  placement = "below",
  align = "end",
  offset = 8,
  onClose,
  className = "",
  width,
  children,
}) {
  const popRef = useRef(null);
  const [style, setStyle] = useState(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef?.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;

    const r = anchor.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const vw = window.innerWidth;
    const m = 8;

    let top = placement === "above" ? null : r.bottom + offset;
    let bottom = placement === "above" ? window.innerHeight - r.top + offset : null;

    let left;
    if (align === "start") {
      left = r.left;
    } else {
      left = r.right - popRect.width;
    }
    left = Math.max(m, Math.min(left, vw - popRect.width - m));

    setStyle({
      position: "fixed",
      zIndex: 2147483647,
      ...(top != null ? { top } : {}),
      ...(bottom != null ? { bottom } : {}),
      left,
      ...(width ? { width } : {}),
      maxWidth: `calc(100vw - ${m * 2}px)`,
    });
  }, [anchorRef, placement, align, offset, width]);

  useLayoutEffect(() => {
    if (!open) { setStyle(null); return; }
    requestAnimationFrame(reposition);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open || !onClose) return undefined;
    const onDoc = (e) => {
      const anchor = anchorRef?.current;
      if (anchor && anchor.contains(e.target)) return;
      if (popRef.current && popRef.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={(el) => {
        popRef.current = el;
        if (el && !style) requestAnimationFrame(reposition);
      }}
      className={`cia-ext-portal-popover ${className}`}
      style={style ?? { position: "fixed", visibility: "hidden", zIndex: 2147483647 }}
    >
      {children}
    </div>,
    document.body,
  );
}
