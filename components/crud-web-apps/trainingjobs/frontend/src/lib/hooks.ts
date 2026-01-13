/**
 * React Hooks for Kubeflow CRUD Web Apps.
 * These hooks follow the same patterns as other crud-web-apps (Angular version).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { namespaceService, NamespaceValue } from './namespace';
import { createPoller, Poller, PollerConfig, PollerResult } from './poller';

/**
 * Hook to subscribe to namespace changes from Central Dashboard.
 * 
 * Usage:
 * ```tsx
 * const { namespace, isArray, isConnected } = useNamespace();
 * 
 * useEffect(() => {
 *   // Fetch data when namespace changes
 *   fetchDataForNamespace(namespace);
 * }, [namespace]);
 * ```
 */
export function useNamespace() {
  const [namespace, setNamespace] = useState<NamespaceValue>(
    namespaceService.getCurrentNamespace() || ''
  );

  useEffect(() => {
    // Subscribe to namespace changes
    const unsubscribe = namespaceService.subscribe((ns) => {
      setNamespace(ns);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    namespace,
    isArray: Array.isArray(namespace),
    isConnected: namespaceService.isConnected(),
    isIframed: namespaceService.isIframed(),
    // Helper to get namespace as string (first one if array)
    namespaceString: Array.isArray(namespace) ? namespace[0] || '' : namespace,
    // Update namespace manually (for standalone mode)
    updateNamespace: namespaceService.updateSelectedNamespace.bind(namespaceService),
  };
}

/**
 * Hook for polling with exponential backoff.
 * 
 * Usage:
 * ```tsx
 * const { data, error, isLoading, refresh, reset } = usePoller(
 *   () => api.getJobs(namespace),
 *   { enabled: !!namespace }
 * );
 * ```
 */
export function usePoller<T>(
  fetchFn: () => Promise<T>,
  options: {
    enabled?: boolean;
    config?: PollerConfig;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
  } = {}
) {
  const { enabled = true, config, onSuccess, onError } = options;
  
  const [result, setResult] = useState<PollerResult<T>>({
    data: null,
    error: null,
    isLoading: enabled,
  });

  const pollerRef = useRef<Poller<T> | null>(null);
  const fetchFnRef = useRef(fetchFn);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const configRef = useRef(config);

  // Update refs synchronously (without causing effect re-runs)
  fetchFnRef.current = fetchFn;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  configRef.current = config;

  // Handle poller lifecycle - only depends on `enabled`
  useEffect(() => {
    if (!enabled) {
      // Stop poller if disabled
      if (pollerRef.current) {
        pollerRef.current.stop();
        pollerRef.current = null;
      }
      return;
    }

    // Create new poller
    const callback = (newResult: PollerResult<T>) => {
      setResult(newResult);
      
      if (newResult.data && !newResult.error && onSuccessRef.current) {
        onSuccessRef.current(newResult.data);
      }
      
      if (newResult.error && onErrorRef.current) {
        onErrorRef.current(newResult.error);
      }
    };

    pollerRef.current = createPoller<T>(
      () => fetchFnRef.current(),
      callback,
      configRef.current
    );
    pollerRef.current.start();

    return () => {
      if (pollerRef.current) {
        pollerRef.current.stop();
        pollerRef.current = null;
      }
    };
  // IMPORTANT: Only depend on `enabled` flag
  // fetchFn and config are accessed via refs
  }, [enabled]);

  // Refresh function
  const refresh = useCallback(() => {
    if (pollerRef.current) {
      pollerRef.current.refresh();
    }
  }, []);

  // Reset function (resets interval to initial)
  const reset = useCallback(() => {
    if (pollerRef.current) {
      pollerRef.current.reset();
    }
  }, []);

  // Stop function
  const stop = useCallback(() => {
    if (pollerRef.current) {
      pollerRef.current.stop();
    }
  }, []);

  return {
    ...result,
    refresh,
    reset,
    stop,
  };
}

/**
 * Combined hook for namespace-aware polling.
 * Automatically re-polls when namespace changes.
 * 
 * Usage:
 * ```tsx
 * const { data, error, isLoading, namespace, refresh } = useNamespacePoller(
 *   (ns) => api.getJobs(ns),
 *   { processData: (jobs) => jobs.map(transformJob) }
 * );
 * ```
 */
export function useNamespacePoller<T, R = T>(
  fetchFn: (namespace: string) => Promise<T>,
  options: {
    config?: PollerConfig;
    processData?: (data: T) => R;
    onSuccess?: (data: R) => void;
    onError?: (error: Error) => void;
    enabled?: boolean;
  } = {}
) {
  const { config, processData, onSuccess, onError, enabled = true } = options;
  const { namespace, namespaceString, isArray, isConnected, isIframed } = useNamespace();

  const [result, setResult] = useState<{
    data: R | null;
    error: Error | null;
    isLoading: boolean;
  }>({
    data: null,
    error: null,
    isLoading: true,
  });

  const pollerRef = useRef<Poller<T> | null>(null);
  const fetchFnRef = useRef(fetchFn);
  const processDataRef = useRef(processData);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  
  // Memoize config to prevent effect re-runs
  const configRef = useRef(config);

  // Update refs (without causing effect re-runs)
  fetchFnRef.current = fetchFn;
  processDataRef.current = processData;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  configRef.current = config;

  // Handle namespace changes - restart polling
  // Only depends on namespaceString and enabled - NOT on config or other callbacks
  useEffect(() => {
    // Track if effect is still mounted
    let isMounted = true;
    
    // Stop existing poller
    if (pollerRef.current) {
      pollerRef.current.stop();
      pollerRef.current = null;
    }

    // Don't start if no namespace or disabled
    if (!namespaceString || !enabled) {
      setResult({
        data: null,
        error: null,
        isLoading: false,
      });
      return;
    }

    // Reset state for new namespace
    setResult({
      data: null,
      error: null,
      isLoading: true,
    });

    // Create callback that checks if still mounted
    const callback = (pollerResult: PollerResult<T>) => {
      // Skip if unmounted (prevents state updates after cleanup)
      if (!isMounted) return;
      
      let processedData: R | null = null;
      
      if (pollerResult.data !== null) {
        processedData = processDataRef.current
          ? processDataRef.current(pollerResult.data)
          : (pollerResult.data as unknown as R);
      }

      const newResult = {
        data: processedData,
        error: pollerResult.error,
        isLoading: pollerResult.isLoading,
      };

      setResult(newResult);

      if (processedData && !pollerResult.error && onSuccessRef.current) {
        onSuccessRef.current(processedData);
      }

      if (pollerResult.error && onErrorRef.current) {
        onErrorRef.current(pollerResult.error);
      }
    };

    // Create and start poller using namespaceString directly
    // Note: "All namespaces" mode would need special handling if required
    pollerRef.current = createPoller<T>(
      () => fetchFnRef.current(namespaceString),
      callback,
      configRef.current
    );
    pollerRef.current.start();

    return () => {
      isMounted = false;
      if (pollerRef.current) {
        pollerRef.current.stop();
        pollerRef.current = null;
      }
    };
  // IMPORTANT: Only depend on namespace changes and enabled flag
  // NOT on config, fetchFn, etc. - those are accessed via refs
  }, [namespaceString, enabled]);

  // Refresh function
  const refresh = useCallback(() => {
    if (pollerRef.current) {
      pollerRef.current.refresh();
    }
  }, []);

  // Reset function
  const reset = useCallback(() => {
    if (pollerRef.current) {
      pollerRef.current.reset();
    }
  }, []);

  return {
    ...result,
    namespace,
    namespaceString,
    isArray,
    isConnected,
    isIframed,
    refresh,
    reset,
  };
}

export default {
  useNamespace,
  usePoller,
  useNamespacePoller,
};
