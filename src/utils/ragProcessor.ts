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
  batchSize?: number; // For processing chunks in batches
  maxConcurrency?: number; // Maximum concurrent operations
  retryAttempts?: number; // Number of retry attempts for failed operations
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
  private defaultOptions: RAGProcessingOptions = {
    batchSize: 50, // Process 50 chunks at a time
    maxConcurrency: 5, // Maximum 5 concurrent operations
    retryAttempts: 3 // Retry failed operations 3 times
  };

  constructor(credentials: RAGCredentials, options: RAGProcessingOptions = {}) {
    this.credentials = credentials;
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Utility method for batch processing with concurrency control
   */
  private async processBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize: number = this.options.batchSize || 50,
    maxConcurrency: number = this.options.maxConcurrency || 5
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = batch.map(item => processor(item));

      // Process batch with concurrency control
      const semaphore = new Array(Math.min(maxConcurrency, batch.length)).fill(null);
      const batchResults = await Promise.all(
        semaphore.map(async (_, index) => {
          const promises: Promise<R>[] = [];
          for (let j = index; j < batchPromises.length; j += semaphore.length) {
            promises.push(batchPromises[j]);
          }
          return Promise.all(promises);
        })
      );

      results.push(...batchResults.flat());
    }

    return results;
  }

  /**
   * Retry wrapper for operations that might fail
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = this.options.retryAttempts || 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxAttempts) {
          throw lastError;
        }

        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
      }
    }

    throw lastError!;
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

      // Stage 3: Generate embeddings with optimized batching
      onProgress?.('Generating embeddings...', 0.3);
      const openaiClient = createOpenAIClient(
        this.credentials.openaiApiKey,
        this.options.embedding
      );

      // Use retry wrapper for embedding generation
      const embeddingResult = await this.withRetry(async () => {
        return await openaiClient.generateEmbeddings(
          chunks,
          (progress, current, total) => {
            onProgress?.('Generating embeddings...', 0.3 + (progress * 0.4), `${current}/${total} chunks`);
          }
        );
      });

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

      // Stage 4: Upload to Supabase with retry logic
      onProgress?.('Uploading to database...', 0.7);
      const supabaseClient = createSupabaseClient(
        this.credentials.supabaseUrl,
        this.credentials.supabaseServiceKey
      );

      // Use retry wrapper for database uploads
      const uploadResult = await this.withRetry(async () => {
        return await supabaseClient.uploadEmbeddings(
          embeddingResult.embeddings,
          (progress, uploaded, total) => {
            onProgress?.('Uploading to database...', 0.7 + (progress * 0.3), `${uploaded}/${total} documents`);
          }
        );
      });

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
      // Generate query embedding with retry logic
      const openaiClient = createOpenAIClient(this.credentials.openaiApiKey);
      const queryEmbedding = await this.withRetry(async () => {
        return await openaiClient.generateQueryEmbedding(queryText);
      });

      // Search for similar documents with retry logic
      const supabaseClient = createSupabaseClient(
        this.credentials.supabaseUrl,
        this.credentials.supabaseServiceKey
      );

      const searchResults = await this.withRetry(async () => {
        return await supabaseClient.similaritySearch(
          queryEmbedding,
          { ...this.options.search, ...options }
        );
      });

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
   * Process multiple files in parallel with optimized batching
   */
  async processFilesParallel(
    files: File[],
    onProgress?: (stage: string, progress: number, details?: string) => void
  ): Promise<RAGProcessingResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Stage 1: Process files in parallel
      onProgress?.('Processing files in parallel...', 0.1);

      const fileProcessingPromises = await this.processBatch(
        files,
        async (file) => {
          try {
            const result = await processFiles([file]);
            return result;
          } catch (error) {
            errors.push(`Failed to process ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return { success: false, documents: [], errors: [error instanceof Error ? error.message : 'Unknown error'] };
          }
        },
        Math.min(this.options.batchSize || 10, files.length),
        this.options.maxConcurrency || 3
      );

      // Combine all results
      const allDocuments: ProcessedDocument[] = [];
      fileProcessingPromises.forEach(result => {
        if (result.success) {
          allDocuments.push(...result.documents);
        }
        errors.push(...result.errors);
      });

      if (allDocuments.length === 0) {
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
          errors
        };
      }

      // Continue with regular processing pipeline
      return await this.processDocuments(allDocuments, onProgress, startTime, errors);

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        message: `Parallel processing failed: ${errorMessage}`,
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
   * Process documents through the embedding and upload pipeline
   */
  private async processDocuments(
    documents: ProcessedDocument[],
    onProgress?: (stage: string, progress: number, details?: string) => void,
    startTime: number = Date.now(),
    errors: string[] = []
  ): Promise<RAGProcessingResult> {
    // Stage 2: Chunk documents
    onProgress?.('Chunking documents...', 0.3);
    const chunks = chunkDocuments(
      documents.map(doc => ({
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
          filesProcessed: documents.length,
          documentsExtracted: documents.length,
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

    // Continue with embedding and upload stages
    return await this.processEmbeddingsAndUpload(chunks, documents.length, onProgress, startTime, errors);
  }

  /**
   * Process embeddings and upload to database
   */
  private async processEmbeddingsAndUpload(
    chunks: TextChunk[],
    filesProcessed: number,
    onProgress?: (stage: string, progress: number, details?: string) => void,
    startTime: number = Date.now(),
    errors: string[] = []
  ): Promise<RAGProcessingResult> {
    // Stage 3: Generate embeddings
    onProgress?.('Generating embeddings...', 0.5);
    const openaiClient = createOpenAIClient(
      this.credentials.openaiApiKey,
      this.options.embedding
    );

    const embeddingResult = await this.withRetry(async () => {
      return await openaiClient.generateEmbeddings(
        chunks,
        (progress, current, total) => {
          onProgress?.('Generating embeddings...', 0.5 + (progress * 0.3), `${current}/${total} chunks`);
        }
      );
    });

    if (!embeddingResult.success || embeddingResult.embeddings.length === 0) {
      return {
        success: false,
        message: 'Failed to generate embeddings',
        stats: {
          filesProcessed,
          documentsExtracted: filesProcessed,
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
    onProgress?.('Uploading to database...', 0.8);
    const supabaseClient = createSupabaseClient(
      this.credentials.supabaseUrl,
      this.credentials.supabaseServiceKey
    );

    const uploadResult = await this.withRetry(async () => {
      return await supabaseClient.uploadEmbeddings(
        embeddingResult.embeddings,
        (progress, uploaded, total) => {
          onProgress?.('Uploading to database...', 0.8 + (progress * 0.2), `${uploaded}/${total} documents`);
        }
      );
    });

    errors.push(...uploadResult.errors);

    const processingTimeMs = Date.now() - startTime;

    return {
      success: uploadResult.success,
      message: uploadResult.success
        ? `Successfully processed ${filesProcessed} files and uploaded ${uploadResult.uploaded} documents`
        : 'Processing completed with errors',
      stats: {
        filesProcessed,
        documentsExtracted: filesProcessed,
        chunksCreated: chunks.length,
        embeddingsGenerated: embeddingResult.embeddings.length,
        documentsUploaded: uploadResult.uploaded,
        totalTokensUsed: embeddingResult.totalTokensUsed,
        estimatedCost: embeddingResult.totalCost,
        processingTimeMs
      },
      errors
    };
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
