'use client';

import { Trash2 } from 'lucide-react';

export default function JunkPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#93c5fd]/10 border border-[#93c5fd]/20 mb-6">
        <Trash2 className="w-8 h-8 text-[#93c5fd]" />
      </div>
      <h1 className="text-2xl font-bold text-slate-100 mb-2">Junk</h1>
      <p className="text-slate-400 text-sm max-w-sm">
        Review and clean up low-quality or irrelevant files. Coming soon.
      </p>
    </div>
  );
}
