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

export default function ResultPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [apiKey, setApiKey] = useState('');
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
    } catch (err: any) {
      setError(err.message);
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
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <a
          href="/jobs"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Jobs
        </a>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Transcription Result
        </h1>
        <p className="text-gray-600">Job ID: {jobId}</p>
      </div>

      {/* API Key Input */}
      {!transcription && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading...</p>
        </div>
      )}

      {transcription && (
        <>
          {/* Metadata */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Details
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Language</p>
                <p className="font-medium">{transcription.language || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Word Count</p>
                <p className="font-medium">{transcription.word_count}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Confidence</p>
                <p className="font-medium">
                  {transcription.confidence
                    ? `${(transcription.confidence * 100).toFixed(1)}%`
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Processing Time</p>
                <p className="font-medium">
                  {transcription.processing_time_ms
                    ? `${(transcription.processing_time_ms / 1000).toFixed(2)}s`
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Transcription Text */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Transcription
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm"
                >
                  {copied ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => downloadTranscription('txt')}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm"
                >
                  <Download className="w-4 h-4" />
                  TXT
                </button>
                <button
                  onClick={() => downloadTranscription('json')}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm"
                >
                  <Download className="w-4 h-4" />
                  JSON
                </button>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
              <p className="text-gray-800 whitespace-pre-wrap">
                {transcription.text}
              </p>
            </div>
          </div>

          {/* Translation */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Languages className="w-5 h-5" />
              Translate
            </h2>

            <div className="flex items-end gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Language
                </label>
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md"
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Provider
                </label>
                <select
                  value={translationProvider}
                  onChange={(e) => setTranslationProvider(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="openai">OpenAI GPT</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>

              <button
                onClick={handleTranslate}
                disabled={translating}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300"
              >
                {translating ? 'Translating...' : 'Translate'}
              </button>
            </div>

            {translatedText && (
              <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <p className="text-gray-800 whitespace-pre-wrap">
                  {translatedText}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
