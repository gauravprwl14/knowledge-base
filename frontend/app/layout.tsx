import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Voice App - Speech to Text',
  description: 'Transcribe audio and video files to text',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          <header className="bg-white border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 py-4">
              <nav className="flex items-center justify-between">
                <a href="/" className="text-xl font-bold text-gray-900">
                  Voice App
                </a>
                <div className="flex gap-4">
                  <a
                    href="/"
                    className="text-gray-600 hover:text-gray-900 px-3 py-2"
                  >
                    Upload
                  </a>
                  <a
                    href="/jobs"
                    className="text-gray-600 hover:text-gray-900 px-3 py-2"
                  >
                    Jobs
                  </a>
                </div>
              </nav>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
