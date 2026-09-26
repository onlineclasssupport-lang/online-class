import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  default as api,
  fetchConceptDetails,
  fetchMyConceptAccess,
  fetchSiteSettings,
} from "../api/client";
import DynamicWatermark from "../components/DynamicWatermark.jsx";
import { useUserAuth } from "../context/UserAuthContext.jsx";
import { useSiteSettings } from "../context/SiteSettingsContext.jsx";

// ============================================================================
// DocumentViewerPage
//
// Previously, clicking "View Online" on a document card inside
// ConceptDetailsPage opened the protected DRM viewer as an in-page modal
// overlay on top of the same screen.
//
// This page reproduces that exact same protected viewer (identical markup,
// styling, zoom controls, size toggle, watermarking and DRM notices) but as
// its own dedicated route/screen, so "View Online" now navigates to a fresh
// page instead of popping up a modal on the current one.
// ============================================================================

export default function DocumentViewerPage() {
  const { identifier, docId } = useParams();
  const navigate = useNavigate();
  const { isAuthed, user } = useUserAuth();
  const { authRequired } = useSiteSettings();

  const [concept, setConcept] = useState(null);
  const [unlockedSlugs, setUnlockedSlugs] = useState([]);
  const [paymentEnabled, setPaymentEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Same viewer controls the modal used to offer.
  const [docViewSize, setDocViewSize] = useState("medium"); // "medium" | "expanded"
  const [docZoom, setDocZoom] = useState(1); // 0.5 to 2.5

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.allSettled([
      fetchConceptDetails(identifier),
      isAuthed ? fetchMyConceptAccess() : Promise.resolve({ data: { data: [] } }),
      fetchSiteSettings(),
    ])
      .then(([cRes, aRes, sRes]) => {
        if (!isMounted) return;
        if (cRes.status === "fulfilled" && cRes.value.data?.data) {
          setConcept(cRes.value.data.data);
          setError(null);
        } else if (cRes.status === "rejected") {
          setError("Failed to load this document. Please verify the link or try again later.");
        }

        if (aRes.status === "fulfilled" && aRes.value.data?.data) {
          setUnlockedSlugs(aRes.value.data.data || []);
        }

        if (sRes.status === "fulfilled" && sRes.value.data?.data) {
          const isReq = sRes.value.data.data.payment_required !== "0";
          setPaymentEnabled(isReq);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [identifier, isAuthed]);

  const isUnlocked = () => {
    if (!concept) return false;
    if (!authRequired) return true; // Developer kept User Login & Signup OFF -> Open access without login!
    if (!paymentEnabled) return true;
    if (concept.is_locked === false) return true;
    const s = concept.slug || String(concept.id);
    return unlockedSlugs.includes(s) || unlockedSlugs.includes(String(concept.id));
  };

  const isDocUnlocked = (doc) => {
    if (isUnlocked()) return true;
    if (doc && doc.is_locked === false) return true;
    return false;
  };

  const activeDocument =
    concept?.documents?.find((d) => String(d.id) === String(docId)) || null;

  const unlocked = activeDocument ? isDocUnlocked(activeDocument) : false;

  // Log the view start exactly once the protected document is confirmed
  // visible, mirroring what ConceptDetailsPage used to log when the modal
  // opened.
  useEffect(() => {
    if (loading || !concept || !activeDocument || !unlocked) return;
    if (!(activeDocument.file_url || activeDocument.file_path)) return;

    if (isAuthed) {
      api
        .post("/security/log", {
          event_type: "protected_document_view_started",
          section_key: `concept:${concept?.slug || identifier}`,
          document_id: String(activeDocument.id),
          username: user?.name || "Student User",
          meta: {
            concept: concept?.name || identifier,
            document_title: activeDocument.title,
            access: "protected_viewer",
          },
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, concept, activeDocument, unlocked]);

  const goBackToConcept = () => {
    navigate(`/lectures-and-materials/concept/${identifier}`);
  };

  // ---- helpers (identical logic to ConceptDetailsPage) ----
  const isImageDoc = (doc) => {
    if (!doc) return false;
    const type = (doc.file_type || "").toLowerCase();
    if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(type)) return true;
    const path = doc.file_url || doc.file_path || "";
    return /\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(path);
  };

  const isPdfDoc = (doc) => {
    if (!doc) return false;
    const type = (doc.file_type || "").toLowerCase();
    if (type === "pdf") return true;
    const path = doc.file_url || doc.file_path || "";
    return /\.pdf(\?.*)?$/i.test(path);
  };

  const isVideoDoc = (doc) => {
    if (!doc) return false;
    if (doc.is_video === true) return true;
    const type = (doc.file_type || "").toLowerCase();
    if (["mp4", "webm", "ogg", "mov", "mkv", "m4v", "avi", "video"].includes(type) || type.includes("video")) return true;
    const path = (doc.file_url || doc.file_path || "").split("?")[0].split("#")[0].toLowerCase();
    return (
      /\.(mp4|webm|ogg|mov|mkv|m4v|avi)$/i.test(path) ||
      path.includes("/stream") ||
      path.includes("video")
    );
  };

  const isTextDocument = (doc) => {
    if (!doc) return false;

    const type = String(doc.file_type || doc.mime_type || "")
      .toLowerCase()
      .trim();

    const fileName = String(doc.file_name || doc.file_url || doc.file_path || "")
      .split("?")[0]
      .split("#")[0]
      .toLowerCase();

    const extension = fileName.match(/\.([a-z0-9]+)$/i)?.[1] || "";

    const textExtensions = [
      "txt",
      "text",
      "md",
      "markdown",
      "csv",
      "tsv",
      "json",
      "xml",
      "html",
      "htm",
      "css",
      "js",
      "jsx",
      "ts",
      "tsx",
      "php",
      "py",
      "java",
      "c",
      "cpp",
      "h",
      "hpp",
      "sql",
      "yml",
      "yaml",
      "ini",
      "conf",
      "log",
      "srt",
      "vtt",
    ];

    return (
      textExtensions.includes(type) ||
      textExtensions.includes(extension) ||
      type.startsWith("text/")
    );
  };

  const getDocumentUrl = (doc) => doc?.file_url || doc?.file_path || doc?.url || "";

  const getDocIcon = (type) => {
    const t = (type || "").toLowerCase();
    if (t === "pdf") return "bi-file-earmark-pdf text-danger";
    if (t === "doc" || t === "docx") return "bi-file-earmark-word text-primary";
    if (t === "ppt" || t === "pptx") return "bi-file-earmark-slides text-warning";
    if (t === "zip" || t === "rar") return "bi-file-earmark-zip text-secondary";
    return "bi-file-earmark-text text-info";
  };

  // ---- render states ----

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "70vh" }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading document&hellip;</span>
        </div>
      </div>
    );
  }

  if (error || !concept) {
    return (
      <div className="container py-5 text-center">
        <h3 className="fw-bold mb-2">Unable to load this document</h3>
        <p className="text-muted mb-4">{error || "This concept could not be found."}</p>
        <Link to="/lectures-and-materials" className="btn btn-primary rounded-pill px-4">
          Back to Lectures &amp; Materials
        </Link>
      </div>
    );
  }

  if (!activeDocument) {
    return (
      <div className="container py-5 text-center">
        <h3 className="fw-bold mb-2">Document not found</h3>
        <p className="text-muted mb-4">
          This document may have been removed, or the link you used is incorrect.
        </p>
        <button type="button" className="btn btn-primary rounded-pill px-4" onClick={goBackToConcept}>
          Back to {concept.name}
        </button>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="container py-5 text-center">
        <i className="bi bi-lock-fill text-warning" style={{ fontSize: "3rem" }} />
        <h3 className="fw-bold mt-3 mb-2">This document is locked</h3>
        <p className="text-muted mb-4">Unlock {concept.name} to view this resource online.</p>
        <button type="button" className="btn btn-warning text-dark fw-bold rounded-pill px-4" onClick={goBackToConcept}>
          Go Unlock This Subject
        </button>
      </div>
    );
  }

  if (!getDocumentUrl(activeDocument)) {
    return (
      <div className="container py-5 text-center">
        <h3 className="fw-bold mb-2">Document not ready</h3>
        <p className="text-muted mb-4">This document is not ready to view yet. Please try again shortly.</p>
        <button type="button" className="btn btn-primary rounded-pill px-4" onClick={goBackToConcept}>
          Back to {concept.name}
        </button>
      </div>
    );
  }

  // ---- protected viewer screen (same visual design as the old modal) ----
  return (
    <div
      className={`oc-doc-viewer-modal-backdrop ${docViewSize === "expanded" ? "oc-doc-viewer-modal-backdrop--expanded" : ""}`}
      onContextMenu={(e) => e.preventDefault()}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      <div
        className={`oc-doc-viewer-modal ${docViewSize === "expanded" ? "oc-doc-viewer-modal--expanded" : "oc-doc-viewer-modal--medium"}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="oc-doc-viewer-header">
          <div className="d-flex align-items-center gap-2 overflow-hidden" style={{ minWidth: 0, flex: "1 1 200px" }}>
            <span className="oc-popover-icon bg-primary text-white flex-shrink-0">
              <i className="bi bi-shield-lock-fill" />
            </span>
            <div className="overflow-hidden">
              <h4 className="mb-0 text-white text-truncate" style={{ fontSize: "0.95rem" }} title={activeDocument.title}>
                {activeDocument.title}
              </h4>
              <small className="text-truncate d-block" style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.82)" }}>
                🔒 Protected Study Viewer &bull; {concept.name} &bull; (Downloads Disabled)
              </small>
            </div>
          </div>
          <div className="oc-viewer-controls d-flex align-items-center flex-wrap gap-2">
            {/* Zoom Controls (Visible for documents) */}
            <div className="oc-doc-zoom-toolbar" role="group" aria-label="Document Zoom">
              <button
                type="button"
                className="btn"
                onClick={() => setDocZoom((prev) => Math.max(0.5, +(prev - 0.25).toFixed(2)))}
                title="Zoom Out (-25%)"
                disabled={docZoom <= 0.5}
              >
                <i className="bi bi-dash-lg" />
              </button>
              <span
                className="oc-doc-zoom-val"
                onClick={() => setDocZoom(1)}
                title="Click to reset zoom to 100%"
              >
                {Math.round(docZoom * 100)}%
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => setDocZoom((prev) => Math.min(2.5, +(prev + 0.25).toFixed(2)))}
                title="Zoom In (+25%)"
                disabled={docZoom >= 2.5}
              >
                <i className="bi bi-plus-lg" />
              </button>
              {docZoom !== 1 && (
                <button
                  type="button"
                  className="btn oc-doc-zoom-reset-btn"
                  onClick={() => setDocZoom(1)}
                  title="Reset Zoom to 100%"
                >
                  <i className="bi bi-arrow-counterclockwise me-1" /> Reset
                </button>
              )}
            </div>

            {/* Sizing Switcher (Medium vs Entire Website) */}
            <div className="oc-view-size-btn-group" role="group" aria-label="Viewer Size">
              <button
                type="button"
                className={`btn ${docViewSize === "medium" ? "active" : "oc-btn-medium-prominent"}`}
                onClick={() => {
                  setDocViewSize("medium");
                  setDocZoom(1);
                }}
                title="Switch to Medium View"
              >
                <i className="bi bi-window me-1" />
                <span>Medium</span>
              </button>
              <button
                type="button"
                className={`btn ${docViewSize === "expanded" ? "active" : "oc-btn-entire-prominent"}`}
                onClick={() => setDocViewSize("expanded")}
                title="Display Entire Website Width"
              >
                <i className="bi bi-arrows-fullscreen me-1" />
                <span>Entire Website</span>
              </button>
            </div>

            {/* Back Button (replaces the old modal's Close button, since this
                is now its own page rather than an overlay) */}
            <button
              type="button"
              className="btn btn-sm btn-dark text-white rounded-circle d-inline-flex align-items-center justify-content-center"
              style={{ width: 32, height: 32, padding: 0, border: "1px solid rgba(255, 255, 255, 0.25)" }}
              onClick={goBackToConcept}
              aria-label="Back"
              title="Back to concept"
            >
              <i className="bi bi-arrow-left" />
            </button>
          </div>
        </div>

        <div
          className={`oc-doc-viewer-body position-relative ${docViewSize === "expanded" ? "oc-doc-viewer-body--expanded" : "oc-doc-viewer-body--medium"}`}
          style={{ backgroundColor: "#0f172a", userSelect: "none" }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {!isVideoDoc(activeDocument) && (
            <>
              <div
                className="position-absolute top-0 start-0 end-0 mx-3 mt-3 px-3 py-2 rounded-3 d-flex align-items-center gap-2"
                style={{
                  zIndex: 5,
                  pointerEvents: "none",
                  color: "#f8fafc",
                  background: "rgba(127, 29, 29, 0.94)",
                  border: "1px solid rgba(254, 202, 202, 0.45)",
                  boxShadow: "0 8px 22px rgba(0, 0, 0, 0.3)",
                  fontSize: "0.78rem",
                  lineHeight: 1.4,
                }}
                role="status"
              >
                <i className="bi bi-shield-lock-fill text-warning flex-shrink-0" aria-hidden="true" />
                <span>
                  <strong>Security notice:</strong> This document is view-only. Copying, printing, downloading, screen capture, and recording are restricted and monitored.
                </span>
              </div>
              <DynamicWatermark
                username={user?.name || "Student Viewer"}
                sessionId="CURRICULUM-DRM"
                sectionTitle={`${concept.name} - ${activeDocument.title}`}
              />
            </>
          )}

          {isTextDocument(activeDocument) ? (
            <div
              className="w-100 h-100 p-3"
              style={{
                minHeight: docViewSize === "expanded" ? "calc(100vh - 180px)" : "72vh",
                background: "#0f172a",
                overflow: "auto",
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div
                className="w-100 h-100 rounded-3 overflow-hidden bg-white"
                style={{
                  minHeight: docViewSize === "expanded" ? "calc(100vh - 180px)" : "68vh",
                }}
              >
                <iframe
                  src={getDocumentUrl(activeDocument)}
                  title={activeDocument.title || "Text document"}
                  className="w-100 h-100 border-0"
                  style={{
                    minHeight: docViewSize === "expanded" ? "calc(100vh - 180px)" : "68vh",
                    background: "#fff",
                  }}
                  loading="eager"
                  referrerPolicy="no-referrer"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          ) : isImageDoc(activeDocument) ? (
            <div
              className="w-100 h-100 p-3"
              style={{
                minHeight: docViewSize === "expanded" ? "calc(100vh - 180px)" : "72vh",
                overflow: "auto",
                display: "flex",
                alignItems: docZoom <= 1 ? "center" : "flex-start",
                justifyContent: docZoom <= 1 ? "center" : "flex-start",
              }}
            >
              <div
                style={{
                  margin: "auto",
                  textAlign: "center",
                  transition: "all 0.2s ease-out",
                }}
              >
                <img
                  src={activeDocument.file_url || activeDocument.file_path}
                  alt={activeDocument.title}
                  style={{
                    width: docZoom !== 1 ? `${Math.round(docZoom * 100)}%` : "100%",
                    maxWidth: docZoom <= 1 ? "100%" : "none",
                    maxHeight: docZoom <= 1 ? (docViewSize === "expanded" ? "calc(100vh - 200px)" : "70vh") : "none",
                    objectFit: "contain",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    pointerEvents: "none",
                    borderRadius: "8px",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                  }}
                  draggable={false}
                />
              </div>
            </div>
          ) : isPdfDoc(activeDocument) ? (
            <div
              className="w-100 h-100 position-relative"
              style={{
                minHeight: docViewSize === "expanded" ? "calc(100vh - 180px)" : "72vh",
                overflow: "auto",
              }}
            >
              <div
                style={{
                  width: `${Math.round(docZoom * 100)}%`,
                  minHeight: docViewSize === "expanded" ? (docZoom > 1 ? `calc(${Math.round(docZoom * 100)}vh - 180px)` : "calc(100vh - 180px)") : (docZoom > 1 ? `${Math.round(docZoom * 72)}vh` : "72vh"),
                  height: docZoom > 1 ? `${Math.round(docZoom * 100)}%` : "100%",
                  margin: "0 auto",
                  transition: "width 0.2s ease-out, min-height 0.2s ease-out",
                }}
              >
                <iframe
                  key={`doc-pdf-${activeDocument.id || activeDocument._id || activeDocument.title}-${docViewSize}`}
                  src={`${activeDocument.file_url || activeDocument.file_path}#view=FitH&toolbar=0&navpanes=0`}
                  title={activeDocument.title}
                  className="w-100 h-100 rounded border-0"
                  style={{
                    width: "100%",
                    height: "100%",
                    minHeight: docViewSize === "expanded" ? (docZoom > 1 ? `calc(${Math.round(docZoom * 100)}vh - 180px)` : "calc(100vh - 180px)") : (docZoom > 1 ? `${Math.round(docZoom * 72)}vh` : "72vh"),
                    backgroundColor: "#1e293b",
                    display: "block",
                  }}
                />
              </div>
            </div>
          ) : isVideoDoc(activeDocument) ? (
            <div className="w-100 h-100 p-2 d-flex align-items-center justify-content-center" style={{ minHeight: docViewSize === "expanded" ? "calc(100vh - 180px)" : "72vh" }}>
              <div className="w-100 h-100 rounded-3 overflow-hidden bg-black shadow position-relative d-flex align-items-center justify-content-center" style={{ maxHeight: docViewSize === "expanded" ? "calc(96vh - 150px)" : "68vh" }}>
                <video
                  controls
                  autoPlay
                  playsInline
                  controlsList="nodownload noplaybackrate noremoteplayback"
                  disablePictureInPicture
                  disableRemotePlayback
                  onContextMenu={(e) => e.preventDefault()}
                  src={activeDocument.file_url || activeDocument.file_path}
                  className="w-100 h-100"
                  style={{ maxHeight: docViewSize === "expanded" ? "calc(96vh - 150px)" : "68vh", objectFit: "contain" }}
                >
                  <source src={activeDocument.file_url || activeDocument.file_path} />
                  Your browser does not support video playback.
                </video>
              </div>
            </div>
          ) : (
            <div className="d-flex flex-column align-items-center justify-content-center p-5 text-center text-white" style={{ minHeight: docViewSize === "expanded" ? "calc(100vh - 180px)" : "72vh" }}>
              <div className="p-4 rounded-circle bg-dark-subtle mb-3" style={{ width: 84, height: 84, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className={`bi ${getDocIcon(activeDocument.file_type)}`} style={{ fontSize: "2.8rem" }} />
              </div>
              <h4 className="fw-bold mb-2">{activeDocument.title}</h4>
              <div className="d-flex align-items-center gap-2 mb-3">
                <span className="badge bg-primary text-uppercase px-3 py-1">{activeDocument.file_type || "DOCUMENT"}</span>
                {activeDocument.formatted_size && <span className="badge bg-secondary px-3 py-1">{activeDocument.formatted_size}</span>}
              </div>
              <p className="text-white-50 small mb-4" style={{ maxWidth: 520, lineHeight: 1.6 }}>
                {activeDocument.description || "This lecture resource is protected under the Online Class DRM Academic Policy. Direct downloading and offline distribution are restricted."}
              </p>
              <div className="alert alert-dark border border-secondary-subtle py-2 px-4 rounded-pill d-inline-flex align-items-center gap-2 text-white-50" style={{ fontSize: "0.8rem" }}>
                <i className="bi bi-shield-check text-success" />
                <span>Academic DRM Active &bull; Monitored Viewer Session</span>
              </div>
            </div>
          )}
        </div>

        <div className="oc-doc-viewer-footer d-flex justify-content-between align-items-center">
          <span className="text-white-50 small d-flex align-items-center gap-2">
            <i className="bi bi-shield-fill-check text-success" />
            <span>Anti-Download &amp; Academic Watermarking Active &bull; View Only</span>
          </span>
          <button
            type="button"
            className="btn btn-sm btn-secondary rounded-pill px-4"
            onClick={goBackToConcept}
          >
            <i className="bi bi-arrow-left me-1" /> Back to {concept.name}
          </button>
        </div>
      </div>
    </div>
  );
}
