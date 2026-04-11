import React, { useState } from 'react';
import { useAppContext } from '../stores/appStore';
import { Upload, Database, ChevronRight, CheckCircle2 } from 'lucide-react';

export const FileUploader: React.FC = () => {
  const { setAppView, setDatasetRef } = useAppContext();
  const [selectedMode, setSelectedMode] = useState<'general' | 'enterprise' | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleContinue = () => {
    if (selectedMode === 'general') {
      setIsUploading(true);
      // Simulate file upload delay
      setTimeout(() => {
        setDatasetRef('local_csv_upload_748923');
        setAppView('onboarding');
      }, 1500);
    } else {
      setDatasetRef('ent_sales_data_q3');
      setAppView('onboarding');
    }
  };

  return (
    <div className="flex flex-col items-center w-full h-full p-8 relative overflow-y-auto custom-scrollbar justify-center">
      <div className="max-w-3xl w-full fade-in-up">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight mb-3">Welcome to Talk2Data</h1>
          <p className="text-slate-500 font-light max-w-lg mx-auto">
            Choose how you want to connect your data to begin extracting actionable insights.
          </p>
        </div>

        {/* Two Modes */}
        <div className="grid grid-cols-2 gap-6 mb-12">
          {/* General Mode */}
          <button
            onClick={() => setSelectedMode('general')}
            className={`text-left p-6 rounded-2xl border-2 transition-all duration-200 relative overflow-hidden ${selectedMode === 'general'
                ? 'border-blue-500 bg-blue-50/50 shadow-md ring-4 ring-blue-500/10'
                : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 hover:shadow-sm'
              }`}
          >
            {selectedMode === 'general' && (
              <div className="absolute top-4 right-4 text-blue-500">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            )}
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${selectedMode === 'general' ? 'bg-blue-100/80 text-blue-600' : 'bg-slate-100 text-slate-500'
              }`}>
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">General User</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-4">
              Upload your own local CSV file to instantly generate charts, trends, and summaries.
            </p>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              CSV, Excel, JSON
            </div>
          </button>

          {/* Enterprise Mode */}
          <button
            onClick={() => setSelectedMode('enterprise')}
            className={`text-left p-6 rounded-2xl border-2 transition-all duration-200 relative overflow-hidden ${selectedMode === 'enterprise'
                ? 'border-violet-500 bg-violet-50/50 shadow-md ring-4 ring-violet-500/10'
                : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 hover:shadow-sm'
              }`}
          >
            {selectedMode === 'enterprise' && (
              <div className="absolute top-4 right-4 text-violet-500">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            )}
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${selectedMode === 'enterprise' ? 'bg-violet-100/80 text-violet-600' : 'bg-slate-100 text-slate-500'
              }`}>
              <Database className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Business User</h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-4">
              Connect to a pre-configured enterprise dataset with established governance schemas.
            </p>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Snowflake, BigQuery, SQL
            </div>
          </button>
        </div>

        {/* Action Button */}
        <div className="text-center fade-in text-slate-600">
          <button
            onClick={handleContinue}
            disabled={!selectedMode || isUploading}
            className="h-14 px-10 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-2xl flex items-center justify-center gap-3 transition-all text-lg mx-auto"
          >
            {isUploading ? (
              <span className="animate-pulse">Connecting...</span>
            ) : (
              <>
                Continue to Questionnaire
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
