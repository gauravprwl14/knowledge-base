'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import FileUpload from '@/components/FileUpload';
import { AlertCircle, CheckCircle, List, Loader2 } from 'lucide-react';
import Toast, { ToastType } from '@/components/Toast';

interface UploadResult {
  job_id: string;
  filename: string;
  status: string;
}

export default function TranscribePage() {
  const router = useRouter();
  const [provider, setProvider] = useState('whisper');
  const [model, setModel] = useState('base');
  const [language, setLanguage] = useState('');
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadingState, setShowUploadingState] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  const handleUpload = async (files: File[]) => {
    setIsUploading(true);
    setShowUploadingState(true);
    setError('');
    const uploadResults: UploadResult[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('provider', provider);
        if (model) formData.append('model_name', model);
        if (language) formData.append('language', language);

        const response = await fetch('/api/v1/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          let errorMessage = 'Upload failed';
          const contentType = response.headers.get('content-type');

          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.detail || 'Upload failed';
          } else {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }

          throw new Error(errorMessage);
        }

        const result = await response.json();
        uploadResults.push({
          job_id: result.job_id,
          filename: file.name,
          status: 'queued',
        });
        successCount++;
      } catch (err: any) {
        setError(err.message || 'Upload failed');
        showToast(`Failed to upload ${file.name}: ${err.message}`, 'error');
        failCount++;
      }
    }

    if (successCount > 0) {
      showToast(
        `${successCount} file${successCount > 1 ? 's' : ''} uploaded successfully`,
        'success'
      );
    }

    setResults((prev) => [...uploadResults, ...prev]);
    setIsUploading(false);
    setTimeout(() => setShowUploadingState(false), 300);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-h2 text-text-primary">Upload Audio/Video</h1>
          <p className="text-body-lg text-text-secondary">
            Upload your files to transcribe them to text
          </p>
        </div>
        <button
          onClick={() => router.push('/jobs')}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors shadow-sm"
        >
          <List className="w-4 h-4" />
          View Jobs
        </button>
      </div>

      {/* Settings */}
      <div className="p-6 space-y-4 border rounded-lg bg-dark-surface border-dark-border">
        <h2 className="font-semibold text-h4 text-text-primary">Settings</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block mb-1 font-medium text-body-sm text-text-secondary">
              Provider
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-dark-bg border-dark-border text-text-primary focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
            >
              <option value="whisper">Whisper (Local)</option>
              <option value="groq">Groq (Cloud)</option>
              <option value="deepgram">Deepgram (Cloud)</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 font-medium text-body-sm text-text-secondary">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-dark-bg border-dark-border text-text-primary focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
            >
              {provider === 'whisper' && (
                <>
                  <option value="tiny">Tiny (Fastest)</option>
                  <option value="base">Base</option>
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large-v3">Large V3 (Best)</option>
                  <option value="large-v3-turbo">Large V3 Turbo</option>
                </>
              )}
              {provider === 'groq' && (
                <>
                  <option value="whisper-large-v3-turbo">
                    Whisper Large V3 Turbo
                  </option>
                  <option value="whisper-large-v3">Whisper Large V3</option>
                </>
              )}
              {provider === 'deepgram' && (
                <>
                  <option value="nova-3">Nova 3 (English)</option>
                  <option value="nova-2">Nova 2 (Multilingual)</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block mb-1 font-medium text-body-sm text-text-secondary">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-dark-bg border-dark-border text-text-primary focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
            >
              <option value="">Auto-detect</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="pt">Portuguese</option>
              <option value="ru">Russian</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="zh">Chinese</option>
              <option value="ar">Arabic</option>
              <option value="hi">Hindi</option>
            </select>
          </div>
        </div>
      </div>

      {/* Upload area */}
      <FileUpload onUpload={handleUpload} isUploading={isUploading} />

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-3 p-4 border rounded-lg border-error bg-error/10">
          <AlertCircle className="w-5 h-5 text-error" />
          <p className="text-error">{error}</p>
        </div>
      )}

      {/* Upload results with skeleton loader */}
      {(showUploadingState || results.length > 0) && (
        <div className="p-6 border rounded-lg bg-dark-surface border-dark-border">
          <h2 className="mb-4 font-semibold text-h4 text-text-primary">
            Uploaded Files
          </h2>
          <div className="space-y-3">
            {showUploadingState && results.length === 0 ? (
              // Skeleton loader
              <>  {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-dark-bg animate-pulse">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-5 h-5 bg-gray-600 rounded-full" />
                      <div className="h-4 bg-gray-600 rounded w-48" />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="h-3 bg-gray-600 rounded w-24" />
                      <div className="h-3 bg-gray-600 rounded w-20" />
                    </div>
                  </div>
                ))}
              </>
            ) : (
              results.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-dark-bg"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-success" />
                    <span className="font-medium text-text-primary">
                      {result.filename}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-body-sm text-text-secondary">
                      Job: {result.job_id.slice(0, 8)}...
                    </span>
                    <button
                      onClick={() => router.push('/jobs')}
                      className="font-medium text-body-sm text-primary-400 hover:text-primary-500 transition-colors"
                    >
                      View Status →
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
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
