import { useMemo, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { JobStatus, StoredJob } from "@/types/training-job";
import { jobsApi, APIError } from "@/lib/api-service";
import { convertFromBackendResponse } from "@/lib/backend-converter";
import { useNamespacePoller } from "@/lib/hooks";
import { Loader2, RefreshCw } from "lucide-react";

const JOB_STATUSES = new Set<JobStatus>(["Pending", "Running", "Succeeded", "Failed", "Stopped"]);

function CreateButton({ namespace }: { namespace?: string }) {
  const [searchParams] = useSearchParams();
  // Ensure namespace is in the query params
  const params = new URLSearchParams(searchParams);
  if (namespace) {
    params.set('ns', namespace);
  }
  const qs = params.toString();
  const href = qs ? `/create?${qs}` : "/create";
  return (
    <Button asChild size="lg">
      <Link to={href}>Create Training Job</Link>
    </Button>
  );
}

export default function TrainingJobsListPage() {
  // Use the namespace-aware polling hook
  // This automatically:
  // 1. Subscribes to namespace changes from Central Dashboard
  // 2. Re-queries when namespace changes
  // 3. Uses exponential backoff for efficient polling (1s → 2s → 4s → 8s)
  const {
    data: jobs,
    error: pollerError,
    isLoading: loading,
    namespaceString,
    isIframed,
    refresh,
  } = useNamespacePoller<StoredJob[]>(
    // Fetch function - called with current namespace
    async (ns: string) => {
      try {
        const backendJobs = await jobsApi.list(ns);
        return backendJobs.map(job => convertFromBackendResponse(job));
      } catch (backendError) {
        console.error("Failed to load from backend:", backendError);
        throw backendError;
      }
    },
    {
      // Process and validate data
      processData: (data) => {
        if (!Array.isArray(data)) return [];
        return data.filter((item): item is StoredJob => {
          if (!item || typeof item !== "object") return false;
          const maybe = item as Partial<StoredJob>;
          return (
            typeof maybe.id === "string" &&
            typeof maybe.algorithm === "string" &&
            typeof maybe.createdAt === "number" &&
            typeof maybe.priority === "number" &&
            typeof maybe.status === "string" &&
            JOB_STATUSES.has(maybe.status as JobStatus)
          );
        });
      },
      // Polling configuration - matches other crud-web-apps
      config: {
        initialInterval: 1000,  // Start at 1 second
        maxInterval: 8000,       // Max 8 seconds
        retries: 1,
      },
    }
  );

  // Convert error to string for display
  const error = pollerError ? (pollerError instanceof APIError ? pollerError.message : pollerError.message) : null;

  const handleRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  const sortedJobs = useMemo(() => [...(jobs || [])].sort((a, b) => b.createdAt - a.createdAt), [jobs]);

  return (
    <div className="min-h-screen bg-white">
      {/* Modern Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Training Jobs</h1>
              <p className="mt-2 text-lg text-slate-600">
                Monitor your ML training jobs and track their progress
                {namespaceString && (
                  <span className="ml-2 text-sm text-slate-500">
                    (Namespace: <span className="font-medium">{namespaceString}</span>)
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
                title="Refresh jobs list"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <CreateButton namespace={namespaceString} />
            </div>
          </div>
          
          {/* Stats Bar */}
          {sortedJobs.length > 0 && (
            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-600">Total Jobs</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{sortedJobs.length}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 px-4 py-3">
                <p className="text-sm text-emerald-700">Succeeded</p>
                <p className="mt-1 text-2xl font-bold text-emerald-900">
                  {sortedJobs.filter((j) => j.status === "Succeeded" || j.jobStatus === "SUCCEEDED").length}
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 px-4 py-3">
                <p className="text-sm text-blue-700">Running</p>
                <p className="mt-1 text-2xl font-bold text-blue-900">
                  {sortedJobs.filter((j) => j.status === "Running" || j.jobStatus === "RUNNING").length}
                </p>
              </div>
              <div className="rounded-lg bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-700">Pending</p>
                <p className="mt-1 text-2xl font-bold text-amber-900">
                  {sortedJobs.filter((j) => j.status === "Pending" || j.jobStatus === "PENDING").length}
                </p>
              </div>
              <div className="rounded-lg bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">Failed</p>
                <p className="mt-1 text-2xl font-bold text-red-900">
                  {sortedJobs.filter((j) => j.status === "Failed" || j.jobStatus === "FAILED").length}
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-10">
        {/* Connection Status Banner (only show when not in iframe) */}
        {!isIframed && namespaceString && (
          <div className="mb-6 rounded-lg bg-blue-50 border border-blue-200 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <span className="text-blue-600 text-xl">ℹ️</span>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-blue-900">Standalone Mode</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Running outside Central Dashboard. Using namespace: <strong>{namespaceString}</strong>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mb-6 rounded-lg bg-yellow-50 border border-yellow-200 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <span className="text-yellow-600 text-xl">⚠️</span>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-yellow-900">Backend Connection Issue</h3>
                <p className="text-sm text-yellow-700 mt-1">{error}</p>
                <p className="text-xs text-yellow-600 mt-1">Jobs will be automatically refreshed when connection is restored.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
                className="flex-shrink-0"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Retry
              </Button>
            </div>
          </div>
        )}

        {loading && sortedJobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
              <p className="text-slate-600">Loading jobs{namespaceString ? ` from ${namespaceString}` : ''}...</p>
            </CardContent>
          </Card>
        ) : sortedJobs.length === 0 ? (
          <Card className="border-2 border-dashed border-slate-300">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center">
                <span className="text-3xl text-slate-400">+</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">No jobs yet</h3>
              <p className="text-slate-600 mb-6 max-w-md">
                {namespaceString 
                  ? `No training jobs found in namespace "${namespaceString}". Create your first training job to get started.`
                  : "Get started by creating your first training job. Click the button above to configure and submit a new job."
                }
              </p>
              <CreateButton namespace={namespaceString} />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedJobs.map((job) => {
              // Helper function to get status badge color
              const getStatusBadgeClass = (status: string) => {
                switch (status) {
                  case "SUCCEEDED":
                    return "bg-emerald-100 text-emerald-800 border-emerald-300";
                  case "RUNNING":
                    return "bg-blue-100 text-blue-800 border-blue-300";
                  case "FAILED":
                    return "bg-red-100 text-red-800 border-red-300";
                  case "PENDING":
                    return "bg-amber-100 text-amber-800 border-amber-300";
                  case "STOPPED":
                    return "bg-gray-100 text-gray-800 border-gray-300";
                  default:
                    return "bg-slate-100 text-slate-800 border-slate-300";
                }
              };
              
              return (
                <Card key={job.id} className="shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-3">
                      {/* Job Header with Status and Times */}
                      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-slate-900 truncate">{job.id}</h3>
                          <p className="text-sm text-slate-600 mt-1">
                            <span className="font-medium">Algorithm:</span> {job.algorithm}
                            {job.namespace && (
                              <span className="ml-3">
                                <span className="font-medium">Namespace:</span> {job.namespace}
                              </span>
                            )}
                          </p>
                        </div>
                        
                        {/* Status Badge */}
                        {(job.jobStatus || job.status) && (
                          <Badge
                            className={`shrink-0 ${getStatusBadgeClass(job.jobStatus || job.status.toUpperCase())}`}
                          >
                            {(job.jobStatus || job.status) === "SUCCEEDED" && <span className="mr-1">✓</span>}
                            {(job.jobStatus || job.status) === "RUNNING" && <span className="mr-1">●</span>}
                            {(job.jobStatus || job.status) === "FAILED" && <span className="mr-1">✕</span>}
                            {(job.jobStatus || job.status) === "PENDING" && <span className="mr-1">⏳</span>}
                            {(job.jobStatus || job.status) === "STOPPED" && <span className="mr-1">⏹</span>}
                            {job.jobStatus || job.status}
                          </Badge>
                        )}
                        
                        {/* Time Info - Same Row */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                          {job.startTime && (
                            <div className="flex items-center gap-1">
                              <span className="text-slate-500">Start:</span>
                              <span className="font-medium text-slate-900">
                                {new Date(job.startTime).toLocaleString()}
                              </span>
                            </div>
                          )}
                          {job.endTime && (
                            <div className="flex items-center gap-1">
                              <span className="text-slate-500">End:</span>
                              <span className="font-medium text-slate-900">
                                {new Date(job.endTime).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Deployment Status (if exists) */}
                      {job.deploymentStatus && (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="shrink-0 text-xs">
                            Deploy: {job.deploymentStatus}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
