'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  FileText,
  Download,
  Languages,
  Copy,
  CheckCircle,
  ArrowLeft,
  XCircle,
  Loader2,
} from 'lucide-react';
import Toast, { ToastType } from '@/components/Toast';

interface Transcription {
  id: string;
  job_id: string;
  text: string;
  language: string;
  confidence: number;
  word_count: number;
  processing_time_ms: number;
  provider: string;
  model_name: string;
  created_at: string;
}

export default function ResultPage() {
  const params = useParams();
  const jobId = params.id as string;
  const [apiKey, setApiKey] = useState<string>('');

  const [transcription, setTranscription] = useState<Transcription | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  // Load API key from environment on mount
  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        setApiKey(data.apiKey || '');
      } catch (error) {
        console.error('Failed to load API key:', error);
      }
    };
    
    loadApiKey();
  }, []);

  // Translation state
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [translationProvider, setTranslationProvider] = useState('openai');
  const [translatedText, setTranslatedText] = useState('');
  const [translating, setTranslating] = useState(false);

  const fetchTranscription = async () => {
    if (!apiKey || !jobId) return;

    setLoading(true);
    setError('');

    try {
      // First get job to find transcription
      const jobResponse = await fetch(`/api/v1/jobs/${jobId}`, {
        headers: { 'X-API-Key': apiKey },
      });

      if (!jobResponse.ok) {
        throw new Error('Failed to fetch job');
      }

      // Then get transcriptions
      const transResponse = await fetch('/api/v1/transcriptions', {
        headers: { 'X-API-Key': apiKey },
      });

      if (!transResponse.ok) {
        throw new Error('Failed to fetch transcriptions');
      }

      const data = await transResponse.json();
      const trans = data.transcriptions.find(
        (t: Transcription) => t.job_id === jobId
      );

      if (trans) {
        setTranscription(trans);
      } else {
        setError('Transcription not found');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTranscription();
  }, [apiKey, jobId]);

  const copyToClipboard = () => {
    if (transcription) {
      navigator.clipboard.writeText(transcription.text);
      setCopied(true);
      showToast('Transcription copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTranslate = async () => {
    if (!transcription || !apiKey) return;

    setTranslating(true);

    try {
      const response = await fetch(
        `/api/v1/transcriptions/${transcription.id}/translate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify({
            target_language: targetLanguage,
            provider: translationProvider,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      const data = await response.json();
      setTranslatedText(data.translated_text);
      showToast('Translation completed successfully', 'success');
    } catch (err: any) {
      setError(err.message);
      showToast(`Translation failed: ${err.message}`, 'error');
    } finally {
      setTranslating(false);
    }
  };

  const downloadTranscription = (format: string) => {
    if (!transcription || !apiKey) return;
    window.open(
      `/api/v1/transcriptions/${transcription.id}/download?format=${format}`,
      '_blank'
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Back Navigation */}
      <div className="flex items-center gap-4">
        <a
          href="/jobs"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors px-3 py-2 rounded-lg hover:bg-gray-100"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back to Jobs</span>
        </a>
      </div>

      {/* Page Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Transcription Result
        </h1>
        <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-4 border border-gray-200">
          <span className="text-sm font-medium text-gray-600">Job ID:</span>
          <code className="text-sm text-gray-800 font-mono bg-white px-4 py-2 rounded border border-gray-200 flex-1">
            {jobId}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(jobId);
              showToast('Job ID copied to clipboard', 'success');
            }}
            className="text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Copy Job ID"
          >
            <Copy className="w-5 h-5" />
          </button>
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

      {loading && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading transcription...</p>
        </div>
      )}

      {transcription && (
        <>
          {/* Metadata Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Details
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                <p className="text-sm text-blue-700 font-medium mb-1">Language</p>
                <p className="text-lg font-bold text-blue-900">{transcription.language || 'N/A'}</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                <p className="text-sm text-green-700 font-medium mb-1">Word Count</p>
                <p className="text-lg font-bold text-green-900">{transcription.word_count.toLocaleString()}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                <p className="text-sm text-purple-700 font-medium mb-1">Confidence</p>
                <p className="text-lg font-bold text-purple-900">
                  {transcription.confidence
                    ? `${(transcription.confidence * 100).toFixed(1)}%`
                    : 'N/A'}
                </p>
              </div>
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                <p className="text-sm text-orange-700 font-medium mb-1">Processing Time</p>
                <p className="text-lg font-bold text-orange-900">
                  {transcription.processing_time_ms
                    ? `${(transcription.processing_time_ms / 1000).toFixed(2)}s`
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Transcription Text Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Transcription
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyToClipboard}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    copied
                      ? 'bg-green-100 text-green-700 border border-green-200'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
                  }`}
                >
                  {copied ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={() => downloadTranscription('txt')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  TXT
                </button>
                <button
                  onClick={() => downloadTranscription('json')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  JSON
                </button>
                <button
                  onClick={() => downloadTranscription('srt')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  SRT
                </button>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200 max-h-96 overflow-y-auto">
              <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-base">
                {transcription.text}
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
              <span className="bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                Provider: <span className="font-medium text-gray-700">{transcription.provider}</span>
              </span>
              <span className="bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                Model: <span className="font-medium text-gray-700">{transcription.model_name}</span>
              </span>
            </div>
          </div>

          {/* Translation Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <Languages className="w-5 h-5" />
              Translate
            </h2>

            <div className="flex flex-wrap items-end gap-4 mb-6">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Language
                </label>
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
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

              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Provider
                </label>
                <select
                  value={translationProvider}
                  onChange={(e) => setTranslationProvider(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="openai">OpenAI GPT</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>

              <button
                onClick={handleTranslate}
                disabled={translating}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors shadow-sm min-w-[140px]"
              >
                {translating ? (
                  <span className="flex items-center gap-2 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Translating...
                  </span>
                ) : (
                  'Translate'
                )}
              </button>
            </div>

            {translatedText && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-blue-900">Translated Text</p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(translatedText);
                      showToast('Translation copied to clipboard', 'success');
                    }}
                    className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-100 transition-colors"
                    title="Copy translation"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-base">
                  {translatedText}
                </p>
              </div>
            )}
          </div>
        </>
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
