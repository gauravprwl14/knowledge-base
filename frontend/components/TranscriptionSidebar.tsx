'use client';

import { useEffect, useState } from 'react';
import {
  X,
  Copy,
  Download,
  CheckCircle,
  Languages,
  FileText,
} from 'lucide-react';

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

interface TranscriptionSidebarProps {
  jobId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function TranscriptionSidebar({
  jobId,
  isOpen,
  onClose,
}: TranscriptionSidebarProps) {
  const [apiKey, setApiKey] = useState<string>('');
  const [transcription, setTranscription] = useState<Transcription | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Translation state
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [translationProvider, setTranslationProvider] = useState('openai');
  const [translatedText, setTranslatedText] = useState('');
  const [translating, setTranslating] = useState(false);

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

  useEffect(() => {
    if (isOpen && jobId) {
      fetchTranscription();
    }
  }, [isOpen, jobId]);

  const fetchTranscription = async () => {
    if (!apiKey || !jobId) return;

    setLoading(true);
    setError('');

    try {
      // Get transcriptions
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

  const copyToClipboard = async () => {
    if (transcription) {
      try {
        await navigator.clipboard.writeText(transcription.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTranslating(false);
    }
  };

  const downloadTranscription = (format: string) => {
    if (!transcription || !apiKey) return;
    const url = `/api/v1/transcriptions/${transcription.id}/download?format=${format}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-${transcription.id}.${format}`;
    a.click();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Glassmorphism Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-gradient-to-br from-white/95 to-gray-50/95 backdrop-blur-xl shadow-2xl z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
        {/* Header with Gradient */}
        <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-gray-200/50 px-6 py-5 flex items-center justify-between z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Transcription Result
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">Job ID: {jobId.slice(0, 8)}...</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 transition-all p-2 rounded-xl hover:bg-gray-100/80 hover:shadow-md active:scale-95"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading && (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading transcription...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {transcription && (
            <>
              {/* Metadata */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-2xl p-5 border border-gray-200/50 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-blue-500" />
                  Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/60 rounded-xl p-3 border border-gray-200/50">
                    <p className="text-xs font-medium text-gray-500 mb-1">Language</p>
                    <p className="text-base font-semibold text-gray-900">
                      {transcription.language || 'N/A'}
                    </p>
                  </div>
                  <div className="bg-white/60 rounded-xl p-3 border border-gray-200/50">
                    <p className="text-xs font-medium text-gray-500 mb-1">Word Count</p>
                    <p className="text-base font-semibold text-gray-900">
                      {transcription.word_count}
                    </p>
                  </div>
                  <div className="bg-white/60 rounded-xl p-3 border border-gray-200/50">
                    <p className="text-xs font-medium text-gray-500 mb-1">Confidence</p>
                    <p className="text-base font-semibold text-gray-900">
                      {transcription.confidence
                        ? `${(transcription.confidence * 100).toFixed(1)}%`
                        : 'N/A'}
                    </p>
                  </div>
                  <div className="bg-white/60 rounded-xl p-3 border border-gray-200/50">
                    <p className="text-xs font-medium text-gray-500 mb-1">Processing Time</p>
                    <p className="text-base font-semibold text-gray-900">
                      {transcription.processing_time_ms
                        ? `${(transcription.processing_time_ms / 1000).toFixed(2)}s`
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Transcription Text */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <div className="h-1 w-1 rounded-full bg-blue-500" />
                    Transcription
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg text-xs font-semibold shadow-md hover:shadow-lg transition-all active:scale-95"
                    >
                      {copied ? (
                        <CheckCircle className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={() => downloadTranscription('txt')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-200 hover:border-gray-300 rounded-lg text-xs font-semibold shadow-sm hover:shadow transition-all active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5" />
                      TXT
                    </button>
                    <button
                      onClick={() => downloadTranscription('json')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-200 hover:border-gray-300 rounded-lg text-xs font-semibold shadow-sm hover:shadow transition-all active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5" />
                      JSON
                    </button>
                    <button
                      onClick={() => downloadTranscription('srt')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-200 hover:border-gray-300 rounded-lg text-xs font-semibold shadow-sm hover:shadow transition-all active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5" />
                      SRT
                    </button>
                  </div>
                </div>
                <div className="bg-white border-2 border-gray-200/50 rounded-2xl p-5 max-h-96 overflow-y-auto shadow-inner">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {transcription.text}
                  </p>
                </div>
              </div>

              {/* Translation */}
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-5 border border-purple-200/50">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500">
                    <Languages className="w-4 h-4 text-white" />
                  </div>
                  Translate
                </h3>

                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-gray-700 mb-2">
                        Target Language
                      </label>
                      <select
                        value={targetLanguage}
                        onChange={(e) => setTargetLanguage(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 bg-white rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all font-medium"
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

                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-gray-700 mb-2">
                        Provider
                      </label>
                      <select
                        value={translationProvider}
                        onChange={(e) =>
                          setTranslationProvider(e.target.value)
                        }
                        className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 bg-white rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all font-medium"
                      >
                        <option value="openai">OpenAI GPT</option>
                        <option value="gemini">Google Gemini</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleTranslate}
                    disabled={translating}
                    className="px-5 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-xl transition-all disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed active:scale-95"
                  >
                    {translating ? (
                      <span className="flex items-center justify-center gap-2">
                        <Languages className="w-4 h-4 animate-pulse" />
                        Translating...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Languages className="w-4 h-4" />
                        Translate
                      </span>
                    )}
                  </button>
                </div>

                {translatedText && (
                  <div className="mt-4 bg-white border-2 border-purple-200/50 rounded-2xl p-5 max-h-96 overflow-y-auto shadow-inner">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {translatedText}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
