import { useEffect, useRef } from "react";
import { observeNearViewport } from "../utils/viewportVisibility.js";

/**
 * Adds a subtle, scroll-position-driven camera movement to an existing page
 * section. It deliberately owns only presentation: children, data, and click
 * behaviour remain exactly as supplied by the calling page.
 *
 * Performance: the scroll position is written straight to CSS variables on the
 * section element (no React state), so scrolling no longer re-renders this
 * component on every frame. Sections that are off-screen also pause their
 * decorative animations.
 */

// Camera values for a given scroll progress (0 → section below the screen, 1 → above it).
function getDepthVars(progress) {
  const centeredProgress = progress - 0.5;
  return {
    "--oc-scroll-tilt": `${centeredProgress * -12}deg`,
    "--oc-scroll-yaw": `${centeredProgress * 9}deg`,
    "--oc-scroll-lift": `${Math.sin(progress * Math.PI) * -18}px`,
    "--oc-scroll-card-lift": `${Math.sin(progress * Math.PI) * -10}px`,
    "--oc-scroll-card-depth": `${Math.sin(progress * Math.PI) * 34}px`,
    "--oc-scroll-card-rotate": `${centeredProgress * -4}deg`,
  };
}

const FLAT_VARS = {
  "--oc-scroll-tilt": "0deg",
  "--oc-scroll-yaw": "0deg",
  "--oc-scroll-lift": "0px",
  "--oc-scroll-card-lift": "0px",
  "--oc-scroll-card-depth": "0px",
  "--oc-scroll-card-rotate": "0deg",
};

export default function ScrollDepthSection({
  as: Tag = "section",
  className = "",
  depth,
  fixedOverlaySafe = false,
  children,
}) {
  const sectionRef = useRef(null);

  // Dashboard sections (depth="dashboard-*"), interactive pathways, and fixedOverlaySafe
  // sections must display perfectly flat and upright. Zeroing the tilt/yaw/rotate variables here
  // ensures the browser compositor never receives a non-zero 3D transform — preventing any slant
  // and ensuring mouse hit-testing and click handling are 100% accurate and responsive.
  const isFlat =
    (typeof depth === "string" && (depth.startsWith("dashboard-") || depth === "pathways")) ||
    Boolean(fixedOverlaySafe);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return undefined;

    let frameId = null;
    let previousProgress = -1;
    let listening = false;

    const applyProgress = (progress) => {
      const vars = getDepthVars(progress);
      for (const name in vars) element.style.setProperty(name, vars[name]);
    };

    const updateProgress = () => {
      frameId = null;
      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const travelDistance = viewportHeight + rect.height;
      const nextProgress = Math.max(0, Math.min(1, (viewportHeight - rect.top) / travelDistance));

      if (Math.abs(nextProgress - previousProgress) > 0.001) {
        previousProgress = nextProgress;
        applyProgress(nextProgress);
      }
    };

    const requestUpdate = () => {
      if (frameId === null) frameId = requestAnimationFrame(updateProgress);
    };

    const startListening = () => {
      if (listening) return;
      listening = true;
      window.addEventListener("scroll", requestUpdate, { passive: true });
      window.addEventListener("resize", requestUpdate);
    };

    const stopListening = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const animateOnScroll = !isFlat && !reducedMotion;

    // The scroll listener stays attached for the section's whole life (it is passive,
    // rAF-throttled and only writes to the DOM when the value really changes), so the section
    // is always at the right pose even after a big jump such as an anchor link or Page End.
    // Flat sections and reduced-motion users never move on scroll, so they never listen.
    if (animateOnScroll) {
      updateProgress();
      startListening();
    }

    // The viewport observer is only used to pause purely decorative animations while the
    // section is far off-screen.
    const stopObserving = observeNearViewport(element, (visible) => {
      if (visible) {
        delete element.dataset.ocOffscreen;
        if (animateOnScroll) updateProgress();
      } else {
        element.dataset.ocOffscreen = "true";
      }
    });

    return () => {
      stopObserving();
      stopListening();
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [isFlat]);

  // First paint uses the same values the component always started with (progress 0.5);
  // the effect above takes over from there without going through React again.
  const motionStyle = isFlat ? FLAT_VARS : getDepthVars(0.5);

  return (
    <Tag
      ref={sectionRef}
      className={`oc-scroll-depth-section ${className}`.trim()}
      data-depth={depth}
      data-fixed-overlay-safe={fixedOverlaySafe || undefined}
      style={motionStyle}
    >
      <div className="oc-scroll-depth-graphics" aria-hidden="true">
        <span className="oc-depth-orb oc-depth-orb-one" />
        <span className="oc-depth-orb oc-depth-orb-two" />
        <span className="oc-depth-grid" />
        <span className="oc-depth-shard oc-depth-shard-one" />
        <span className="oc-depth-shard oc-depth-shard-two" />
      </div>
      <div className="oc-scroll-depth-stage">{children}</div>
    </Tag>
  );
}
