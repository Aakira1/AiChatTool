import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children in a React portal positioned relative to an anchor element,
 * escaping every parent stacking context (backdrop-filter, transform, opacity…).
 *
 * Use when a popover must visually sit above other UI but its DOM parent has
 * styling (filter / backdrop-filter / transform) that pins it to a lower
 * compositor layer regardless of z-index.
 *
 * Props:
 *  - anchorRef: ref to the trigger element used as positioning origin
 *  - open: whether the popover is mounted
 *  - placement: "below" (default) | "above"
 *  - align: "end" (default — right-edge aligned) | "start" (left-edge aligned)
 *  - offset: gap in px between anchor and popover (default 8)
 *  - onClose: called when the user clicks outside the popover or the anchor
 *  - className: extra class on the portal container
 *  - width: optional fixed width; otherwise content drives it
 */
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
  const [coords, setCoords] = useState(null);

  // Position the popover from the anchor's viewport rect. Recompute on resize +
  // scroll so it stays glued to the anchor while the user interacts.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const compute = () => {
      const anchor = anchorRef?.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const next = {
        top: placement === "above" ? null : r.bottom + offset,
        bottom: placement === "above" ? window.innerHeight - r.top + offset : null,
        left: align === "start" ? r.left : null,
        right: align === "end" ? window.innerWidth - r.right : null,
      };
      setCoords(next);
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open, anchorRef, placement, align, offset]);

  // Click-outside (ignores the anchor — the parent owns toggle behaviour).
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

  if (!open || !coords) return null;

  // Clamp into viewport. Picker may be wider than the side panel — keep it
  // inside the visible area with a margin so the right edge isn't clipped.
  const style = {
    position: "fixed",
    zIndex: 2147483647,
    ...(coords.top != null ? { top: coords.top } : {}),
    ...(coords.bottom != null ? { bottom: coords.bottom } : {}),
    ...(coords.left != null ? { left: Math.max(8, coords.left) } : {}),
    ...(coords.right != null ? { right: Math.max(8, coords.right) } : {}),
    ...(width ? { width } : {}),
    maxWidth: "calc(100vw - 16px)",
  };

  return createPortal(
    <div ref={popRef} className={`cia-ext-portal-popover ${className}`} style={style}>
      {children}
    </div>,
    document.body,
  );
}
