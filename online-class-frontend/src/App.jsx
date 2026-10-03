import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import WelcomePage from "./pages/WelcomePage.jsx";
import { SECTIONS } from "./api/client";

// ─── Route-level code splitting ───────────────────────────────────────────────
// Each page is downloaded only when it is first needed, so the first load ships
// far less JavaScript (the admin panel alone is several hundred KB). The Welcome
// page and the app shell stay in the main bundle because they are what visitors
// see first. Loader functions are named so the same import can also be used to
// prefetch a page in the background (see below).
const loadHomePage = () => import("./pages/HomePage.jsx");
const loadDashboard = () => import("./pages/Dashboard.jsx");
const loadCareerPathwaysPage = () => import("./pages/CareerPathwaysPage.jsx");
const loadCurriculumPage = () => import("./pages/CurriculumPage.jsx");
const loadConceptDetailsPage = () => import("./pages/ConceptDetailsPage.jsx");
const loadDocumentViewerPage = () => import("./pages/DocumentViewerPage.jsx");
const loadSectionPage = () => import("./pages/SectionPage.jsx");
const loadLogin = () => import("./pages/Login.jsx");
const loadSignup = () => import("./pages/Signup.jsx");
const loadGoogleOAuthCallback = () => import("./pages/GoogleOAuthCallback.jsx");
const loadAdminGate = () => import("./admin/AdminGate.jsx");

const HomePage = lazy(loadHomePage);
const Dashboard = lazy(loadDashboard);
const CareerPathwaysPage = lazy(loadCareerPathwaysPage);
const CurriculumPage = lazy(loadCurriculumPage);
const ConceptDetailsPage = lazy(loadConceptDetailsPage);
const DocumentViewerPage = lazy(loadDocumentViewerPage);
const SectionPage = lazy(loadSectionPage);
const Login = lazy(loadLogin);
const Signup = lazy(loadSignup);
const GoogleOAuthCallback = lazy(loadGoogleOAuthCallback);
const AdminGate = lazy(loadAdminGate);

// Pages students open most. They are fetched quietly once the browser is idle so
// that clicking any link feels instant. The admin panel is intentionally excluded.
const PREFETCH_LOADERS = [
  loadHomePage,
  loadCurriculumPage,
  loadDashboard,
  loadCareerPathwaysPage,
  loadConceptDetailsPage,
  loadDocumentViewerPage,
  loadSectionPage,
  loadLogin,
  loadSignup,
];

function useIdlePrefetch() {
  useEffect(() => {
    // Respect data-saver / very slow connections.
    const connection = navigator.connection;
    if (connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType || ""))) {
      return undefined;
    }

    let cancelled = false;
    let timerId = null;
    let index = 0;

    const schedule = (fn) => {
      if (typeof window.requestIdleCallback === "function") {
        timerId = window.requestIdleCallback(fn, { timeout: 4000 });
      } else {
        timerId = window.setTimeout(fn, 1200);
      }
    };

    const prefetchNext = () => {
      if (cancelled || index >= PREFETCH_LOADERS.length) return;
      const load = PREFETCH_LOADERS[index++];
      Promise.resolve()
        .then(load)
        .catch(() => {})
        .finally(() => {
          if (!cancelled) schedule(prefetchNext);
        });
    };

    const start = () => schedule(prefetchNext);
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", start);
      if (timerId !== null) {
        if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(timerId);
        else window.clearTimeout(timerId);
      }
    };
  }, []);
}

// Shown only while a page's code is being fetched for the very first time. It keeps
// the layout height stable so the footer does not jump, and renders nothing visible.
function RouteFallback() {
  return <div style={{ minHeight: "60vh" }} aria-busy="true" />;
}

const withSuspense = (element) => <Suspense fallback={<RouteFallback />}>{element}</Suspense>;

export default function App() {
  useIdlePrefetch();

  return (
    <Routes>
      {/* 1. Welcome Page */}
      <Route path="/" element={<WelcomePage />} />
      <Route path="/welcome" element={<WelcomePage />} />

      {/* Main App Layout with Navbar & Footer */}
      <Route element={<AppShell />}>
        {/* 2. Premium Home Page */}
        <Route path="/home" element={withSuspense(<HomePage />)} />

        {/* 3. Main Dashboard page */}
        <Route path="/dashboard" element={withSuspense(<Dashboard />)} />

        {/* 4. Career Pathways & Curated Specializations */}
        <Route path="/career-pathways" element={withSuspense(<CareerPathwaysPage />)} />
        <Route path="/career-pathways/:slug" element={withSuspense(<CareerPathwaysPage />)} />

        {/* 5. Student Curriculum / Lectures & Materials (Reference Image Design) */}
        <Route path="/lectures-and-materials" element={withSuspense(<CurriculumPage />)} />
        <Route path="/lecture-material" element={withSuspense(<CurriculumPage />)} />

        {/* 6. Concept Details View (Opens on 'Know more') */}
        <Route path="/lectures-and-materials/concept/:identifier" element={withSuspense(<ConceptDetailsPage />)} />
        <Route path="/concept/:identifier" element={withSuspense(<ConceptDetailsPage />)} />

        {/* 6b. Protected Document Viewer (Opens on 'View Online' as its own page) */}
        <Route path="/lectures-and-materials/concept/:identifier/document/:docId" element={withSuspense(<DocumentViewerPage />)} />
        <Route path="/concept/:identifier/document/:docId" element={withSuspense(<DocumentViewerPage />)} />

        {/* Individual Section Pages for online classes, suggestions, proxy support, registrations */}
        {Object.values(SECTIONS)
          .filter((s) => s.key !== "lecture_material" && s.key !== "career_pathways")
          .map((s) => (
            <Route
              key={s.key}
              path={`/${s.key.replace(/_/g, "-")}`}
              element={withSuspense(<SectionPage section={s} />)}
            />
          ))}

        {/* Auth Pages */}
        <Route path="/login" element={withSuspense(<Login />)} />
        <Route path="/signup" element={withSuspense(<Signup />)} />
        <Route path="/auth/google/callback" element={withSuspense(<GoogleOAuthCallback />)} />
      </Route>

      {/* Admin entry point (its code is only downloaded when this route is opened) */}
      <Route path="/class/developer" element={withSuspense(<AdminGate />)} />

      {/* Fallback to Home */}
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
