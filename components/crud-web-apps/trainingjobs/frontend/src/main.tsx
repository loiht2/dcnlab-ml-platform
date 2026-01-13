import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./app/globals.css";

// Import namespace service to initialize Central Dashboard communication early
import { namespaceService } from "./lib/namespace";

// Kubeflow serves apps under /<app-name> path (not /_/)
const basename = "/training-job";

// Log namespace service initialization status
console.log('[TrainingJobs] Namespace service initialized:', {
  isIframed: namespaceService.isIframed(),
  currentNamespace: namespaceService.getCurrentNamespace() || '(waiting for Central Dashboard)',
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
