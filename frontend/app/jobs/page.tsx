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
      const response = await fetch(`/api/v1/jobs?page=${pageNum}&page_size=20`);

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch jobs: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Jobs received:', data.jobs.length, 'Total:', data.total);
      
      if (append) {
        setJobs(prev => [...prev, ...data.jobs]);
      } else {
        setJobs(data.jobs);
      }
      
      setTotalJobs(data.total);
      setHasMore(data.jobs.length === 20 && (pageNum * 20) < data.total);
    } catch (err: any) {
      console.error('Error fetching jobs:', err);
      setError(err.message);
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
    setSelectedJobId(jobId);
    setIsSidebarOpen(true);
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
      const response = await fetch('/api/v1/transcriptions');

      if (!response.ok) throw new Error('Failed to fetch transcriptions');

      const data = await response.json();
      const transcription = data.transcriptions.find(
        (t: any) => t.job_id === jobId
      );

      if (transcription) {
        await navigator.clipboard.writeText(transcription.text);
        showToast('Transcription copied to clipboard', 'success');
      } else {
        showToast('Transcription not found', 'error');
      }
    } catch (err) {
      console.error('Failed to copy:', err);
      showToast('Failed to copy transcription', 'error');
    }
  };

  const handleBulkCopy = async () => {
    if (selectedJobs.size === 0) return;

    setCopying(true);
    try {
      const response = await fetch('/api/v1/transcriptions');

      if (!response.ok) throw new Error('Failed to fetch transcriptions');

      const data = await response.json();

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
      console.error('Failed to copy:', err);
      showToast('Failed to copy transcriptions', 'error');
    } finally {
      setCopying(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job? This will also delete the associated files.')) {
      return;
    }

    setDeleting(prev => new Set(prev).add(jobId));

    try {
      const response = await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete job');
      }

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
      console.error('Error deleting job:', err);
      showToast(`Failed to delete job: ${err.message}`, 'error');
    } finally {
      setDeleting(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Jobs</h1>
          <p className="text-gray-600">View and manage your transcription jobs</p>
        </div>
        <div className="flex items-center gap-4">
          {selectedJobs.size > 0 && (
            <button
              onClick={handleBulkCopy}
              disabled={copying}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-medium"
            >
              <Copy className="w-4 h-4" />
              {copying ? 'Copying...' : `Copy ${selectedJobs.size} Selected`}
            </button>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            onClick={() => {
              setPage(1);
              setJobs([]);
              fetchJobs(1, false);
            }}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Job count */}
        {totalJobs > 0 && (
          <div className="text-sm text-gray-600">
            Showing {jobs.length} of {totalJobs} jobs
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Jobs list */}
      {jobs.length > 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      jobs.filter((j) => j.status === 'completed').length > 0 &&
                      selectedJobs.size === jobs.filter((j) => j.status === 'completed').length
                    }
                    onChange={handleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Job ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  File
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Provider
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    {job.status === 'completed' && (
                      <input
                        type="checkbox"
                        checked={selectedJobs.has(job.id)}
                        onChange={() => handleToggleSelect(job.id)}
                        className="rounded"
                      />
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded">
                        {job.id.slice(0, 8)}...
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(job.id);
                          showToast('Job ID copied to clipboard', 'success');
                        }}
                        className="text-gray-400 hover:text-gray-600"
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
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_COLORS[job.status]
                        }`}
                      >
                        {job.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900 truncate max-w-xs">
                      {job.original_filename || 'Unknown'}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {job.provider} / {job.model_name || 'default'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-32">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-500">
                          {job.progress}%
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(job.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    {job.status === 'completed' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewResult(job.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
                        >
                          <FileText className="w-4 h-4" />
                          View Result
                        </button>
                        <button
                          onClick={() => handleCopySingle(job.id)}
                          className="text-gray-600 hover:text-gray-800 text-sm font-medium flex items-center gap-1"
                          title="Copy transcription"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          disabled={deleting.has(job.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
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
                        <span className="text-red-600 text-sm flex-1">
                          {job.error_message?.slice(0, 50)}...
                        </span>
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          disabled={deleting.has(job.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
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
                        onClick={() => handleDeleteJob(job.id)}
                        disabled={deleting.has(job.id)}
                        className="text-gray-600 hover:text-gray-800 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
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
          
          {/* Infinite scroll trigger */}
          <div ref={observerTarget} className="h-10 flex items-center justify-center">
            {hasMore && !loading && (
              <p className="text-sm text-gray-400">Scroll to load more...</p>
            )}
            {loading && hasMore && (
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            )}
          </div>
        </div>
      ) : loading ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">Loading...</p>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">No jobs found</p>
        </div>
      )}
      
      {/* Transcription Sidebar */}
      {selectedJobId && (
        <TranscriptionSidebar
          jobId={selectedJobId}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
      )}

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
