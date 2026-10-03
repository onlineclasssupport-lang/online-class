import { useEffect, useRef, useState } from "react";
import { observeNearViewport } from "../utils/viewportVisibility.js";

/**
 * EducationScrollScene
 * ------------------------------------------------------------------
 * A self-contained, education-themed 3D scroll animation.
 * A ring of academic icons (graduation cap, book, lightbulb, laptop,
 * calculator, award) orbits a glowing core in 3D space. The whole
 * scene tilts and spins as the user scrolls the section through the
 * viewport, driven purely by scroll position (no extra libraries).
 *
 * This component is additive — it does not modify any existing
 * component, route, or style. It only needs to be dropped into a
 * page inside a container that has "position-relative" ancestry,
 * which HomePage already provides.
 * ------------------------------------------------------------------
 */

const EDU_ORBIT_ITEMS = [
  { icon: "bi-mortarboard-fill", label: "Graduate", color: "#38bdf8" },
  { icon: "bi-book-half", label: "Study", color: "#a78bfa" },
  { icon: "bi-lightbulb-fill", label: "Ideas", color: "#fbbf24" },
  { icon: "bi-laptop", label: "Code", color: "#34d399" },
  { icon: "bi-calculator-fill", label: "Logic", color: "#fb923c" },
  { icon: "bi-award-fill", label: "Achieve", color: "#f472b6" },
];

const ORBIT_RADIUS = 222;

// Pure helpers so the very same maths drives both the first render and the
// per-frame DOM updates below (which bypass React for smooth scrolling).
function getStageTransform(progress) {
  const stageTiltX = (progress - 0.5) * -18;
  const stageTiltY = (progress - 0.5) * 30;
  const sceneLift = Math.sin(progress * Math.PI) * 18;
  return `translateY(${-sceneLift}px) rotateX(${stageTiltX}deg) rotateY(${stageTiltY}deg)`;
}

function getCoreTransform(progress) {
  return `translateZ(10px) rotateY(${progress * 420}deg)`;
}

function getCardMotion(idx, progress) {
  const baseAngle = (idx / EDU_ORBIT_ITEMS.length) * 360;
  const angle = baseAngle + progress * 420;
  const rad = (angle * Math.PI) / 180;
  const radius = ORBIT_RADIUS;
  const x = Math.sin(rad) * radius;
  const z = Math.cos(rad) * radius;
  const depthRatio = (z + radius) / (radius * 2); // 0 (far) -> 1 (near)
  const scale = 0.72 + depthRatio * 0.5;
  const opacity = 0.32 + depthRatio * 0.68;
  const bob = Math.cos(rad * 2 + idx) * 16;
  return {
    transform: `translate3d(${x}px, ${bob}px, ${z}px) rotateY(${-angle}deg) scale(${scale})`,
    opacity,
    zIndex: Math.round(z + radius),
  };
}

