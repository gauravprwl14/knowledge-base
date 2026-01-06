// Frontend hot reload test - polling-based file watching enabled for Podman
'use client';

import { useState, useEffect } from 'react';
import FileUpload from '@/components/FileUpload';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import Toast, { ToastType } from '@/components/Toast';

interface UploadResult {
  job_id: string;
  filename: string;
  status: string;
}

export default function HomePage() {
  const [provider, setProvider] = useState('whisper');
  const [model, setModel] = useState('base');
  const [language, setLanguage] = useState('');
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  const handleUpload = async (files: File[]) => {
    setIsUploading(true);
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
            const errorText = await response.text();
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
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Upload Audio/Video
        </h1>
        <p className="text-gray-600">
          Upload your files to transcribe them to text
        </p>
      </div>

      {/* Settings */}
      <div className="p-6 space-y-4 bg-white border border-gray-200 rounded-lg">
        <h2 className="text-lg font-semibold text-gray-900">Settings</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700">
              Provider
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="whisper">Whisper (Local)</option>
              <option value="groq">Groq (Cloud)</option>
              <option value="deepgram">Deepgram (Cloud)</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <label className="block mb-1 text-sm font-medium text-gray-700">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
        <div className="flex items-center gap-3 p-4 border border-red-200 rounded-lg bg-red-50">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Upload results */}
      {results.length > 0 && (
        <div className="p-6 bg-white border border-gray-200 rounded-lg">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Uploaded Files
          </h2>
          <div className="space-y-3">
            {results.map((result, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-medium">{result.filename}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">
                    Job: {result.job_id.slice(0, 8)}...
                  </span>
                  <a
                    href={`/jobs`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    View Status →
                  </a>
                </div>
              </div>
            ))}
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
