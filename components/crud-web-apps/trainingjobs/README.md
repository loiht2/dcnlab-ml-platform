# Training Job UI for Kubeflow

A web-based user interface for creating and managing Ray-based training jobs within the Kubeflow ecosystem. This component integrates seamlessly with Kubeflow Central Dashboard, leveraging the existing Kubeflow authentication, authorization, and multi-tenancy infrastructure.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Kubeflow Ecosystem Integration](#kubeflow-ecosystem-integration)
  - [Central Dashboard Integration](#1-central-dashboard-integration)
  - [Frontend Integration](#2-frontend-kubeflow-integration)
  - [Backend Integration](#3-backend-kubeflow-integration)
  - [Istio/Networking Integration](#4-istiomesh-integration)
  - [RBAC Integration](#5-rbac-integration)
  - [Inherited Kubeflow Components](#6-inherited-kubeflow-components)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Building from Source](#building-from-source)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Samples](#samples)

---

## Overview

The Training Job UI is a custom Kubeflow component that enables users to:
- Create distributed training jobs using Ray and XGBoost
- Upload training data directly from the browser
- Configure comprehensive XGBoost hyperparameters (41 parameters)
- Monitor job status in real-time
- Automatically create TensorBoard instances for job visualization
- Store model outputs and checkpoints in MinIO

### Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | Go 1.23, Gin Framework, client-go |
| Frontend | React 18, TypeScript, Vite 4.5.14, Tailwind CSS |
| Runtime | Ray 2.46.0, KubeRay Operator |
| Storage | MinIO (S3-compatible) |
| Orchestration | Kubernetes, Istio Service Mesh |
| Monitoring | TensorBoard (auto-created via Kubeflow Tensorboard Controller) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           KUBEFLOW ECOSYSTEM                                         │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │                    Istio Ingress Gateway (istio-ingressgateway)                 │ │
│  │                      kubeflow-gateway.kubeflow-system                           │ │
│  └────────────────────────────────────────────────┬───────────────────────────────┘ │
│                                                   │                                  │
│                                                   ▼                                  │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │                         Kubeflow Central Dashboard                              │ │
│  │                                                                                  │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                  │ │
│  │  │   /jupyter/     │  │  /tensorboards/ │  │ /training-job/  │  ◄── NEW        │ │
│  │  │   (Notebooks)   │  │   (Tensorboard) │  │ (Training Jobs) │                  │ │
│  │  └─────────────────┘  └─────────────────┘  └────────┬────────┘                  │ │
│  │                                                      │                           │ │
│  │  Header Injection: kubeflow-userid: user@example.com                            │ │
│  └──────────────────────────────────────────────────────┼───────────────────────────┘ │
│                                                         │                            │
│  ┌──────────────────────────────────────────────────────┼───────────────────────────┐ │
│  │                    VirtualService Routing (istio.yaml)                           │ │
│  │                                                      │                           │ │
│  │    /training-job/*  ─────────────────────►  training-job-web-app-service:80     │ │
│  │    /api/training-job/*  ─────────────────►  ml-platform-backend:8080            │ │
│  └──────────────────────────────────────────────────────┼───────────────────────────┘ │
│                                                         │                            │
│         ┌───────────────────────────────────────────────┴────────────────────┐       │
│         │                                                                     │       │
│         ▼                                                                     ▼       │
│  ┌──────────────────────────┐                    ┌──────────────────────────────────┐│
│  │     Frontend Service     │                    │        Backend Service           ││
│  │  training-job-web-app    │     API Calls     │      ml-platform-backend         ││
│  │     (React + Vite)       │  ◄─────────────►  │        (Go + Gin)                ││
│  │                          │   /api/v1/*       │                                   ││
│  │  ┌────────────────────┐ │                    │  ┌─────────────────────────────┐ ││
│  │  │ kubeflow-api.ts    │ │                    │  │  middleware/auth.go         │ ││
│  │  │ Fetches:           │ │                    │  │  • Extract kubeflow-userid  │ ││
│  │  │ /api/workgroup/    │ │                    │  │  • Map email → namespace    │ ││
│  │  │   env-info         │ │                    │  │  • Store in Gin context     │ ││
│  │  └────────────────────┘ │                    │  └─────────────────────────────┘ ││
│  └──────────────────────────┘                    └──────────────────────────────────┘│
│                                                           │                          │
│                                                           │ Kubernetes API           │
│                                                           ▼                          │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │                        User Namespace (kubeflow-user-example-com)               │ │
│  │                                                                                  │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌────────────┐ │ │
│  │  │    RayJob CRD   │  │ Tensorboard CRD │  │  minio-secret   │  │    PVCs    │ │ │
│  │  │  (ray.io/v1)    │  │ (kubeflow.org)  │  │  (Credentials)  │  │            │ │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Kubeflow Ecosystem Integration

This section explains in detail how the Training Jobs application integrates with the Kubeflow ecosystem, including what modifications are needed and how existing Kubeflow components are inherited.

### 1. Central Dashboard Integration

The Training Jobs UI is embedded in Kubeflow's Central Dashboard as an iframe, similar to other Kubeflow components like Notebooks, Volumes, and TensorBoards.

#### Adding Menu Entry (Required Modification)

To add the Training Jobs link in the Central Dashboard sidebar, modify the **Central Dashboard ConfigMap**:

**File:** `centraldashboard-angular/manifests/base/configmap.yaml`

Add the following entry to the `menuLinks` array:

```json
{
  "type": "item",
  "link": "/training-job/",
  "text": "Training Jobs",
  "icon": "kubeflow:pipeline-centered"
}
```

**Full ConfigMap example:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: centraldashboard-angular-config
data:
  settings: |-
    {
      "DASHBOARD_FORCE_IFRAME": true
    }
  links: |-
    {
      "menuLinks": [
        {
          "type": "item",
          "link": "/jupyter/",
          "text": "Notebooks",
          "icon": "book"
        },
        {
          "type": "item",
          "link": "/tensorboards/",
          "text": "Tensorboards",
          "icon": "assessment"
        },
        {
          "type": "item",
          "link": "/volumes/",
          "text": "Volumes",
          "icon": "device:storage"
        },
        {
          "type": "item",
          "link": "/training-job/",
          "text": "Training Jobs",
          "icon": "kubeflow:pipeline-centered"
        }
        // ... other menu items
      ]
    }
```

#### Why iframe Embedding Works

The Central Dashboard uses `DASHBOARD_FORCE_IFRAME: true` setting, which means all menu items are loaded inside an iframe. This allows:

1. **Isolated Frontend Apps**: Each component can use different frontend frameworks (React, Angular, etc.)
2. **Independent Routing**: Each app manages its own routes under its base path
3. **Shared Authentication**: The `kubeflow-userid` header is passed through Istio to all embedded apps

#### Frontend X-Frame-Options Configuration

The frontend nginx configuration **removes X-Frame-Options** to allow iframe embedding:

**File:** `frontend/nginx.conf`
```nginx
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;

  # Security headers
  # X-Frame-Options removed to allow embedding in Kubeflow centraldashboard iframe
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-XSS-Protection "1; mode=block" always;

  location / {
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "no-cache";
  }

  location /health {
    access_log off;
    return 200 "healthy\n";
  }
}
```

---

### 2. Frontend Kubeflow Integration

The frontend integrates with Kubeflow by:

1. **Base Path Configuration** - Serving under `/training-job/` prefix
2. **Kubeflow API Integration** - Fetching user/namespace info from Central Dashboard
3. **Namespace Selection Logic** - Following Kubeflow's standard namespace selection pattern

#### 2.1 Base Path Configuration

**File:** `frontend/vite.config.ts`

```typescript
export default defineConfig({
  // CRITICAL: Set base path for Kubeflow iframe embedding
  // All assets and routes will be prefixed with /training-job
  base: "/training-job",
  
  plugins: [react()],
  
  server: {
    port: 3000,
    proxy: {
      // Development proxy - routes /api calls to backend
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  // ... build configuration
});
```

**Key Points:**
- `base: "/training-job"` ensures all static assets are served with the correct prefix
- Routes like `/create` become `/training-job/create` in production
- Vite proxy allows development without CORS issues

**File:** `frontend/src/main.tsx`

```typescript
import { BrowserRouter } from "react-router-dom";

// Must match the base path in vite.config.ts
const basename = "/training-job";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

#### 2.2 Kubeflow API Integration

The frontend fetches user and namespace information from Kubeflow's Central Dashboard API:

**File:** `frontend/src/lib/kubeflow-api.ts`

```typescript
export interface NamespaceBinding {
  namespace: string;
  role: string;      // 'owner', 'contributor', 'viewer'
  user: string;
}

export interface KubeflowEnvInfo {
  user: string;                    // User email (e.g., "user@example.com")
  namespaces: NamespaceBinding[];  // List of namespaces user has access to
  isClusterAdmin: boolean;
  platform?: {
    provider: string;
    providerName: string;
    kubeflowVersion: string;
  };
}

/**
 * Fetch user and namespace information from Kubeflow Central Dashboard
 * This API is exposed by the Central Dashboard at /api/workgroup/env-info
 */
export async function getKubeflowEnvInfo(): Promise<KubeflowEnvInfo> {
  try {
    const response = await fetch('/api/workgroup/env-info');
    if (!response.ok) {
      return getEnvInfoFromURL();  // Fallback to URL params
    }
    
    const data = await response.json();
    return {
      user: data.user || 'anonymous@kubeflow.org',
      namespaces: data.namespaces || [],
      isClusterAdmin: data.isClusterAdmin || false,
      platform: data.platform
    };
  } catch (error) {
    return getEnvInfoFromURL();
  }
}
```

**How it works:**
1. When the app loads, it calls `/api/workgroup/env-info` (served by Central Dashboard)
2. Central Dashboard returns the authenticated user's email and accessible namespaces
3. The frontend uses this to populate namespace selectors and determine the default namespace

#### 2.3 Namespace Selection Logic

Following Kubeflow's standard pattern:

```typescript
/**
 * Get the default namespace using Kubeflow's selection logic:
 * 1. Check localStorage for user's previous selection
 * 2. Find namespace with 'owner' role
 * 3. Fall back to 'kubeflow' namespace if it exists
 * 4. Use first available namespace
 * 5. Fall back to URL parameter or hardcoded default
 */
export function getDefaultNamespace(envInfo: KubeflowEnvInfo): string {
  // 1. Check localStorage (same key pattern as centraldashboard)
  const localStorageKey = `/centraldashboard/selectedNamespace/${envInfo.user || ''}`;
  const previousNamespace = localStorage.getItem(localStorageKey);
  if (previousNamespace && envInfo.namespaces.some(ns => ns.namespace === previousNamespace)) {
    return previousNamespace;
  }

  // 2. Find namespace with 'owner' role
  const ownedNamespace = envInfo.namespaces.find(ns => ns.role === 'owner');
  if (ownedNamespace) {
    return ownedNamespace.namespace;
  }

  // 3. Fall back to 'kubeflow' namespace
  if (envInfo.namespaces.some(ns => ns.namespace === 'kubeflow')) {
    return 'kubeflow';
  }

  // 4. Use first available namespace
  if (envInfo.namespaces.length > 0) {
    return envInfo.namespaces[0].namespace;
  }

  // 5. Fall back to URL parameter or hardcoded default
  const params = new URLSearchParams(window.location.search);
  return params.get('ns') || 'kubeflow-user-example-com';
}
```

**Why this matters:**
- Uses the **same localStorage key pattern** as Central Dashboard (`/centraldashboard/selectedNamespace/{user}`)
- When user switches namespace in Central Dashboard, our app respects that selection
- Provides consistent UX across all Kubeflow components

---

### 3. Backend Kubeflow Integration

The backend integrates with Kubeflow through:

1. **Authentication Middleware** - Extracting user identity from Kubeflow headers
2. **Namespace Derivation** - Converting user email to Kubernetes namespace
3. **Context Propagation** - Passing user info through request handlers

#### 3.1 Authentication Middleware

**File:** `backend/middleware/auth.go`

```go
const (
    // Kubeflow standard headers (injected by Istio/Central Dashboard)
    UserIDHeader = "kubeflow-userid"
    
    // Context keys for passing user info through handlers
    UserEmailKey     = "user-email"
    UserNamespaceKey = "user-namespace"
)

// KubeflowAuthMiddleware extracts user identity from Kubeflow headers
func KubeflowAuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        // Extract user email from Kubeflow header
        // This header is injected by Istio/OIDC after authentication
        userEmail := c.GetHeader(UserIDHeader)
        if userEmail == "" {
            log.Println("Warning: No kubeflow-userid header found, using anonymous")
            userEmail = "anonymous@kubeflow.org"
        }

        log.Printf("Authenticated user: %s", userEmail)

        // Store user email in Gin context
        c.Set(UserEmailKey, userEmail)

        // Derive and store user's namespace
        namespace := determineUserNamespace(userEmail)
        c.Set(UserNamespaceKey, namespace)

        log.Printf("User %s mapped to namespace: %s", userEmail, namespace)

        c.Next()
    }
}
```

**How Kubeflow passes the header:**
1. User logs in through Kubeflow's OIDC (Dex)
2. OIDC AuthService validates the session and adds `kubeflow-userid` header
3. Istio injects this header into all requests to services in the mesh
4. Our middleware reads the header to identify the user

#### 3.2 Namespace Derivation

Kubeflow uses a specific naming convention for user namespaces:

```go
// determineUserNamespace converts user email to Kubeflow namespace format
// Example: user@example.com → kubeflow-user-example-com
func determineUserNamespace(userEmail string) string {
    // Sanitize email for use as Kubernetes namespace
    // Kubernetes namespace must be DNS-1123 label:
    // - lowercase alphanumeric characters or '-'
    // - start and end with an alphanumeric character
    
    namespace := strings.ToLower(userEmail)
    
    // Replace special characters with hyphens
    namespace = strings.ReplaceAll(namespace, "@", "-")
    namespace = strings.ReplaceAll(namespace, ".", "-")
    namespace = strings.ReplaceAll(namespace, "_", "-")
    
    // Add kubeflow prefix if not already present
    if !strings.HasPrefix(namespace, "kubeflow-") {
        namespace = "kubeflow-" + namespace
    }
    
    return namespace
}
```

**Transformation examples:**
| User Email | Namespace |
|------------|-----------|
| user@example.com | kubeflow-user-example-com |
| john.doe@company.org | kubeflow-john-doe-company-org |
| admin@kubeflow.org | kubeflow-admin-kubeflow-org |

#### 3.3 Helper Functions for Handlers

```go
// GetUserEmail retrieves user email from Gin context
func GetUserEmail(c *gin.Context) string {
    email, exists := c.Get(UserEmailKey)
    if !exists {
        return "anonymous@kubeflow.org"
    }
    return email.(string)
}

// GetUserNamespace retrieves user namespace from Gin context
func GetUserNamespace(c *gin.Context) string {
    namespace, exists := c.Get(UserNamespaceKey)
    if !exists {
        return "default"
    }
    return namespace.(string)
}

// GetTargetNamespace retrieves the target namespace for operations
// Checks query param first, falls back to user's namespace
func GetTargetNamespace(c *gin.Context) string {
    requestedNamespace := c.Query("namespace")
    if requestedNamespace == "" {
        requestedNamespace = c.Param("namespace")
    }
    if requestedNamespace == "" {
        return GetUserNamespace(c)
    }
    return requestedNamespace
}
```

#### 3.4 Using User Context in Handlers

**File:** `backend/handlers/handlers.go`

```go
func (h *Handler) CreateTrainingJob(c *gin.Context) {
    var req models.TrainingJobRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
        return
    }

    // Get authenticated user info
    userEmail := middleware.GetUserEmail(c)
    
    // Use namespace from request or fall back to user's default namespace
    if req.Namespace == "" {
        req.Namespace = middleware.GetTargetNamespace(c)
    }
    
    log.Printf("User %s creating job '%s' in namespace '%s'", 
        userEmail, req.JobName, req.Namespace)
    
    // Create job in user's namespace...
}

func (h *Handler) ListTrainingJobs(c *gin.Context) {
    // List jobs only in user's namespace (multi-tenancy isolation)
    namespace := middleware.GetTargetNamespace(c)
    userEmail := middleware.GetUserEmail(c)
    
    log.Printf("User %s listing jobs in namespace %s", userEmail, namespace)
    
    rayJobs, err := h.k8sClient.ListActiveRayJobs(ctx, namespace)
    // ...
}
```

#### 3.5 CORS Configuration for Kubeflow

```go
// CORSMiddleware handles CORS for Kubeflow integration
func CORSMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
        c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
        c.Writer.Header().Set("Access-Control-Allow-Headers", 
            "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, "+
            "Authorization, accept, origin, Cache-Control, X-Requested-With, "+
            UserIDHeader) // IMPORTANT: Allow kubeflow-userid header
        c.Writer.Header().Set("Access-Control-Allow-Methods", 
            "POST, OPTIONS, GET, PUT, DELETE, PATCH")

        if c.Request.Method == "OPTIONS" {
            c.AbortWithStatus(http.StatusNoContent)
            return
        }

        c.Next()
    }
}
```

---

### 4. Istio/Mesh Integration

The application integrates with Kubeflow's Istio service mesh for:

1. **Traffic Routing** - VirtualService for URL routing
2. **Authentication** - AuthorizationPolicy for access control
3. **Security** - mTLS between services

#### 4.1 VirtualService Configuration

**File:** `manifests/istio.yaml`

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: kf-training-job-ui
  namespace: kubeflow
spec:
  gateways:
    # Use Kubeflow's shared gateway
    - kubeflow/kubeflow-gateway
  hosts:
    - '*'
  http:
    # Frontend routes: /training-job/* → frontend service
    - headers:
        request:
          add:
            x-forwarded-prefix: /training-job
      match:
        - uri:
            prefix: /training-job/
      rewrite:
        uri: /
      route:
        - destination:
            host: training-job-web-app-service.kubeflow.svc.cluster.local
            port:
              number: 80

    # Backend API routes: /api/training-job/* → backend service
    - match:
        - uri:
            prefix: /api/training-job/
      rewrite:
        uri: /api/
      route:
        - destination:
            host: ml-platform-backend.kubeflow.svc.cluster.local
            port:
              number: 8080
```

**URL Routing Flow:**
```
User Browser                Istio Gateway              Service
     │                           │                        │
     │  GET /training-job/       │                        │
     │ ─────────────────────────►│                        │
     │                           │  GET / (rewritten)     │
     │                           │──────────────────────► │ training-job-web-app-service
     │                           │                        │
     │  POST /api/training-job/jobs                       │
     │ ─────────────────────────►│                        │
     │                           │  POST /api/jobs        │
     │                           │──────────────────────► │ ml-platform-backend
```

#### 4.2 AuthorizationPolicy Configuration

```yaml
# Require kubeflow-userid header for backend access
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: ml-platform-backend-auth
  namespace: kubeflow
spec:
  selector:
    matchLabels:
      app: ml-platform
      component: backend
  action: ALLOW
  rules:
    # Allow health checks without authentication
    - to:
        - operation:
            paths: ["/health"]
    
    # Require authentication for all other endpoints
    - when:
        - key: request.headers[kubeflow-userid]
          notValues: [""]
      from:
        - source:
            principals:
              - "cluster.local/ns/istio-system/sa/istio-ingressgateway-service-account"

---
# Allow frontend access from ingress
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: ml-platform-frontend-auth
  namespace: kubeflow
spec:
  selector:
    matchLabels:
      app: ml-platform
      component: frontend
  action: ALLOW
  rules:
    - from:
        - source:
            principals:
              - "cluster.local/ns/istio-system/sa/istio-ingressgateway-service-account"
```

**Security Flow:**
1. User authenticates with Kubeflow (Dex OIDC)
2. Istio injects `kubeflow-userid` header
3. AuthorizationPolicy ensures only authenticated requests reach backend
4. Backend middleware extracts and validates user identity

---

### 5. RBAC Integration

The backend service account requires ClusterRole permissions to manage resources across user namespaces:

**File:** `manifests/rbac.yaml`

```yaml
# ServiceAccount for the backend
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ml-platform-backend
  namespace: kubeflow

---
# ClusterRole with required permissions
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ml-platform-backend-role
rules:
  # RayJob CRD - Create and manage Ray training jobs
  - apiGroups: ["ray.io"]
    resources: ["rayjobs"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["ray.io"]
    resources: ["rayjobs/status"]
    verbs: ["get", "list", "watch"]
  
  # Tensorboard CRD - Auto-create Tensorboard for each job
  - apiGroups: ["tensorboard.kubeflow.org"]
    resources: ["tensorboards"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  
  # Jobs - For standard Kubernetes batch jobs
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  
  # PVC - Storage for training data and outputs
  - apiGroups: [""]
    resources: ["persistentvolumeclaims"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  
  # Pods - For log access and status monitoring
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list", "watch"]
  
  # Secrets - Read MinIO credentials from user namespace
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get", "list", "watch"]
  
  # Namespaces - List Kubeflow profile namespaces
  - apiGroups: [""]
    resources: ["namespaces"]
    verbs: ["get", "list", "watch"]

---
# Bind ClusterRole to ServiceAccount
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ml-platform-backend-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ml-platform-backend-role
subjects:
  - kind: ServiceAccount
    name: ml-platform-backend
    namespace: kubeflow
```

**Why ClusterRole (not Role):**
- Jobs are created in **user namespaces** (kubeflow-user-example-com)
- The backend runs in **kubeflow namespace**
- ClusterRole allows cross-namespace access
- Multi-tenancy is enforced at application level (middleware filters by user's namespace)

---

### 6. Inherited Kubeflow Components

The Training Jobs application leverages several existing Kubeflow components:

#### 6.1 Tensorboard Controller

When a training job is created, the backend automatically creates a Tensorboard resource:

```go
// converter/converter.go
func (c *Converter) CreateTensorboard(req *models.TrainingJobRequest, jobName string) *unstructured.Unstructured {
    return &unstructured.Unstructured{
        Object: map[string]interface{}{
            "apiVersion": "tensorboard.kubeflow.org/v1alpha1",
            "kind":       "Tensorboard",
            "metadata": map[string]interface{}{
                "name":      jobName,
                "namespace": req.Namespace,
                "labels": map[string]interface{}{
                    "app":        "ml-platform",
                    "training-job": jobName,
                },
            },
            "spec": map[string]interface{}{
                "logspath": fmt.Sprintf("s3://%s/%s/tensorboard/", 
                    req.Namespace, jobName),
            },
        },
    }
}
```

The Kubeflow Tensorboard Controller:
1. Watches for Tensorboard CRD creation
2. Creates a pod running TensorBoard
3. Creates a VirtualService for access at `/tensorboards/{namespace}/{name}/`
4. User can view training logs at the standard Kubeflow Tensorboards UI

#### 6.2 Profile Controller & Namespace Management

User namespaces are managed by Kubeflow Profile Controller:
- Creates namespaces when users are added to Kubeflow
- Manages RBAC for namespace access
- Creates default resources (ServiceAccounts, etc.)

Our application relies on:
- Namespace existence (created by Profile Controller)
- Namespace naming convention (kubeflow-{sanitized-email})
- User-namespace bindings (queried via `/api/workgroup/env-info`)

#### 6.3 MinIO Storage Integration

The backend reads MinIO credentials from user namespaces:

```go
// storage/minio.go
func NewMinIOClientFromK8s(ctx context.Context, k8sClient kubernetes.Interface, namespace string) (*MinIOClient, error) {
    // Read secret from user's namespace
    secret, err := k8sClient.CoreV1().Secrets(namespace).Get(ctx, "minio-secret", metav1.GetOptions{})
    if err != nil {
        return nil, fmt.Errorf("failed to get minio-secret in namespace %s: %w", namespace, err)
    }

    accessKey := string(secret.Data["AWS_ACCESS_KEY_ID"])
    secretKey := string(secret.Data["AWS_SECRET_ACCESS_KEY"])
    endpoint := string(secret.Data["S3_ENDPOINT"])
    
    // Create MinIO client
    client, err := minio.New(endpoint, &minio.Options{
        Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
        Secure: false,
    })
    
    return &MinIOClient{client: client}, nil
}
```

**Required Secret in each user namespace:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: minio-secret
  namespace: kubeflow-user-example-com
type: Opaque
stringData:
  AWS_ACCESS_KEY_ID: "minio-access-key"
  AWS_SECRET_ACCESS_KEY: "minio-secret-key"
  S3_ENDPOINT: "minio.minio.svc.cluster.local:9000"
```

#### 6.4 Ray Operator (KubeRay)

Training jobs are created as RayJob CRDs managed by KubeRay Operator:

```go
// converter/converter.go
func (c *Converter) ConvertToRayJobV2(req *models.TrainingJobRequest, jobID string) (*unstructured.Unstructured, error) {
    rayJob := &unstructured.Unstructured{
        Object: map[string]interface{}{
            "apiVersion": "ray.io/v1",
            "kind":       "RayJob",
            "metadata": map[string]interface{}{
                "name":      jobID,
                "namespace": req.Namespace,
                "labels": map[string]interface{}{
                    "app":       "ml-platform",
                    "algorithm": req.Algorithm.AlgorithmName,
                },
            },
            "spec": map[string]interface{}{
                "entrypoint":           req.Entrypoint,
                "shutdownAfterJobFinishes": true,
                "ttlSecondsAfterFinished": 86400,
                "rayClusterSpec": map[string]interface{}{
                    "headGroupSpec": headSpec,
                    "workerGroupSpecs": []interface{}{workerSpec},
                },
            },
        },
    }
    return rayJob, nil
}
```

KubeRay Operator:
1. Creates Ray cluster (head + workers)
2. Submits the training job
3. Monitors job status
4. Cleans up resources after completion

---

## Features

### Job Management
- **Create Jobs**: Configure and submit XGBoost training jobs with Ray
- **List Jobs**: View all training jobs in the current namespace
- **Delete Jobs**: Remove completed or failed jobs
- **Status Monitoring**: Real-time job status updates

### Data Configuration
- **File Upload**: Upload CSV files directly from browser (max 50MB)
- **Object Storage**: Reference data from MinIO/S3 buckets
- **Multiple Channels**: Support for train, validation, and test data channels
- **Auto Feature Detection**: Parse CSV headers for feature/label selection

### Hyperparameters
- **41 XGBoost Parameters**: Complete hyperparameter configuration
- **Organized Sections**: Training, Learning, Regularization, Tree, DART, Tweedie
- **Default Values**: Sensible defaults with full customization
- **Custom Parameters**: Add arbitrary key-value hyperparameters

### Output & Monitoring
- **Model Artifacts**: Automatic output path configuration
- **Checkpointing**: Optional checkpoint storage configuration
- **TensorBoard**: Auto-created TensorBoard for each job
- **Logs Path**: S3-based log storage for TensorBoard visualization

---

## Prerequisites

- Kubernetes cluster (1.24+)
- Kubeflow 1.8+ installed
- KubeRay Operator installed
- Kubeflow TensorBoard Controller installed
- MinIO or S3-compatible storage
- `kubectl` configured

---

## Installation

### Deploy to Kubeflow

```bash
# 1. Apply RBAC permissions
kubectl apply -f manifests/rbac.yaml

# 2. Apply Istio VirtualService for Central Dashboard integration
kubectl apply -f manifests/istio.yaml

# 3. Deploy backend and frontend
kubectl apply -f manifests/deployment.yaml

# 4. (Optional) Add menu entry to Central Dashboard
# Edit the centraldashboard-angular-config ConfigMap to add Training Jobs link
kubectl edit configmap centraldashboard-angular-config -n kubeflow
```

### Create MinIO Secret in User Namespaces

For each user namespace that will use the Training Jobs UI:

```bash
kubectl create secret generic minio-secret \
  --from-literal=AWS_ACCESS_KEY_ID=your-access-key \
  --from-literal=AWS_SECRET_ACCESS_KEY=your-secret-key \
  --from-literal=S3_ENDPOINT=minio.minio.svc.cluster.local:9000 \
  -n kubeflow-user-example-com
```

### Verify Deployment

```bash
# Check pods are running
kubectl get pods -n kubeflow -l app=ml-platform

# Check services
kubectl get svc -n kubeflow | grep -E "(ml-platform|training-job)"

# Check VirtualService
kubectl get virtualservice -n kubeflow kf-training-job-ui
```

### Access the UI

After deployment, access through Kubeflow Central Dashboard:
```
https://<kubeflow-url>/training-job/
```

---

## Building from Source

### Backend

```bash
cd backend

# Install dependencies
go mod download

# Run locally (requires KUBECONFIG)
go run main.go

# Build binary
CGO_ENABLED=0 GOOS=linux go build -o ml-platform-backend .

# Build Docker image
docker build -t loihoangthanh1411/ml-platform-backend:v2.1.0 .

# Push to registry
docker push loihoangthanh1411/ml-platform-backend:v2.1.0
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Development mode (with proxy to local backend)
npm run dev

# Production build
npm run build

# Build Docker image
docker build -t loihoangthanh1411/ml-platform-frontend:v2.1.0 .

# Push to registry
docker push loihoangthanh1411/ml-platform-frontend:v2.1.0
```

---

## Configuration

### Environment Variables

#### Backend
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `KUBECONFIG` | Path to kubeconfig (optional) | In-cluster config |
| `POD_NAMESPACE` | Current pod namespace | Injected by Kubernetes |

#### Frontend
| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API URL | `http://localhost:8080/api/v1` |

---

## API Reference

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/jobs | Create training job |
| GET | /api/v1/jobs | List training jobs |
| GET | /api/v1/jobs/:id | Get specific job |
| DELETE | /api/v1/jobs/:id | Delete job |
| GET | /api/v1/jobs/:id/status | Get job status |
| GET | /api/v1/jobs/:id/logs | Get job logs |
| POST | /api/v1/upload | Upload file to MinIO |
| GET | /api/v1/namespaces | List namespaces |
| GET | /health | Health check |

See [samples/api-request.json](samples/api-request.json) for request format.

---

## Project Structure

```
trainingjobs/
├── backend/                          # Go backend service
│   ├── main.go                       # Entry point + route setup
│   ├── config/
│   │   └── config.go                 # K8s client configuration
│   ├── handlers/
│   │   └── handlers.go               # HTTP handlers
│   ├── converter/
│   │   └── converter.go              # RayJob/Tensorboard CRD conversion
│   ├── k8s/
│   │   └── client.go                 # Kubernetes API client
│   ├── middleware/
│   │   └── auth.go                   # Kubeflow auth middleware ★
│   ├── models/
│   │   └── models.go                 # Data models
│   ├── storage/
│   │   └── minio.go                  # MinIO client
│   ├── Dockerfile
│   └── Makefile
│
├── frontend/                         # React frontend
│   ├── src/
│   │   ├── App.tsx                   # Router
│   │   ├── main.tsx                  # Entry point + BrowserRouter ★
│   │   ├── pages/
│   │   │   ├── CreateTrainingJobPage.tsx
│   │   │   └── TrainingJobsListPage.tsx
│   │   ├── lib/
│   │   │   ├── api-service.ts        # Backend API client
│   │   │   ├── kubeflow-api.ts       # Kubeflow integration ★
│   │   │   └── backend-converter.ts  # Request conversion
│   │   └── types/
│   │       └── training-job.ts
│   ├── nginx.conf                    # Nginx config (no X-Frame-Options) ★
│   ├── vite.config.ts                # Vite config (base path) ★
│   ├── Dockerfile
│   └── package.json
│
├── manifests/
│   ├── deployment.yaml               # Deployments + Services
│   ├── istio.yaml                    # VirtualService + AuthorizationPolicy ★
│   └── rbac.yaml                     # ServiceAccount + ClusterRole ★
│
├── samples/
│   ├── api-request.json              # API request example
│   ├── training-config.json          # TRAINING_CONFIG JSON
│   └── rayjob-template.yaml          # Generated RayJob template
│
└── README.md

★ = Key Kubeflow integration files
```

---

## Samples

See the [samples/](samples/) directory for:
- `api-request.json` - Complete API request example
- `training-config.json` - TRAINING_CONFIG JSON mounted to RayJob pods
- `rayjob-template.yaml` - Generated RayJob CRD template

---

## Summary: Key Kubeflow Integration Points

| Component | Integration Point | File |
|-----------|------------------|------|
| Central Dashboard | Menu entry in ConfigMap | `centraldashboard-angular/manifests/base/configmap.yaml` |
| Frontend Routing | Base path `/training-job` | `frontend/vite.config.ts`, `frontend/src/main.tsx` |
| Frontend Auth | Fetch `/api/workgroup/env-info` | `frontend/src/lib/kubeflow-api.ts` |
| Backend Auth | Extract `kubeflow-userid` header | `backend/middleware/auth.go` |
| Namespace Mapping | Email → kubeflow-{sanitized-email} | `backend/middleware/auth.go` |
| Traffic Routing | VirtualService through kubeflow-gateway | `manifests/istio.yaml` |
| Access Control | AuthorizationPolicy requiring auth header | `manifests/istio.yaml` |
| Cross-namespace Access | ClusterRole for RayJobs, Tensorboards | `manifests/rbac.yaml` |
| Storage | Read minio-secret from user namespace | `backend/storage/minio.go` |
| Monitoring | Create Tensorboard CRD | `backend/converter/converter.go` |

---

## License

Apache License 2.0