export default function EducationScrollScene() {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const coreRef = useRef(null);
  const meterRef = useRef(null);
  const cardRefs = useRef([]);
  // Only used for the first render and for reduced-motion users; scrolling itself
  // never touches React state any more.
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setProgress(0.5);
      return undefined;
    }

    let rafId = null;
    let lastProgress = -1;
    let listening = false;

    const applyProgress = (p) => {
      if (stageRef.current) stageRef.current.style.transform = getStageTransform(p);
      if (coreRef.current) coreRef.current.style.transform = getCoreTransform(p);
      if (meterRef.current) meterRef.current.style.setProperty("--scroll-progress", String(p));
      cardRefs.current.forEach((card, idx) => {
        if (!card) return;
        const motion = getCardMotion(idx, p);
        card.style.transform = motion.transform;
        card.style.opacity = String(motion.opacity);
        card.style.zIndex = String(motion.zIndex);
      });
    };

    const computeProgress = () => {
      rafId = null;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const total = rect.height + viewportHeight;
      const traveled = viewportHeight - rect.top;
      let p = total > 0 ? traveled / total : 0;
      if (p < 0) p = 0;
      if (p > 1) p = 1;
      // Avoid updating for imperceptibly small scroll changes while keeping
      // the movement closely tied to the reader's position on the page.
      if (Math.abs(p - lastProgress) > 0.001) {
        lastProgress = p;
        applyProgress(p);
      }
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(computeProgress);
    };

    const startListening = () => {
      if (listening) return;
      listening = true;
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    };

    const stopListening = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };

    // The scroll listener stays attached for the section's whole life (passive, rAF-throttled,
    // and it only touches the DOM when the value really changes), so the scene is at the right
    // pose even after a big jump such as an anchor link or Page End.
    computeProgress();
    startListening();

    // The viewport observer is only used to pause the decorative twinkle / halo animations
    // while the section is far off-screen.
    const stopObserving = observeNearViewport(sectionRef.current, (visible) => {
      if (!sectionRef.current) return;
      if (visible) {
        delete sectionRef.current.dataset.ocOffscreen;
        computeProgress();
      } else {
        sectionRef.current.dataset.ocOffscreen = "true";
      }
    });

    return () => {
      stopObserving();
      stopListening();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="oc-3d-edu-section position-relative overflow-hidden py-5 py-lg-6"
      aria-label="Interactive 3D learning showcase"
    >
      <div className="oc-3d-edu-glow oc-3d-edu-glow-a" />
      <div className="oc-3d-edu-glow oc-3d-edu-glow-b" />
      <div className="oc-hero-grid-pattern" />
      <div className="oc-3d-edu-stars" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => (
          <span key={index} />
        ))}
      </div>

      <div className="container position-relative">
        <div className="text-center mb-5">
          <span className="oc-section-eyebrow text-cyan">
            <i className="bi bi-stars me-1" /> Immersive Learning
          </span>
          <h2 className="oc-section-title text-white">Knowledge That Moves With You</h2>
          <p className="oc-3d-edu-subtitle mx-auto">
            Scroll through the page and watch core academic concepts orbit through your learning universe —
            a simple reminder that every subject here connects to the next.
          </p>
        </div>

        <div className="oc-3d-scene" role="presentation">
          <div className="oc-3d-scene-halo oc-3d-scene-halo-outer" />
          <div className="oc-3d-scene-halo oc-3d-scene-halo-inner" />
          <div
            ref={meterRef}
            className="oc-3d-scroll-meter"
            style={{ "--scroll-progress": progress }}
            aria-hidden="true"
          >
            <span />
          </div>
          <div
            ref={stageRef}
            className="oc-3d-stage"
            style={{ transform: getStageTransform(progress) }}
          >
            <div className="oc-3d-orbit oc-3d-orbit-one" />
            <div className="oc-3d-orbit oc-3d-orbit-two" />
            <div className="oc-3d-orbit oc-3d-orbit-three" />
            {EDU_ORBIT_ITEMS.map((item, idx) => {
              const motion = getCardMotion(idx, progress);

              return (
                <div
                  key={item.icon}
                  ref={(node) => {
                    cardRefs.current[idx] = node;
                  }}
                  className="oc-3d-icon-card"
                  style={{
                    transform: motion.transform,
                    opacity: motion.opacity,
                    borderColor: item.color,
                    boxShadow: `0 0 30px ${item.color}4d`,
                    zIndex: motion.zIndex,
                  }}
                >
                  <i className={`bi ${item.icon}`} style={{ color: item.color }} />
                  <span>{item.label}</span>
                </div>
              );
            })}

            <div
              ref={coreRef}
              className="oc-3d-center-core"
              style={{ transform: getCoreTransform(progress) }}
            >
              <span className="oc-3d-core-ring oc-3d-core-ring-a" />
              <span className="oc-3d-core-ring oc-3d-core-ring-b" />
              <i className="bi bi-mortarboard-fill" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
