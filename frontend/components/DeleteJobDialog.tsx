'use client';

import { useState } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface DeleteJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  jobName?: string;
  isDeleting?: boolean;
}

export default function DeleteJobDialog({
  open,
  onOpenChange,
  onConfirm,
  jobName,
  isDeleting = false,
}: DeleteJobDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <>
      {/* Glassmorphism Backdrop */}
      <div 
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
        onClick={() => !isDeleting && onOpenChange(false)}
      />
      
      {/* Modal Content */}
      <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="relative mx-4 overflow-hidden rounded-2xl border border-white/20 bg-white/90 backdrop-blur-xl shadow-2xl">
          {/* Gradient Accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />
          
          {/* Close Button */}
          <button
            onClick={() => !isDeleting && onOpenChange(false)}
            disabled={isDeleting}
            className="absolute right-4 top-4 rounded-full p-1 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Content */}
          <div className="p-6 pt-8">
            {/* Icon */}
            <div className="mb-5 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-20" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-orange-600 shadow-lg">
                  <AlertTriangle className="h-8 w-8 text-white" strokeWidth={2.5} />
                </div>
              </div>
            </div>

            {/* Title */}
            <h2 className="mb-2 text-center text-2xl font-bold text-gray-900">
              Delete Job?
            </h2>

            {/* Description */}
            <div className="mb-6 text-center">
              <p className="text-sm text-gray-600 leading-relaxed">
                Are you sure you want to delete{' '}
                {jobName ? (
                  <>
                    <span className="font-semibold text-gray-900 break-all">
                      "{jobName}"
                    </span>
                    ?
                  </>
                ) : (
                  'this job?'
                )}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                This action cannot be undone and will permanently delete all associated files.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => onOpenChange(false)}
                disabled={isDeleting}
                className="flex-1 rounded-xl border-2 border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isDeleting}
                className="flex-1 rounded-xl bg-gradient-to-br from-red-600 to-red-700 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:from-red-700 hover:to-red-800 hover:shadow-xl disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-500"
              >
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Trash2 className="h-4 w-4 animate-pulse" />
                    Deleting...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
