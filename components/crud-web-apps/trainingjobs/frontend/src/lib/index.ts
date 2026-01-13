/**
 * Library exports for Kubeflow CRUD Web App integration.
 * 
 * This follows the same patterns as other crud-web-apps (Jupyter, Volumes, TensorBoards).
 */

// Namespace service - for Central Dashboard communication
export { namespaceService } from './namespace';
export type { NamespaceValue, NamespaceCallback } from './namespace';
export {
  PARENT_CONNECTED_EVENT,
  APP_CONNECTED_EVENT,
  NAMESPACE_SELECTED_EVENT,
  ALL_NAMESPACES_EVENT,
  MESSAGE,
} from './namespace';

// Polling service - for exponential backoff polling
export {
  pollerService,
  createPoller,
  Poller,
} from './poller';
export type {
  PollerConfig,
  PollerResult,
  PollerCallback,
  FetchFunction,
} from './poller';

// React hooks - for using services in components
export {
  useNamespace,
  usePoller,
  useNamespacePoller,
} from './hooks';

// API service - for backend communication
export {
  jobsApi,
  healthApi,
  uploadApi,
  APIError,
} from './api-service';
export type {
  BackendTrainingJobRequest,
  BackendTrainingJobResponse,
} from './api-service';

// Kubeflow API helpers
export {
  getKubeflowEnvInfo,
  getDefaultNamespace,
  getCurrentNamespace,
  getCurrentUser,
} from './kubeflow-api';
export type {
  KubeflowEnvInfo,
  NamespaceBinding,
} from './kubeflow-api';
