/**
 * Main RAG processor for serverless implementation
 * Orchestrates file processing, chunking, embedding, and storage
 */

import { processFiles, type ProcessedDocument } from './fileProcessor';
import { chunkDocuments, type TextChunk, type ChunkingOptions } from './textChunker';
import { createOpenAIClient, type EmbeddingOptions } from './openaiClient';
import { createSupabaseClient, type SearchOptions } from './supabaseClient';

export interface RAGCredentials {
  openaiApiKey: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
}

export interface RAGProcessingOptions {
  chunking?: Partial<ChunkingOptions>;
  embedding?: Partial<EmbeddingOptions>;
  search?: Partial<SearchOptions>;
}

export interface RAGProcessingResult {
  success: boolean;
  message: string;
  stats: {
    filesProcessed: number;
    documentsExtracted: number;
    chunksCreated: number;
    embeddingsGenerated: number;
    documentsUploaded: number;
    totalTokensUsed: number;
    estimatedCost: number;
    processingTimeMs: number;
  };
  errors: string[];
}

export interface RAGQueryResult {
  success: boolean;
  results: Array<{
    content: string;
    source: string;
    similarity: number;
    metadata: any;
  }>;
  query: string;
  totalResults: number;
  processingTimeMs: number;
  error?: string;
}

/**
 * Main RAG processor class
 */
export class RAGProcessor {
  private credentials: RAGCredentials;
  private options: RAGProcessingOptions;

  constructor(credentials: RAGCredentials, options: RAGProcessingOptions = {}) {
    this.credentials = credentials;
    this.options = options;
  }

  /**
   * Test all connections and configurations
   */
  async testConnections(): Promise<{
    openai: { success: boolean; error?: string };
    supabase: { success: boolean; error?: string; tableExists?: boolean };
  }> {
    const openaiClient = createOpenAIClient(this.credentials.openaiApiKey);
    const supabaseClient = createSupabaseClient(
      this.credentials.supabaseUrl,
      this.credentials.supabaseServiceKey
    );

    const [openaiTest, supabaseTest] = await Promise.all([
      openaiClient.testConnection(),
      supabaseClient.testConnection()
    ]);

    return {
      openai: openaiTest,
      supabase: supabaseTest
    };
  }

