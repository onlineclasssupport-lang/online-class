import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./theme.css";
import App from "./App.jsx";
import { AdminAuthProvider } from "./context/AdminAuthContext.jsx";
import { UserAuthProvider } from "./context/UserAuthContext.jsx";
import { SiteSettingsProvider } from "./context/SiteSettingsContext.jsx";
import GlobalSecurityGuard from "./components/GlobalSecurityGuard.jsx";
import PageLifecycleGuard from "./components/PageLifecycleGuard.jsx";

// Bootstrap's JS (used for the navbar collapse via data-bs-* attributes) registers delegated
// document-level listeners, so it does not need to block the first render. Loading it as a
// separate chunk keeps it off the critical path while it still arrives within moments.
import("bootstrap/dist/js/bootstrap.bundle.min.js").catch(() => {});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AdminAuthProvider>
        <UserAuthProvider>
          <SiteSettingsProvider>
            <PageLifecycleGuard>
              <GlobalSecurityGuard>
                <App />
              </GlobalSecurityGuard>
            </PageLifecycleGuard>
          </SiteSettingsProvider>
        </UserAuthProvider>
      </AdminAuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
