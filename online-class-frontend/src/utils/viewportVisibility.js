/**
 * Calls `onChange(true|false)` whenever `element` enters / leaves the viewport (plus a
 * small margin so work can start just before it becomes visible).
 *
 * Scroll-driven sections use this to attach their scroll listener only while they are on
 * screen, and to pause purely decorative animations while they are not. Browsers without
 * IntersectionObserver simply behave as "always visible", i.e. exactly as before.
 *
 * Returns a cleanup function.
 */
export function observeNearViewport(element, onChange, rootMargin = "150px 0px") {
  if (!element || typeof IntersectionObserver === "undefined") {
    onChange(true);
    return () => {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      const latest = entries[entries.length - 1];
      onChange(Boolean(latest && latest.isIntersecting));
    },
    { rootMargin }
  );
  observer.observe(element);
  return () => observer.disconnect();
}