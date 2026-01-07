import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { FileText, BookOpen, Cloud, Search, Upload } from 'lucide-react';

export default function DashboardPage() {
  const t = useTranslations('Navigation');

  const features = [
    {
      icon: FileText,
      title: 'Transcribe',
      description: 'Upload and transcribe audio/video files',
      href: '/en/transcribe',
      color: 'text-primary-400',
    },
    {
      icon: BookOpen,
      title: 'Knowledge Base',
      description: 'Manage your knowledge entries',
      href: '/en/knowledge',
      color: 'text-success',
    },
    {
      icon: Cloud,
      title: 'Google Drive',
      description: 'Sync with Google Drive',
      href: '/en/drive',
      color: 'text-info',
    },
    {
      icon: Search,
      title: 'Search',
      description: 'Search across all your content',
      href: '/en/search',
      color: 'text-warning',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="mb-2 text-h2 text-text-primary">
          Welcome to Voice App
        </h1>
        <p className="text-body-lg text-text-secondary">
          Your all-in-one platform for transcription and knowledge management
        </p>
      </div>

      {/* Feature Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <Link
              key={feature.href}
              href={feature.href}
              className="p-6 transition-all border rounded-lg bg-dark-surface border-dark-border hover:border-dark-borderHover hover:bg-dark-surfaceHover group"
            >
              <Icon className={`w-10 h-10 mb-4 ${feature.color}`} />
              <h3 className="mb-2 font-semibold text-body-lg text-text-primary">
                {feature.title}
              </h3>
              <p className="text-body-sm text-text-secondary">
                {feature.description}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="p-6 border rounded-lg bg-dark-surface border-dark-border">
        <h2 className="mb-4 font-semibold text-h4 text-text-primary">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/en/transcribe"
            className="flex items-center gap-2 px-4 py-2 font-medium transition-colors rounded-lg bg-primary-400 text-dark-bg hover:bg-primary-500"
          >
            <Upload className="w-4 h-4" />
            Upload File
          </Link>
          <Link
            href="/en/knowledge"
            className="flex items-center gap-2 px-4 py-2 font-medium transition-colors border rounded-lg text-text-primary border-dark-border hover:bg-dark-surfaceHover"
          >
            <BookOpen className="w-4 h-4" />
            New Knowledge Entry
          </Link>
        </div>
      </div>
    </div>
  );
}
