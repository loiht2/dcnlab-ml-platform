/**
 * Namespace Service for communicating with Kubeflow Central Dashboard.
 * This follows the same pattern as other crud-web-apps (Angular version).
 * 
 * Communication is done via PostMessage API when the app is iframed
 * inside the Central Dashboard.
 */

// Event types for communication with Central Dashboard
export const PARENT_CONNECTED_EVENT = 'parent-connected';
export const APP_CONNECTED_EVENT = 'iframe-connected';
export const NAMESPACE_SELECTED_EVENT = 'namespace-selected';
export const ALL_NAMESPACES_EVENT = 'all-namespaces';
export const MESSAGE = 'message';

export type NamespaceValue = string | string[];

export type NamespaceCallback = (namespace: NamespaceValue) => void;

interface NamespaceServiceState {
  currentNamespace: string;
  allNamespaces: string[];
  isConnected: boolean;
  callbacks: Set<NamespaceCallback>;
}

class NamespaceService {
  private state: NamespaceServiceState = {
    currentNamespace: '',
    allNamespaces: [],
    isConnected: false,
    callbacks: new Set(),
  };

  private messageListener: ((event: MessageEvent) => void) | null = null;

  constructor() {
    this.init();
  }

  /**
   * Initialize communication with Central Dashboard
   */
  private init() {
    // Check if we're in an iframe
    const isIframed = window.self !== window.top;

    if (isIframed) {
      this.attachListenerToDashboard();
    } else {
      // Not in iframe, try to get namespace from URL or use default
      this.handleStandaloneMode();
    }
  }

  /**
   * Handle standalone mode (not in iframe)
   */
  private handleStandaloneMode() {
    // Try to get namespace from URL query params
    const urlParams = new URLSearchParams(window.location.search);
    const nsFromUrl = urlParams.get('ns');
    
    if (nsFromUrl) {
      this.updateSelectedNamespace(nsFromUrl);
    } else {
      // Use default namespace
      this.updateSelectedNamespace('kubeflow-user-example-com');
    }
  }

  /**
   * Attach listener to receive messages from Central Dashboard
   */
  private attachListenerToDashboard() {
    this.messageListener = this.onMessageReceived.bind(this);
    window.addEventListener(MESSAGE, this.messageListener);
    
    // Notify Central Dashboard that we're connected
    window.parent.postMessage(
      { type: APP_CONNECTED_EVENT },
      window.parent.origin || '*'
    );
  }

  /**
   * Handle messages from Central Dashboard
   */
  private onMessageReceived(event: MessageEvent) {
    const { data } = event;
    
    if (!data || typeof data !== 'object') {
      return;
    }

    switch (data.type) {
      case PARENT_CONNECTED_EVENT:
        this.state.isConnected = true;
        break;
        
      case NAMESPACE_SELECTED_EVENT:
        if (typeof data.value === 'string') {
          this.updateSelectedNamespace(data.value);
        }
        break;
        
      case ALL_NAMESPACES_EVENT:
        if (Array.isArray(data.value)) {
          this.updateAllSelectedNamespaces(data.value);
        }
        break;
    }
  }

  /**
   * Update the selected namespace and notify all subscribers
   */
  public updateSelectedNamespace(namespace: string) {
    // Only update if namespace actually changed
    if (namespace && namespace.length > 0 && namespace !== this.state.currentNamespace) {
      this.state.currentNamespace = namespace;
      this.notifyCallbacks(namespace);
      
      // Update URL query param for bookmarking
      this.updateUrlParam(namespace);
    }
  }

  /**
   * Update when "All namespaces" is selected
   */
  public updateAllSelectedNamespaces(namespaces: string[]) {
    // Only update if namespaces actually changed
    const currentStr = JSON.stringify(this.state.allNamespaces);
    const newStr = JSON.stringify(namespaces);
    if (currentStr !== newStr) {
      this.state.allNamespaces = namespaces;
      this.notifyCallbacks(namespaces);
    }
  }

  /**
   * Update URL query parameter without page reload
   */
  private updateUrlParam(namespace: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('ns', namespace);
    window.history.replaceState({}, '', url.toString());
  }

  /**
   * Notify all registered callbacks of namespace change
   */
  private notifyCallbacks(namespace: NamespaceValue) {
    this.state.callbacks.forEach((callback) => {
      try {
        callback(namespace);
      } catch (error) {
        console.error('Error in namespace callback:', error);
      }
    });
  }

  /**
   * Subscribe to namespace changes
   * @returns Unsubscribe function
   */
  public subscribe(callback: NamespaceCallback): () => void {
    this.state.callbacks.add(callback);
    
    // Immediately call with current namespace if available
    if (this.state.currentNamespace) {
      callback(this.state.currentNamespace);
    } else if (this.state.allNamespaces.length > 0) {
      callback(this.state.allNamespaces);
    }

    // Return unsubscribe function
    return () => {
      this.state.callbacks.delete(callback);
    };
  }

  /**
   * Get current namespace (single)
   */
  public getCurrentNamespace(): string {
    return this.state.currentNamespace;
  }

  /**
   * Get all namespaces (when "All namespaces" is selected)
   */
  public getAllNamespaces(): string[] {
    return this.state.allNamespaces;
  }

  /**
   * Check if connected to Central Dashboard
   */
  public isConnected(): boolean {
    return this.state.isConnected;
  }

  /**
   * Check if we're in iframe mode
   */
  public isIframed(): boolean {
    return window.self !== window.top;
  }

  /**
   * Cleanup when unmounting
   */
  public destroy() {
    if (this.messageListener) {
      window.removeEventListener(MESSAGE, this.messageListener);
      this.messageListener = null;
    }
    this.state.callbacks.clear();
  }
}

// Export singleton instance
export const namespaceService = new NamespaceService();

export default namespaceService;
