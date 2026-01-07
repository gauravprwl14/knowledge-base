'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  FileText,
  Copy,
  Trash2,
} from 'lucide-react';
import TranscriptionSidebar from '@/components/TranscriptionSidebar';
import Toast, { ToastType } from '@/components/Toast';
import DeleteJobDialog from '@/components/DeleteJobDialog';
import { JobService, TranscriptionService } from '@/services';
import { getErrorMessage, logError } from '@/lib/errors';

interface Job {
  id: string;
  status: string;
  job_type: string;
  provider: string;
  model_name: string;
  original_filename: string;
  progress: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="w-5 h-5 text-yellow-500" />,
  processing: <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />,
  completed: <CheckCircle className="w-5 h-5 text-green-500" />,
  failed: <XCircle className="w-5 h-5 text-red-500" />,
  cancelled: <XCircle className="w-5 h-5 text-gray-500" />,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalJobs, setTotalJobs] = useState(0);

  // Sidebar state
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Bulk selection state
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<{ id: string; name: string } | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // Infinite scroll observer
  const observerTarget = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  const fetchJobs = async (pageNum: number = 1, append: boolean = false) => {
    if (loading) return;
    
    setLoading(true);
    setError('');

    try {
      console.log(`Fetching jobs page ${pageNum}...`);
      const data = await JobService.listJobs({
        page: pageNum,
        page_size: 20
      });

      console.log('Jobs received:', data.jobs.length, 'Total:', data.total);
      
      if (append) {
        setJobs(prev => [...prev, ...data.jobs]);
      } else {
        setJobs(data.jobs);
      }
      
      setTotalJobs(data.total);
      setHasMore(data.jobs.length === 20 && (pageNum * 20) < data.total);
    } catch (err: any) {
      const errorMessage = getErrorMessage(err);
      console.error('Error fetching jobs:', err);
      logError(err, 'fetchJobs');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchJobs(nextPage, true);
    }
  }, [hasMore, loading, page]);

  useEffect(() => {
    fetchJobs(1, false);
  }, []);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMore, loading, loadMore]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => fetchJobs(1, false), 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Relative time for recent jobs
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    // Full date for older jobs
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleViewResult = (jobId: string) => {
    // Close sidebar first if open
    if (isSidebarOpen) {
      setIsSidebarOpen(false);
    }
    
    // Set the job ID
    setSelectedJobId(jobId);
    
    // Open sidebar after a brief delay to ensure state is updated
    setTimeout(() => {
      setIsSidebarOpen(true);
    }, 50);
  };

  const handleToggleSelect = (jobId: string) => {
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(jobId)) {
      newSelected.delete(jobId);
    } else {
      newSelected.add(jobId);
    }
    setSelectedJobs(newSelected);
  };

  const handleSelectAll = () => {
    const completedJobs = jobs.filter((job) => job.status === 'completed');
    if (selectedJobs.size === completedJobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(completedJobs.map((job) => job.id)));
    }
  };

  const handleCopySingle = async (jobId: string) => {
    try {
      const transcription = await TranscriptionService.getTranscriptionByJobId(jobId);

      if (transcription) {
        await navigator.clipboard.writeText(transcription.text);
        showToast('Transcription copied to clipboard', 'success');
      } else {
        showToast('Transcription not found', 'error');
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      console.error('Failed to copy:', err);
      logError(err, 'handleCopySingle');
      showToast(`Failed to copy transcription: ${errorMessage}`, 'error');
    }
  };

  const handleBulkCopy = async () => {
    if (selectedJobs.size === 0) return;

    setCopying(true);
    try {
      const data = await TranscriptionService.listTranscriptions();

      // Build combined text with filename separators
      let combinedText = '';
      for (const jobId of Array.from(selectedJobs)) {
        const transcription = data.transcriptions.find(
          (t: any) => t.job_id === jobId
        );
        const job = jobs.find((j) => j.id === jobId);

        if (transcription && job) {
          combinedText += `\n${'='.repeat(80)}\n`;
          combinedText += `FILE: ${job.original_filename}\n`;
          combinedText += `JOB ID: ${jobId}\n`;
          combinedText += `${'='.repeat(80)}\n\n`;
          combinedText += transcription.text;
          combinedText += `\n\n`;
        }
      }

      await navigator.clipboard.writeText(combinedText.trim());
      showToast(`${selectedJobs.size} transcriptions copied to clipboard`, 'success');
      setSelectedJobs(new Set());
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      console.error('Failed to copy:', err);
      logError(err, 'handleBulkCopy');
      showToast(`Failed to copy transcriptions: ${errorMessage}`, 'error');
    } finally {
      setCopying(false);
    }
  };

  const handleDeleteClick = (jobId: string, jobName: string) => {
    setJobToDelete({ id: jobId, name: jobName });
    setDeleteDialogOpen(true);
  };

  const handleBulkDelete = async () => {
    if (selectedJobs.size === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedJobs.size} selected job(s)? This action cannot be undone.`
    );

    if (!confirmed) return;

    const jobIdsToDelete = Array.from(selectedJobs);
    
    // Mark all as deleting
    setDeleting(prev => {
      const newSet = new Set(prev);
      jobIdsToDelete.forEach(id => newSet.add(id));
      return newSet;
    });

    try {
      const result = await JobService.bulkDeleteJobs(jobIdsToDelete);
      console.log('Bulk delete result:', result);

      // Remove deleted jobs from local state
      setJobs(prev => prev.filter(j => !selectedJobs.has(j.id)));
      setSelectedJobs(new Set());

      // Update total count
      setTotalJobs(prev => prev - result.deleted_count);

      // Show appropriate toast based on results
      if (result.failed_count > 0) {
        // Partial success - show warning with details
        const failedDetails = result.failed_jobs
          .map((failure: any) => {
            const jobId = failure.data?.job_id || 'Unknown';
            const message = failure.message || 'Unknown error';
            return `Job ${jobId.substring(0, 8)}: ${message}`;
          })
          .join('\n');
        
        showToast(
          `${result.deleted_count} job(s) deleted, ${result.failed_count} failed`,
          'warning'
        );
        
        // Log failed jobs for debugging
        console.error('Failed jobs:', result.failed_jobs);
        result.failed_jobs.forEach((failure: any) => {
          logError(
            `Bulk delete failure - ${failure.errorCode}: ${failure.message}`,
            'handleBulkDelete',
            failure.data
          );
        });
      } else {
        // Complete success
        showToast(`${result.deleted_count} job(s) deleted successfully`, 'success');
      }
    } catch (err: any) {
      const errorMessage = getErrorMessage(err);
      console.error('Error bulk deleting jobs:', err);
      logError(err, 'handleBulkDelete');
      showToast(`Failed to delete jobs: ${errorMessage}`, 'error');
    } finally {
      // Clear deleting state
      setDeleting(prev => {
        const newSet = new Set(prev);
        jobIdsToDelete.forEach(id => newSet.delete(id));
        return newSet;
      });
    }
  };

  const handleDeleteJob = async () => {
    if (!jobToDelete) return;

    const jobId = jobToDelete.id;
    setDeleting(prev => new Set(prev).add(jobId));

    try {
      const result = await JobService.deleteJob(jobId);
      console.log('Job deleted:', result);

      // Remove from local state
      setJobs(prev => prev.filter(j => j.id !== jobId));
      setSelectedJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });

      // Update total count
      setTotalJobs(prev => prev - 1);
      showToast('Job deleted successfully', 'success');
    } catch (err: any) {
      const errorMessage = getErrorMessage(err);
      console.error('Error deleting job:', err);
      logError(err, 'handleDeleteJob');
      showToast(`Failed to delete job: ${errorMessage}`, 'error');
    } finally {
      setDeleting(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header Section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Jobs</h1>
            <p className="text-gray-400">View and manage your transcription jobs</p>
          </div>
          {totalJobs > 0 && (
            <div className="text-sm text-gray-400 bg-dark-surface px-4 py-2 rounded-lg border border-dark-border">
              Showing <span className="font-semibold text-white">{jobs.length}</span> of{' '}
              <span className="font-semibold text-white">{totalJobs}</span> jobs
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            {selectedJobs.size > 0 && (
              <>
                <button
                  onClick={handleBulkCopy}
                  disabled={copying}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg text-white font-medium transition-colors shadow-sm"
                >
                  <Copy className="w-4 h-4" />
                  {copying ? 'Copying...' : `Copy ${selectedJobs.size} Selected`}
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={Array.from(selectedJobs).some(id => deleting.has(id))}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg text-white font-medium transition-colors shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  {Array.from(selectedJobs).some(id => deleting.has(id)) 
                    ? 'Deleting...' 
                    : `Delete ${selectedJobs.size} Selected`
                  }
                </button>
                <button
                  onClick={() => setSelectedJobs(new Set())}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear selection
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="font-medium">Auto-refresh</span>
            </label>
            <button
              onClick={() => {
                setPage(1);
                setJobs([]);
                fetchJobs(1, false);
              }}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 disabled:bg-gray-50 rounded-lg text-gray-700 font-medium transition-colors border border-gray-200"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Jobs Table */}
      {jobs.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
          <div className="overflow-auto flex-1">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      checked={
                        jobs.filter((j) => j.status === 'completed').length > 0 &&
                        selectedJobs.size === jobs.filter((j) => j.status === 'completed').length
                      }
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      title="Select all completed jobs"
                    />
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Job ID
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    File
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Provider
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      {job.status === 'completed' && (
                        <input
                          type="checkbox"
                          checked={selectedJobs.has(job.id)}
                          onChange={() => handleToggleSelect(job.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-gray-700 font-mono bg-gray-100 px-2 py-1 rounded border border-gray-200">
                          {job.id.slice(0, 8)}...
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(job.id);
                            showToast('Job ID copied to clipboard', 'success');
                          }}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                          title="Copy full Job ID"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {STATUS_ICONS[job.status]}
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            STATUS_COLORS[job.status]
                          }`}
                        >
                          {job.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <p className="font-medium text-gray-900 truncate max-w-xs" title={job.original_filename || 'Unknown'}>
                          {job.original_filename || 'Unknown'}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="font-medium">{job.provider}</div>
                      <div className="text-xs text-gray-500">{job.model_name || 'default'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-36">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                job.progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-700 min-w-[3rem] text-right">
                            {job.progress}%
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      {job.status === 'completed' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewResult(job.id)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1 transition-colors"
                          >
                            <FileText className="w-4 h-4" />
                            View
                          </button>
                          <button
                            onClick={() => handleCopySingle(job.id)}
                            className="text-gray-600 hover:text-gray-800 p-1 rounded hover:bg-gray-100 transition-colors"
                            title="Copy transcription"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(job.id, job.original_filename)}
                            disabled={deleting.has(job.id)}
                            className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                            title="Delete job"
                          >
                            {deleting.has(job.id) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      )}
                      {job.status === 'failed' && (
                        <div className="flex items-center gap-2">
                          <span className="text-red-600 text-xs bg-red-50 px-2 py-1 rounded flex-1 truncate max-w-xs" title={job.error_message || ''}>
                            {job.error_message?.slice(0, 50)}...
                          </span>
                          <button
                            onClick={() => handleDeleteClick(job.id, job.original_filename)}
                            disabled={deleting.has(job.id)}
                            className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                            title="Delete job"
                          >
                            {deleting.has(job.id) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      )}
                      {['pending', 'processing', 'cancelled'].includes(job.status) && (
                        <button
                          onClick={() => handleDeleteClick(job.id, job.original_filename)}
                          disabled={deleting.has(job.id)}
                          className="text-gray-600 hover:text-gray-800 p-1 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors"
                          title="Delete job"
                        >
                          {deleting.has(job.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Infinite scroll trigger */}
          <div ref={observerTarget} className="h-16 flex items-center justify-center border-t border-gray-200 bg-gray-50">
            {hasMore && !loading && (
              <p className="text-sm text-gray-500">Scroll to load more...</p>
            )}
            {loading && hasMore && (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading more jobs...</span>
              </div>
            )}
            {!hasMore && jobs.length > 0 && (
              <p className="text-sm text-gray-400">All jobs loaded</p>
            )}
          </div>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex-1">
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg animate-pulse">
                <div className="w-10 h-10 bg-gray-200 rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
                <div className="w-20 h-8 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium mb-2">No jobs found</p>
          <p className="text-gray-400 text-sm">Start by uploading a file to transcribe</p>
        </div>
      )}
      
      {/* Transcription Sidebar */}
      {selectedJobId && (
        <TranscriptionSidebar
          key={selectedJobId}
          jobId={selectedJobId}
          isOpen={isSidebarOpen}
          onClose={() => {
            setIsSidebarOpen(false);
            // Clear selectedJobId after sidebar closes for clean state
            setTimeout(() => setSelectedJobId(null), 300);
          }}
        />
      )}

      {/* Delete Job Dialog */}
      <DeleteJobDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteJob}
        jobName={jobToDelete?.name}
        isDeleting={jobToDelete ? deleting.has(jobToDelete.id) : false}
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
