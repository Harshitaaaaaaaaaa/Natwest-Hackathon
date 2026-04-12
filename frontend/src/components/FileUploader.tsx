import React, { useState, useRef } from 'react';
import { useAppContext } from '../stores/appStore';
import {
  Upload, Database, ChevronRight, CheckCircle2, LogOut,
  FileText, Cpu, BarChart2, AlertCircle, Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SchemaPreview {
  metric_col: string;
  date_col: string;
  dimension_cols: string[];
  date_min: string;
  date_max: string;
  row_count?: number;
  filename?: string;
}

export const FileUploader: React.FC = () => {
  const { setAppView, setDatasetRef, setDatasetSchema, logoutUser, hasCompletedOnboarding } = useAppContext();
  const { t } = useTranslation();

  const [selectedMode, setSelectedMode] = useState<'general' | 'enterprise' | null>(null);
  const [uploadStage, setUploadStage] = useState<'idle' | 'uploading' | 'profiling' | 'ready' | 'error'>('idle');
  const [schema, setSchema] = useState<SchemaPreview | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const API_URL = (import.meta.env.VITE_CHAT_API_URL as string) || 'http://localhost:5000';

  // ── Enterprise continue (Superstore) ──────────────────────────────
  const handleEnterpriseContinue = () => {
    setDatasetRef('data/Superstore.csv');
    setAppView(hasCompletedOnboarding ? 'chat' : 'onboarding');
  };

  // ── General: trigger file picker ──────────────────────────────────
  const handleContinue = () => {
    if (selectedMode === 'enterprise') {
      handleEnterpriseContinue();
    } else if (selectedMode === 'general') {
      if (schema) {
        // Schema already obtained — go to chat
        setAppView(hasCompletedOnboarding ? 'chat' : 'onboarding');
      } else {
        fileInputRef.current?.click();
      }
    }
  };

  // ── Upload + Profile in one go ────────────────────────────────────
  const processFile = async (file: File) => {
    setUploadStage('uploading');
    setErrorMsg('');
    setSchema(null);

    // ── Step 1: Upload file ──────────────────────────────────────
    let datasetRef = '';
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);
      const uploadData = await uploadRes.json();
      datasetRef = uploadData.dataset_ref;
      setDatasetRef(datasetRef);
    } catch (err: any) {
      setUploadStage('error');
      setErrorMsg(`${t('upload.uploadFailed')}: ${err.message}`);
      return;
    }

    // ── Step 2: Auto-profile schema ──────────────────────────────
    setUploadStage('profiling');
    try {
      const profileRes = await fetch(`${API_URL}/api/dataset/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_ref: datasetRef }),
      });

      if (!profileRes.ok) throw new Error(`Profiling failed (${profileRes.status})`);
      const profileData = await profileRes.json();
      const detectedSchema: SchemaPreview = {
        ...profileData.schema,
        filename: file.name,
        row_count: profileData.row_count,
      };

      setSchema(detectedSchema);
      setDatasetSchema(profileData.schema);
      setUploadStage('ready');
    } catch (err: any) {
      // Non-fatal: just skip schema preview and proceed anyway
      setUploadStage('ready');
      setSchema({ metric_col: '?', date_col: '?', dimension_cols: [], date_min: '', date_max: '', filename: file.name });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.csv')) processFile(file);
  };

  const isBusy = uploadStage === 'uploading' || uploadStage === 'profiling';
  const continueLabel =
    selectedMode === 'enterprise' ? t('upload.continue') :
    uploadStage === 'ready' ? t('upload.continue') :
    uploadStage === 'uploading' ? t('upload.connecting') :
    uploadStage === 'profiling' ? t('upload.connecting') :
    t('upload.continue');

  return (
    <div className="flex flex-col items-center w-full h-full p-8 relative overflow-y-auto custom-scrollbar justify-center">
      {/* Escape hatch */}
      <button
        onClick={logoutUser}
        className="absolute top-8 right-8 text-sm font-medium text-slate-400 hover:text-red-500 transition-colors flex items-center gap-2"
        title={t('upload.switchUser')}
      >
        <LogOut className="w-4 h-4" /> {t('upload.switchUser')}
      </button>

      <input
        type="file"
        accept=".csv"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <div className="max-w-3xl w-full fade-in-up">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight mb-3">{t('upload.welcome')}</h1>
          <p className="text-slate-500 font-light max-w-lg mx-auto">
            {t('upload.connectData')}
          </p>
        </div>

        {/* Mode cards */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* General User */}
          <button
            onClick={() => setSelectedMode('general')}
            onDragOver={e => { e.preventDefault(); if (selectedMode === 'general') setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { if (selectedMode === 'general') handleDrop(e); }}
            className={`text-left p-6 rounded-2xl border-2 transition-all duration-200 relative overflow-hidden ${
              selectedMode === 'general'
                ? dragOver
                  ? 'border-blue-400 bg-blue-100/60 shadow-lg ring-4 ring-blue-400/20'
                  : 'border-blue-500 bg-blue-50/50 shadow-md ring-4 ring-blue-500/10'
                : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 hover:shadow-sm'
            }`}
          >
            {selectedMode === 'general' && (
              <div className="absolute top-4 right-4 text-blue-500">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            )}
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
              selectedMode === 'general' ? 'bg-blue-100/80 text-blue-600' : 'bg-slate-100 text-slate-500'
            }`}>
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">{t('upload.generalUser')}</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-4">
              {t('upload.generalDesc')}
            </p>
            {selectedMode === 'general' && dragOver && (
              <p className="text-xs text-blue-500 font-semibold animate-pulse">Drop your CSV here…</p>
            )}
            {selectedMode !== 'general' && (
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('upload.fileFormats')}</div>
            )}
          </button>

          {/* Enterprise */}
          <button
            onClick={() => setSelectedMode('enterprise')}
            className={`text-left p-6 rounded-2xl border-2 transition-all duration-200 relative overflow-hidden ${
              selectedMode === 'enterprise'
                ? 'border-violet-500 bg-violet-50/50 shadow-md ring-4 ring-violet-500/10'
                : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 hover:shadow-sm'
            }`}
          >
            {selectedMode === 'enterprise' && (
              <div className="absolute top-4 right-4 text-violet-500">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            )}
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
              selectedMode === 'enterprise' ? 'bg-violet-100/80 text-violet-600' : 'bg-slate-100 text-slate-500'
            }`}>
              <Database className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">{t('upload.businessUser')}</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-4">
              {t('upload.businessDesc')}
            </p>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('upload.dbFormats')}</div>
          </button>
        </div>

        {/* Schema Preview Panel (only shown after upload) */}
        {schema && selectedMode === 'general' && (
          <div className={`mb-6 rounded-2xl border px-5 py-4 fade-in ${
            uploadStage === 'ready' ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              {uploadStage === 'ready' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
              )}
              <span className="text-sm font-semibold text-slate-700">
                {uploadStage === 'ready' ? `Schema detected — ${schema.filename ?? 'your file'}` : 'Detecting schema…'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <BarChart2 className="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Metric</p>
                  <p className="font-bold text-slate-800">{schema.metric_col}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <FileText className="w-3.5 h-3.5 mt-0.5 text-violet-500 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Date Column</p>
                  <p className="font-bold text-slate-800">{schema.date_col}</p>
                  {schema.date_min && (
                    <p className="text-slate-400">{schema.date_min} → {schema.date_max}</p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Cpu className="w-3.5 h-3.5 mt-0.5 text-emerald-500 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Dimensions</p>
                  <p className="font-bold text-slate-800">{schema.dimension_cols.length} found</p>
                  <p className="text-slate-400 truncate max-w-[120px]">{schema.dimension_cols.slice(0, 3).join(', ')}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Profiling / uploading spinner */}
        {isBusy && (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/60 px-5 py-4 flex items-center gap-3 fade-in">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-700">
                {uploadStage === 'uploading' ? t('upload.connecting') : 'Auto-detecting schema…'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {uploadStage === 'uploading'
                  ? 'Sending your CSV to the local execution engine.'
                  : 'Scanning columns for date, metric, and dimension fields.'}
              </p>
            </div>
          </div>
        )}

        {/* Error panel */}
        {uploadStage === 'error' && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50/60 px-5 py-4 flex items-start gap-3 fade-in">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">{t('upload.uploadFailed')}</p>
              <p className="text-xs text-red-500 mt-0.5">{errorMsg}</p>
              <button
                onClick={() => { setUploadStage('idle'); setErrorMsg(''); }}
                className="mt-2 text-xs font-semibold text-red-500 underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* CTA button */}
        <div className="text-center mb-5">
          <button
            onClick={handleContinue}
            disabled={!selectedMode || isBusy || uploadStage === 'error'}
            className="h-14 px-10 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-2xl flex items-center justify-center gap-3 transition-all text-lg mx-auto"
          >
            {isBusy ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> {continueLabel}</>
            ) : (
              <>{continueLabel} {!isBusy && <ChevronRight className={`w-5 h-5 ${document.documentElement.dir === 'rtl' ? 'rotate-180' : ''}`} />}</>
            )}
          </button>
          {selectedMode === 'general' && uploadStage === 'idle' && !isBusy && (
            <p className="text-xs text-slate-400 mt-2">Click to pick a file, or drag &amp; drop a CSV onto the card above.</p>
          )}
        </div>

        {/* Privacy notice */}
        <div className="flex items-start text-xs text-gray-500 bg-gray-50 p-3 rounded-md border border-gray-100">
          <svg className="w-4 h-4 mr-2 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p>
            <strong className="font-semibold text-gray-700">Privacy:</strong>{' '}
            Your raw data never leaves your machine. Only column headers and queries go to the AI compiler — never the actual values.
          </p>
        </div>
      </div>
    </div>
  );
};
