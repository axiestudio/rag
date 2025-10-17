import React from 'react';
import { CheckCircle, AlertCircle, FileText, Database, Brain, ExternalLink, Copy } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

interface ProcessingResult {
  success: boolean;
  message: string;
  chunks_created?: number;
  files_processed?: number;
  error?: string;
  upload_stats?: {
    successful_uploads: number;
    failed_uploads: number;
    embedding_errors?: number;
    total_chunks: number;
  };
  processing_errors?: string[];
}

interface ResultsDisplayProps {
  result: ProcessingResult;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result }) => {
  const { t } = useLanguage();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const sqlSchema = `-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table for RAG
CREATE TABLE IF NOT EXISTS documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content text NOT NULL,
    embedding vector(1536) NOT NULL,
    source text,
    metadata jsonb,
    created_at timestamptz DEFAULT now()
);

-- Create index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_documents_embedding
ON documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create additional indexes
CREATE INDEX IF NOT EXISTS idx_documents_source ON documents (source);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at);`;

  return (
    <div className={`glass-effect rounded-2xl p-8 ${
      result.success ? 'border-white/30' : 'border-white/20'
    }`}>
      <div className="flex items-center mb-6">
        {result.success ? (
          <CheckCircle className="w-6 h-6 text-white mr-3" />
        ) : (
          <AlertCircle className="w-6 h-6 text-white mr-3" />
        )}
        <h2 className="text-2xl font-semibold text-white">
          {result.success ? t('processingComplete') : t('processingFailed')}
        </h2>
      </div>

      <div className="space-y-4">
        <p className="text-white/90 text-lg">
          {result.message}
        </p>

        {result.success && (
          <>
            <div className="grid md:grid-cols-3 gap-4 mt-6">
              <div className="bg-black/20 border border-white/10 rounded-lg p-4 text-center">
                <FileText className="w-8 h-8 text-white mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">
                  {result.files_processed || 0}
                </div>
                <div className="text-white/70">{t('filesProcessed')}</div>
              </div>
              
              <div className="bg-black/20 border border-white/10 rounded-lg p-4 text-center">
                <Brain className="w-8 h-8 text-white mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">
                  {result.chunks_created || 0}
                </div>
                <div className="text-white/70">{t('chunksCreated')}</div>
              </div>
              
              <div className="bg-black/20 border border-white/10 rounded-lg p-4 text-center">
                <Database className="w-8 h-8 text-white mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">
                  {result.upload_stats?.successful_uploads || 0}
                </div>
                <div className="text-white/70">{t('uploadedToSupabase')}</div>
              </div>
            </div>

            {result.upload_stats && (
              <div className="mt-6 p-4 bg-gray-800/50 border border-white/20 rounded-lg">
                <h3 className="text-white/90 font-medium mb-2">Upload Statistics:</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-white/80">Successful:</span>
                    <span className="text-white font-bold ml-2">{result.upload_stats.successful_uploads}</span>
                  </div>
                  <div>
                    <span className="text-white/80">Failed:</span>
                    <span className="text-white font-bold ml-2">{result.upload_stats.failed_uploads}</span>
                  </div>
                  <div>
                    <span className="text-white/80">Total:</span>
                    <span className="text-white font-bold ml-2">{result.upload_stats.total_chunks}</span>
                  </div>
                  <div>
                    <span className="text-white/80">Success Rate:</span>
                    <span className="text-white font-bold ml-2">
                      {Math.round((result.upload_stats.successful_uploads / result.upload_stats.total_chunks) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 p-4 bg-green-900/30 border border-green-500/30 rounded-lg">
              <p className="text-green-300 font-medium text-lg mb-3">✅ Processing Complete! Documents Ready for Main App:</p>
              <ul className="text-green-200 mt-2 space-y-2 text-sm">
                <li>• Files processed and stored in your Supabase vector database</li>
                <li>• Embeddings generated using your OpenAI API</li>
                <li>• Ready for integration with your main Langflow application</li>
                <li>• Follow the configuration steps below to connect your main app</li>
              </ul>
            </div>

            {/* Complementary App Notice */}
            <div className="mt-4 p-4 bg-blue-900/40 border border-blue-400/40 rounded-lg">
              <div className="flex items-center mb-2">
                <div className="w-3 h-3 bg-blue-400 rounded-full mr-3"></div>
                <h4 className="text-blue-300 font-medium">This is a Complementary Processing Tool</h4>
              </div>
              <p className="text-blue-200 text-sm">
                This application processes and uploads your documents to Supabase. To query and interact with your documents,
                use your main Axie Studio application with the configuration settings provided below.
              </p>
            </div>

            {/* Next Steps Section */}
            <div className="mt-6 space-y-4">
              <h3 className="text-xl font-semibold text-white mb-4">🚀 Next Steps - Integrate with Your Main Axie Studio App:</h3>

              {/* Step 1: Main App Integration */}
              <div className="p-4 bg-blue-900/30 border border-blue-500/30 rounded-lg">
                <h4 className="text-blue-300 font-medium mb-2">1. Configure Your Main Axie Studio Application</h4>
                <p className="text-blue-200 text-sm mb-3">
                  Your documents are now processed and ready to be used in your main Axie Studio RAG application. Configure your Supabase Vector Store component:
                </p>
                <div className="bg-black/30 p-3 rounded border border-blue-500/20">
                  <p className="text-blue-100 text-sm font-medium mb-2">Required Supabase Vector Store Settings:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-blue-300">Supabase URL:</span>
                      <p className="text-blue-200 font-mono text-xs">Use the same URL from your credentials</p>
                    </div>
                    <div>
                      <span className="text-blue-300">Service Key:</span>
                      <p className="text-blue-200 font-mono text-xs">Use the same service key from your credentials</p>
                    </div>
                    <div>
                      <span className="text-blue-300">Query Name:</span>
                      <p className="text-blue-200 font-mono text-xs bg-yellow-900/30 px-2 py-1 rounded">search_documents</p>
                    </div>
                    <div>
                      <span className="text-blue-300">Parser Type:</span>
                      <p className="text-blue-200 font-mono text-xs bg-green-900/30 px-2 py-1 rounded">STRING</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Component Configuration */}
              <div className="p-4 bg-purple-900/30 border border-purple-500/30 rounded-lg">
                <h4 className="text-purple-300 font-medium mb-2">2. Axie Studio Component Setup</h4>
                <p className="text-purple-200 text-sm mb-3">
                  Configure your Axie Studio components to work with the processed documents:
                </p>
                <div className="space-y-3">
                  <div className="bg-black/30 p-3 rounded border border-purple-500/20">
                    <p className="text-purple-100 text-sm font-medium mb-2">Component Configuration:</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-purple-300">OpenAI Embeddings:</span>
                        <span className="text-purple-200 font-mono text-xs bg-purple-900/30 px-2 py-1 rounded">Same API key as used here</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-purple-300">Supabase Vector Store:</span>
                        <span className="text-purple-200 font-mono text-xs bg-purple-900/30 px-2 py-1 rounded">Query Name: search_documents</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-purple-300">Parser Component:</span>
                        <span className="text-purple-200 font-mono text-xs bg-green-900/30 px-2 py-1 rounded">Output Type: STRING</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-purple-300">Search Results:</span>
                        <span className="text-purple-200 font-mono text-xs bg-blue-900/30 px-2 py-1 rounded">Connect to Parser input</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3: Database Schema */}
              <div className="p-4 bg-gray-800/50 border border-white/20 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-white font-medium">3. Database Schema (if needed)</h4>
                  <button
                    onClick={() => copyToClipboard(sqlSchema)}
                    className="flex items-center px-3 py-2 text-sm bg-gray-700 text-white border border-white/20 rounded hover:bg-gray-600 transition-colors"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy SQL
                  </button>
                </div>
                <p className="text-white/80 text-sm mb-3">
                  If you haven't set up your Supabase database yet, copy and run this SQL in your Supabase SQL editor:
                </p>
                <div className="bg-black/50 p-3 rounded border border-white/10 overflow-x-auto">
                  <pre className="text-green-300 text-xs font-mono whitespace-pre-wrap">
{sqlSchema}
                  </pre>
                </div>
              </div>

              {/* Step 4: Testing & Validation */}
              <div className="p-4 bg-orange-900/30 border border-orange-500/30 rounded-lg">
                <h4 className="text-orange-300 font-medium mb-2">4. Test Your Integration</h4>
                <p className="text-orange-200 text-sm mb-3">
                  Verify your main Axie Studio app can access the processed documents:
                </p>
                <div className="bg-black/30 p-3 rounded border border-orange-500/20">
                  <p className="text-orange-100 text-sm font-medium mb-2">Validation Steps:</p>
                  <div className="text-orange-200 text-xs space-y-1">
                    <p>• Open your main Axie Studio application</p>
                    <p>• Configure Supabase Vector Store with Query Name: <span className="bg-yellow-900/30 px-1 rounded">search_documents</span></p>
                    <p>• Set Parser output type to: <span className="bg-green-900/30 px-1 rounded">STRING</span></p>
                    <p>• Test with a sample query to verify document retrieval</p>
                    <p>• Check that search results are properly parsed as strings</p>
                  </div>
                </div>
              </div>
            </div>


          </>
        )}

        {result.processing_errors && result.processing_errors.length > 0 && (
          <div className="mt-4 p-4 bg-gray-800/50 border border-white/20 rounded-lg">
            <p className="text-white/90 font-medium">⚠️ Processing Warnings:</p>
            <ul className="text-white/80 mt-2 space-y-1 text-sm">
              {result.processing_errors.map((error, index) => (
                <li key={index}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

        {result.error && (
          <div className="mt-4 p-4 bg-gray-800/50 border border-white/20 rounded-lg">
            <p className="text-white/90 font-medium">Error Details:</p>
            <p className="text-white/80 mt-1 text-sm">{result.error}</p>
          </div>
        )}

        {!result.success && (
          <div className="mt-6 p-4 bg-gray-800/50 border border-white/20 rounded-lg">
            <p className="text-white/90 font-medium">💡 Troubleshooting Tips:</p>
            <ul className="text-white/80 mt-2 space-y-1 text-sm">
              <li>• Verify your OpenAI API key is valid and has sufficient credits</li>
              <li>• Check that your Supabase URL and service key are correct</li>
              <li>• Ensure the pgvector extension is enabled in your Supabase database</li>
              <li>• Make sure the documents table exists (use the SQL schema above)</li>
              <li>• Try with smaller files if you're hitting rate limits</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultsDisplay;