import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart2,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  FileText,
  Loader2,
  LogOut,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buildApiUrl } from '../config/api';
import { useAppContext } from '../stores/appStore';

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

  const handleEnterpriseContinue = () => {
    setDatasetRef('data/Superstore.csv');
    setAppView(hasCompletedOnboarding ? 'chat' : 'onboarding');
  };

  const handleContinue = () => {
    if (selectedMode === 'enterprise') {
      handleEnterpriseContinue();
    } else if (selectedMode === 'general') {
      if (schema) {
        setAppView(hasCompletedOnboarding ? 'chat' : 'onboarding');
      } else {
        fileInputRef.current?.click();
      }
    }
  };

  const processFile = async (file: File) => {
    setUploadStage('uploading');
    setErrorMsg('');
    setSchema(null);

    let datasetRef = '';

    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch(buildApiUrl('/api/upload'), {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed (${uploadRes.status})`);
      }

      const uploadData = await uploadRes.json();
      datasetRef = uploadData.dataset_ref;
      setDatasetRef(datasetRef);
    } catch (err: any) {
      setUploadStage('error');
      setErrorMsg(`${t('upload.uploadFailed')}: ${err.message}`);
      return;
    }

    setUploadStage('profiling');

    try {
      const profileRes = await fetch(buildApiUrl('/api/dataset/profile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_ref: datasetRef }),
      });

      if (!profileRes.ok) {
        throw new Error(`Profiling failed (${profileRes.status})`);
      }

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
      setUploadStage('ready');
      setSchema({
        metric_col: '?',
        date_col: '?',
        dimension_cols: [],
        date_min: '',
        date_max: '',
        filename: file.name,
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.csv')) {
      processFile(file);
    }
  };

  const isBusy = uploadStage === 'uploading' || uploadStage === 'profiling';
  const continueLabel =
    selectedMode === 'enterprise'
      ? t('upload.continue')
      : uploadStage === 'uploading' || uploadStage === 'profiling'
        ? t('upload.connecting')
        : t('upload.continue');

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-y-auto bg-black px-4 py-8 custom-scrollbar md:px-8">
      <div className="absolute left-[6%] top-[8%] h-64 w-64 rounded-full bg-cyan-500/8 blur-[120px]" />
      <div className="absolute bottom-[4%] right-[6%] h-72 w-72 rounded-full bg-violet-500/12 blur-[140px]" />

      <button
        onClick={logoutUser}
        className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-zinc-400 transition-all hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-300 md:right-5 md:top-5"
        title={t('upload.switchUser')}
      >
        <LogOut className="h-4 w-4" /> {t('upload.switchUser')}
      </button>

      <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

      <div className="relative z-10 mx-auto w-full max-w-4xl rounded-[1.6rem] border border-cyan-300/8 bg-white/[0.03] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl fade-in-up md:p-6">
        <div className="mb-6 text-center md:mb-7">
          <h1 className="compact-title mb-2 text-[1.8rem] font-semibold text-white">{t('upload.welcome')}</h1>
          <p className="mx-auto max-w-2xl text-[13px] leading-relaxed text-zinc-400">{t('upload.connectData')}</p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2">
          <button
            onClick={() => setSelectedMode('general')}
            onDragOver={(e) => {
              e.preventDefault();
              if (selectedMode === 'general') {
                setDragOver(true);
              }
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              if (selectedMode === 'general') {
                handleDrop(e);
              }
            }}
            className={`relative overflow-hidden rounded-[1.35rem] border p-5 text-left transition-all duration-200 ${
              selectedMode === 'general'
                ? dragOver
                  ? 'border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_24px_rgba(34,211,238,0.18)]'
                  : 'border-cyan-400/30 bg-cyan-500/10 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
            }`}
          >
            {selectedMode === 'general' && (
              <div className="absolute right-5 top-5 text-cyan-300">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            )}

            <div
              className={`mb-4 flex h-10 w-10 items-center justify-center rounded-[0.9rem] ${
                selectedMode === 'general' ? 'bg-cyan-400/15 text-cyan-300' : 'bg-white/[0.06] text-zinc-400'
              }`}
            >
              <Upload className="h-6 w-6" />
            </div>

            <h3 className="mb-2 text-lg font-semibold text-white">{t('upload.generalUser')}</h3>
            <p className="mb-4 text-[13px] leading-relaxed text-zinc-400">{t('upload.generalDesc')}</p>

            {selectedMode === 'general' && dragOver ? (
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Drop your CSV here</p>
            ) : (
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">{t('upload.fileFormats')}</div>
            )}
          </button>

          <button
            onClick={() => setSelectedMode('enterprise')}
            className={`relative overflow-hidden rounded-[1.35rem] border p-5 text-left transition-all duration-200 ${
              selectedMode === 'enterprise'
                ? 'border-violet-400/30 bg-violet-500/10 shadow-[0_0_24px_rgba(168,85,247,0.14)]'
                : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
            }`}
          >
            {selectedMode === 'enterprise' && (
              <div className="absolute right-5 top-5 text-violet-300">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            )}

            <div
              className={`mb-4 flex h-10 w-10 items-center justify-center rounded-[0.9rem] ${
                selectedMode === 'enterprise' ? 'bg-violet-400/15 text-violet-300' : 'bg-white/[0.06] text-zinc-400'
              }`}
            >
              <Database className="h-6 w-6" />
            </div>

            <h3 className="mb-2 text-lg font-semibold text-white">{t('upload.businessUser')}</h3>
            <p className="mb-4 text-[13px] leading-relaxed text-zinc-400">{t('upload.businessDesc')}</p>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">{t('upload.dbFormats')}</div>
          </button>
        </div>

        {schema && selectedMode === 'general' && (
          <div
            className={`mb-6 rounded-[1.5rem] border px-5 py-5 ${
              uploadStage === 'ready'
                ? 'border-emerald-400/20 bg-emerald-500/10'
                : 'border-amber-400/20 bg-amber-500/10'
            }`}
          >
            <div className="mb-4 flex items-center gap-2">
              {uploadStage === 'ready' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
              )}
              <span className="text-sm font-semibold text-white">
                {uploadStage === 'ready' ? `Schema detected - ${schema.filename ?? 'your file'}` : 'Detecting schema...'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 text-xs text-zinc-300 md:grid-cols-3">
              <div className="flex items-start gap-3">
                <BarChart2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                <div>
                  <p className="mb-1 font-semibold uppercase tracking-[0.2em] text-zinc-500">Metric</p>
                  <p className="font-bold text-white">{schema.metric_col}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                <div>
                  <p className="mb-1 font-semibold uppercase tracking-[0.2em] text-zinc-500">Date Column</p>
                  <p className="font-bold text-white">{schema.date_col}</p>
                  {schema.date_min && <p className="text-zinc-500">{schema.date_min} to {schema.date_max}</p>}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <div>
                  <p className="mb-1 font-semibold uppercase tracking-[0.2em] text-zinc-500">Dimensions</p>
                  <p className="font-bold text-white">{schema.dimension_cols.length} found</p>
                  <p className="max-w-[180px] truncate text-zinc-500">{schema.dimension_cols.slice(0, 3).join(', ')}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {isBusy && (
          <div className="mb-6 flex items-center gap-3 rounded-[1.5rem] border border-cyan-400/20 bg-cyan-500/10 px-5 py-4 fade-in">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-cyan-300" />
            <div>
              <p className="text-sm font-semibold text-white">
                {uploadStage === 'uploading' ? t('upload.connecting') : 'Auto-detecting schema...'}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {uploadStage === 'uploading'
                  ? 'Sending your CSV to the execution engine.'
                  : 'Scanning columns for date, metric, and dimensions.'}
              </p>
            </div>
          </div>
        )}

        {uploadStage === 'error' && (
          <div className="mb-6 flex items-start gap-3 rounded-[1.5rem] border border-red-500/20 bg-red-500/10 px-5 py-4 fade-in">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
            <div>
              <p className="text-sm font-semibold text-red-200">{t('upload.uploadFailed')}</p>
              <p className="mt-0.5 text-xs text-red-300/85">{errorMsg}</p>
              <button
                onClick={() => {
                  setUploadStage('idle');
                  setErrorMsg('');
                }}
                className="mt-3 text-xs font-semibold text-red-200 underline underline-offset-4"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        <div className="mb-5 text-center">
          <button
            onClick={handleContinue}
            disabled={!selectedMode || isBusy || uploadStage === 'error'}
            className="mx-auto flex h-10 items-center justify-center gap-3 rounded-[1rem] bg-[linear-gradient(90deg,#26d9ff_0%,#6ea6ff_38%,#a85cff_72%,#cf78ff_100%)] px-7 text-sm font-semibold text-white shadow-[0_0_20px_rgba(77,226,255,0.14),0_0_18px_rgba(180,108,255,0.14)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {isBusy ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> {continueLabel}
              </>
            ) : (
              <>
                {continueLabel}
                <ChevronRight className={`h-5 w-5 ${document.documentElement.dir === 'rtl' ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>

          {selectedMode === 'general' && uploadStage === 'idle' && !isBusy && (
            <p className="mt-3 text-xs text-zinc-500">Click to pick a file, or drag and drop a CSV onto the card above.</p>
          )}
        </div>

        <div className="flex items-start rounded-[1.25rem] border border-emerald-400/10 bg-white/[0.02] px-4 py-4 text-xs text-zinc-400">
          <svg className="mr-3 h-4 w-4 shrink-0 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <p>
            <strong className="font-semibold text-white">Privacy:</strong>{' '}
            Your raw data never leaves your machine. Only column headers and queries go to the AI compiler - never the actual values.
          </p>
        </div>
      </div>
    </div>
  );
};