  /**
   * Process files and store in vector database
   */
  async processFiles(
    files: File[],
    onProgress?: (stage: string, progress: number, details?: string) => void
  ): Promise<RAGProcessingResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    
    try {
      // Stage 1: Extract text from files
      onProgress?.('Extracting text from files...', 0.1);
      const fileResult = await processFiles(files);
      
      if (!fileResult.success || fileResult.documents.length === 0) {
        return {
          success: false,
          message: 'Failed to extract text from any files',
          stats: {
            filesProcessed: files.length,
            documentsExtracted: 0,
            chunksCreated: 0,
            embeddingsGenerated: 0,
            documentsUploaded: 0,
            totalTokensUsed: 0,
            estimatedCost: 0,
            processingTimeMs: Date.now() - startTime
          },
          errors: fileResult.errors
        };
      }

      errors.push(...fileResult.errors);

      // Stage 2: Chunk documents
      onProgress?.('Chunking documents...', 0.2);
      const chunks = chunkDocuments(
        fileResult.documents.map(doc => ({
          content: doc.content,
          source: doc.source
        })),
        this.options.chunking
      );

      if (chunks.length === 0) {
        return {
          success: false,
          message: 'No chunks were created from the documents',
          stats: {
            filesProcessed: files.length,
            documentsExtracted: fileResult.documents.length,
            chunksCreated: 0,
            embeddingsGenerated: 0,
            documentsUploaded: 0,
            totalTokensUsed: 0,
            estimatedCost: 0,
            processingTimeMs: Date.now() - startTime
          },
          errors
        };
      }

      // Stage 3: Generate embeddings
      onProgress?.('Generating embeddings...', 0.3);
      const openaiClient = createOpenAIClient(
        this.credentials.openaiApiKey,
        this.options.embedding
      );

      const embeddingResult = await openaiClient.generateEmbeddings(
        chunks,
        (progress, current, total) => {
          onProgress?.('Generating embeddings...', 0.3 + (progress * 0.4), `${current}/${total} chunks`);
        }
      );

      if (!embeddingResult.success || embeddingResult.embeddings.length === 0) {
        return {
          success: false,
          message: 'Failed to generate embeddings',
          stats: {
            filesProcessed: files.length,
            documentsExtracted: fileResult.documents.length,
            chunksCreated: chunks.length,
            embeddingsGenerated: 0,
            documentsUploaded: 0,
            totalTokensUsed: embeddingResult.totalTokensUsed,
            estimatedCost: embeddingResult.totalCost,
            processingTimeMs: Date.now() - startTime
          },
          errors: [...errors, ...embeddingResult.errors]
        };
      }

      errors.push(...embeddingResult.errors);

      // Stage 4: Upload to Supabase
      onProgress?.('Uploading to database...', 0.7);
      const supabaseClient = createSupabaseClient(
        this.credentials.supabaseUrl,
        this.credentials.supabaseServiceKey
      );

      const uploadResult = await supabaseClient.uploadEmbeddings(
        embeddingResult.embeddings,
        (progress, uploaded, total) => {
          onProgress?.('Uploading to database...', 0.7 + (progress * 0.3), `${uploaded}/${total} documents`);
        }
      );

      errors.push(...uploadResult.errors);

      const processingTimeMs = Date.now() - startTime;

      return {
        success: uploadResult.success,
        message: uploadResult.success 
          ? `Successfully processed ${files.length} files and uploaded ${uploadResult.uploaded} documents`
          : 'Processing completed with errors',
        stats: {
          filesProcessed: files.length,
          documentsExtracted: fileResult.documents.length,
          chunksCreated: chunks.length,
          embeddingsGenerated: embeddingResult.embeddings.length,
          documentsUploaded: uploadResult.uploaded,
          totalTokensUsed: embeddingResult.totalTokensUsed,
          estimatedCost: embeddingResult.totalCost,
          processingTimeMs
        },
        errors
      };

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        success: false,
        message: `Processing failed: ${errorMessage}`,
        stats: {
          filesProcessed: files.length,
          documentsExtracted: 0,
          chunksCreated: 0,
          embeddingsGenerated: 0,
          documentsUploaded: 0,
          totalTokensUsed: 0,
          estimatedCost: 0,
          processingTimeMs
        },
        errors: [...errors, errorMessage]
      };
    }
  }

  /**
   * Query the RAG system
   */
  async query(
    queryText: string,
    options?: Partial<SearchOptions>
  ): Promise<RAGQueryResult> {
    const startTime = Date.now();

    try {
      // Generate query embedding
      const openaiClient = createOpenAIClient(this.credentials.openaiApiKey);
      const queryEmbedding = await openaiClient.generateQueryEmbedding(queryText);

      // Search for similar documents
      const supabaseClient = createSupabaseClient(
        this.credentials.supabaseUrl,
        this.credentials.supabaseServiceKey
      );

      const searchResults = await supabaseClient.similaritySearch(
        queryEmbedding,
        { ...this.options.search, ...options }
      );

      const processingTimeMs = Date.now() - startTime;

      return {
        success: true,
        results: searchResults.map(result => ({
          content: result.content,
          source: result.source,
          similarity: result.similarity,
          metadata: result.metadata
        })),
        query: queryText,
        totalResults: searchResults.length,
        processingTimeMs
      };

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        results: [],
        query: queryText,
        totalResults: 0,
        processingTimeMs,
        error: errorMessage
      };
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    documentCount: number;
    sources: string[];
    error?: string;
  }> {
    try {
      const supabaseClient = createSupabaseClient(
        this.credentials.supabaseUrl,
        this.credentials.supabaseServiceKey
      );

      const documentCount = await supabaseClient.getDocumentCount();
      
      // Get unique sources (this is a simplified implementation)
      // In a real app, you might want to add a separate query for this
      const sources: string[] = []; // TODO: Implement source listing

      return {
        documentCount,
        sources
      };

    } catch (error) {
      return {
        documentCount: 0,
        sources: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Utility function to create a RAG processor
 */
export function createRAGProcessor(
  credentials: RAGCredentials,
  options?: RAGProcessingOptions
): RAGProcessor {
  return new RAGProcessor(credentials, options);
}
