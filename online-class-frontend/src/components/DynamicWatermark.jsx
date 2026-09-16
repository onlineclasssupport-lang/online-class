import { useState, useEffect } from "react";
import { fetchCareerPathways } from "../api/client";

export default function DynamicWatermark({
  username = "Guest Student",
  sessionId = "SEC-XXXXXX",
  sectionTitle = "Online Class",
}) {
  const [currentTime, setCurrentTime] = useState(() => new Date().toLocaleString());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // The Career Pathways page can initially render a sessionStorage-cached module
  // and then receive the authoritative API payload a moment later. If the cached
  // module contains an old/demo document URL, the iframe would otherwise display
  // that old document even though the latest pathway data is already available.
  // Rebind the active viewer to the authoritative document URL by exact title.
  useEffect(() => {
    let cancelled = false;
    let observer;
    let retryTimer;

    const normalize = (value) => String(value || "").trim().toLowerCase();
    const documentTitle = String(sectionTitle || "").includes(" - ")
      ? String(sectionTitle).slice(String(sectionTitle).lastIndexOf(" - ") + 3).trim()
      : String(sectionTitle || "").trim();

    const isLegacyOrWrongViewerUrl = (url) => {
      if (!url) return false;
      try {
        const parsed = new URL(url, window.location.href);
        const sameFrontendOrigin = parsed.origin === window.location.origin;
        const legacyMozillaPdf = parsed.hostname === "raw.githubusercontent.com" && url.includes("compressed.tracemonkey-pldi-09.pdf");
        const frontendStreamUrl = sameFrontendOrigin && parsed.pathname.includes("/api/stream/");
        return legacyMozillaPdf || frontendStreamUrl;
      } catch {
        return url.includes("compressed.tracemonkey-pldi-09.pdf");
      }
    };

    const findViewer = () => document.querySelector(".oc-doc-viewer-body iframe");

    const repairViewer = async () => {
      const iframe = findViewer();
      if (!iframe || cancelled) return false;

      // Native Chromium PDF rendering is blocked by the sandbox attribute used
      // previously. The stream itself is already signature-protected, so the
      // iframe does not need sandboxing to protect the source URL.
      iframe.removeAttribute("sandbox");

      try {
        const response = await fetchCareerPathways();
        const pathways = response?.data?.data;
        if (!Array.isArray(pathways) || !documentTitle || cancelled) return true;

        let resolvedUrl = null;
        for (const pathway of pathways) {
          for (const module of pathway?.curriculum_modules || []) {
            for (const doc of module?.documents || []) {
              if (normalize(doc?.title) === normalize(documentTitle) && doc?.file_url) {
                resolvedUrl = doc.file_url;
                break;
              }
            }
            if (resolvedUrl) break;
          }
          if (resolvedUrl) break;
        }

        if (resolvedUrl && iframe.src !== resolvedUrl) {
          iframe.src = `${resolvedUrl}${resolvedUrl.includes("#") ? "&" : "#"}view=FitH&toolbar=0&navpanes=0`;
        }
      } catch {
        // The normal React rendering path remains the fallback when the
        // authoritative refresh is temporarily unavailable.
      }

      return true;
    };

    const scheduleRepair = () => {
      repairViewer();
      retryTimer = window.setTimeout(() => repairViewer(), 250);
    };

    scheduleRepair();
    observer = new MutationObserver(() => {
      if (findViewer()) {
        observer.disconnect();
        scheduleRepair();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [sectionTitle]);

  const watermarkString = `CONFIDENTIAL • ${username} • ${sessionId} • ${currentTime} • ${sectionTitle}`;

  // Generate an array of repeated watermark rows
  const rows = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="oc-watermark-overlay" aria-hidden="true">
      <div className="oc-watermark-grid">
        {rows.map((r) => (
          <div className="oc-watermark-row" key={r}>
            <span>{watermarkString}</span>
            <span>{watermarkString}</span>
            <span>{watermarkString}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
