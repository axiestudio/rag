import React from 'react';
import { Loader2, FileText, Brain, Database } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

interface ProcessingStatusProps {
  stage?: string;
  progress?: number;
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ stage, progress = 0 }) => {
  const { t } = useLanguage();

  return (
    <div className="glass-effect-dark rounded-2xl p-8">
      <div className="flex items-center mb-6">
        <Loader2 className="w-6 h-6 text-white mr-3 animate-spin" />
        <h2 className="text-2xl font-semibold text-white">{t('processingFiles')}</h2>
      </div>

      <div className="space-y-4">
        <div className="text-center">
          <p className="text-white/90 text-lg">{stage || t('pleaseWait')}</p>

          {/* Progress Bar */}
          <div className="mt-4 w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            ></div>
          </div>
          <p className="text-white/70 text-sm mt-2">{Math.round(progress * 100)}% complete</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-black/20 border border-white/10 rounded-lg p-4 text-center">
            <FileText className="w-8 h-8 text-white mx-auto mb-2" />
            <div className="text-white/70">{t('extractingText')}</div>
            <div className="text-sm text-white/60 mt-1">{t('readingContents')}</div>
          </div>

          <div className="bg-black/20 border border-white/10 rounded-lg p-4 text-center">
            <Brain className="w-8 h-8 text-white mx-auto mb-2" />
            <div className="text-white/70">{t('creatingEmbeddings')}</div>
            <div className="text-sm text-white/60 mt-1">{t('usingOpenAI')}</div>
          </div>

          <div className="bg-black/20 border border-white/10 rounded-lg p-4 text-center">
            <Database className="w-8 h-8 text-white mx-auto mb-2" />
            <div className="text-white/70">{t('storingData')}</div>
            <div className="text-sm text-white/60 mt-1">{t('uploadingSupabase')}</div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-gray-800/50 border border-white/20 rounded-lg">
          <p className="text-white/80 text-center">⚡ Serverless Processing - No Backend Required!</p>
        </div>
      </div>
    </div>
  );
};

export default ProcessingStatus;