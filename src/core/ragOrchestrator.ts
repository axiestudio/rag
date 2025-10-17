/**
 * Core RAG orchestrator for industry-standard serverless processing
 * Coordinates document processing, chunking, embedding, and storage
 */

import { createDocumentProcessor, type ProcessingResult } from '../processors/documentProcessor';
import { SemanticChunker, type SemanticChunk } from '../processors/semanticChunker';
import { createOpenAIEmbeddingService, type BatchEmbeddingResult } from '../services/openai';
import { createSupabaseVectorService, type UploadResult } from '../services/supabase';
import { PROCESSING_CONFIG, SUCCESS_MESSAGES, ERROR_MESSAGES } from '../config/constants';
import { EMBEDDING_CONFIG, CHUNKING_CONFIG } from '../config/embeddings';

export interface RAGCredentials {
  openaiApiKey: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
}

export interface RAGProcessingOptions {
  chunking?: Partial<typeof CHUNKING_CONFIG>;
  embedding?: Partial<typeof EMBEDDING_CONFIG>;
  processing?: Partial<typeof PROCESSING_CONFIG>;
  enableQualityControl?: boolean;
  enableDuplicateDetection?: boolean;
  enableProgressiveProcessing?: boolean;
}

export interface RAGProcessingResult {
  success: boolean;
  message: string;
  statistics: ProcessingStatistics;
  errors: string[];
  warnings: string[];
}

export interface ProcessingStatistics {
  // File processing
  filesProcessed: number;
  documentsExtracted: number;
  totalFileSize: number;
  
  // Chunking
  chunksCreated: number;
  averageChunkSize: number;
  chunkQualityDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  
  // Embedding
  embeddingsGenerated: number;
  totalTokensUsed: number;
  estimatedCost: number;
  averageEmbeddingQuality: number;
  
  // Storage
  documentsUploaded: number;
  duplicatesSkipped: number;
  uploadSuccessRate: number;
  
  // Performance
  totalProcessingTimeMs: number;
  averageProcessingTimePerFile: number;
  throughputMBPerSecond: number;
  
  // Quality metrics
  overallQualityScore: number;
  qualityIssues: string[];
  recommendations: string[];
}

/**
 * Industry-standard RAG orchestrator for serverless processing
 */
export class RAGOrchestrator {
  private credentials: RAGCredentials;
  private options: RAGProcessingOptions;
  private documentProcessor = createDocumentProcessor();
  private semanticChunker = new SemanticChunker();

  constructor(credentials: RAGCredentials, options: RAGProcessingOptions = {}) {
    this.credentials = credentials;
    this.options = {
      enableQualityControl: true,
      enableDuplicateDetection: true,
      enableProgressiveProcessing: true,
      ...options
    };
  }

  /**
   * Process files through the complete RAG pipeline
   */
  async processFiles(
    files: File[],
    onProgress?: (stage: string, progress: number, details?: string) => void
  ): Promise<RAGProcessingResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let totalFileSize = 0;

    try {
      // Validate inputs
      this.validateInputs(files);
      totalFileSize = files.reduce((sum, file) => sum + file.size, 0);

      // Stage 1: Document Processing (0-25%)
      onProgress?.('Processing documents...', 0.05);
      const documentResult = await this.processDocuments(files, onProgress);
      
      if (!documentResult.success || documentResult.documents.length === 0) {
        return this.createFailureResult(
          'Document processing failed',
          errors.concat(documentResult.errors),
          warnings,
          startTime,
          { filesProcessed: files.length, totalFileSize }
        );
      }

      errors.push(...documentResult.errors);

      // Stage 2: Semantic Chunking (25-40%)
      onProgress?.('Creating semantic chunks...', 0.25);
      const chunks = await this.createSemanticChunks(
        documentResult.documents,
        onProgress
      );

      if (chunks.length === 0) {
        return this.createFailureResult(
          'No chunks were created from documents',
          errors,
          warnings,
          startTime,
          { 
            filesProcessed: files.length,
            documentsExtracted: documentResult.documents.length,
            totalFileSize
          }
        );
      }

      // Stage 3: Embedding Generation (40-70%)
      onProgress?.('Generating embeddings...', 0.40);
      const embeddingResult = await this.generateEmbeddings(chunks, onProgress);

      if (!embeddingResult.success || embeddingResult.embeddings.length === 0) {
        return this.createFailureResult(
          'Embedding generation failed',
          errors.concat(embeddingResult.errors),
          warnings,
          startTime,
          {
            filesProcessed: files.length,
            documentsExtracted: documentResult.documents.length,
            chunksCreated: chunks.length,
            totalFileSize
          }
        );
      }

      errors.push(...embeddingResult.errors);

      // Stage 4: Vector Storage (70-100%)
      onProgress?.('Uploading to vector database...', 0.70);
      const uploadResult = await this.uploadToVectorDatabase(
        embeddingResult.embeddings,
        onProgress
      );

      errors.push(...uploadResult.errors);

      // Generate comprehensive statistics
      const statistics = this.generateStatistics(
        files,
        documentResult,
        chunks,
        embeddingResult,
        uploadResult,
        startTime,
        totalFileSize
      );

      // Generate quality recommendations
      const recommendations = this.generateRecommendations(statistics);
      statistics.recommendations = recommendations;

      const success = uploadResult.success && uploadResult.uploaded > 0;
      const message = success 
        ? `Successfully processed ${files.length} files and uploaded ${uploadResult.uploaded} document chunks`
        : 'Processing completed with errors';

      return {
        success,
        message,
        statistics,
        errors,
        warnings
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createFailureResult(
        `Processing failed: ${errorMessage}`,
        [...errors, errorMessage],
        warnings,
        startTime,
        { filesProcessed: files.length, totalFileSize }
      );
    }
  }

  /**
   * Process documents with enhanced extraction
   */
  private async processDocuments(
    files: File[],
    onProgress?: (stage: string, progress: number, details?: string) => void
  ): Promise<ProcessingResult> {
    return await this.documentProcessor.processFiles(files);
  }

  /**
   * Create semantic chunks from processed documents
   */
  private async createSemanticChunks(
    documents: any[],
    onProgress?: (stage: string, progress: number, details?: string) => void
  ): Promise<SemanticChunk[]> {
    const allChunks: SemanticChunk[] = [];

    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      
      try {
        const chunks = await this.semanticChunker.chunkDocument(
          document.content,
          document.source,
          document.metadata
        );
        
        allChunks.push(...chunks);
        
        // Report progress
        if (onProgress) {
          const progress = 0.25 + ((i + 1) / documents.length) * 0.15;
          onProgress(
            'Creating semantic chunks...',
            progress,
            `${i + 1}/${documents.length} documents chunked`
          );
        }
      } catch (error) {
        console.error(`Failed to chunk document ${document.source}:`, error);
      }
    }

    return allChunks;
  }

  /**
   * Generate embeddings with quality control
   */
  private async generateEmbeddings(
    chunks: SemanticChunk[],
    onProgress?: (stage: string, progress: number, details?: string) => void
  ): Promise<BatchEmbeddingResult> {
    const embeddingService = createOpenAIEmbeddingService(
      this.credentials.openaiApiKey,
      this.options.embedding
    );

    return await embeddingService.generateEmbeddings(
      chunks,
      (progress, current, total) => {
        const overallProgress = 0.40 + (progress * 0.30);
        onProgress?.(
          'Generating embeddings...',
          overallProgress,
          `${current}/${total} chunks processed`
        );
      }
    );
  }

  /**
   * Upload embeddings to vector database
   */
  private async uploadToVectorDatabase(
    embeddings: any[],
    onProgress?: (stage: string, progress: number, details?: string) => void
  ): Promise<UploadResult> {
    const vectorService = createSupabaseVectorService(
      this.credentials.supabaseUrl,
      this.credentials.supabaseServiceKey
    );

    return await vectorService.uploadEmbeddings(
      embeddings,
      (progress, uploaded, total) => {
        const overallProgress = 0.70 + (progress * 0.30);
        onProgress?.(
          'Uploading to vector database...',
          overallProgress,
          `${uploaded}/${total} documents uploaded`
        );
      }
    );
  }

  /**
   * Generate comprehensive processing statistics
   */
  private generateStatistics(
    files: File[],
    documentResult: ProcessingResult,
    chunks: SemanticChunk[],
    embeddingResult: BatchEmbeddingResult,
    uploadResult: UploadResult,
    startTime: number,
    totalFileSize: number
  ): ProcessingStatistics {
    const processingTimeMs = Date.now() - startTime;
    const throughputMBPerSecond = (totalFileSize / 1024 / 1024) / (processingTimeMs / 1000);

    // Calculate chunk quality distribution
    const chunkQualityDistribution = { high: 0, medium: 0, low: 0 };
    chunks.forEach(chunk => {
      if (chunk.importance >= 0.8) chunkQualityDistribution.high++;
      else if (chunk.importance >= 0.6) chunkQualityDistribution.medium++;
      else chunkQualityDistribution.low++;
    });

    // Calculate average chunk size
    const averageChunkSize = chunks.length > 0 
      ? chunks.reduce((sum, chunk) => sum + chunk.tokens, 0) / chunks.length 
      : 0;

    // Calculate overall quality score
    const documentQuality = documentResult.documents.reduce(
      (sum, doc) => sum + (doc.quality?.confidence || 0.5), 0
    ) / documentResult.documents.length;
    
    const embeddingQuality = embeddingResult.statistics.qualityMetrics.averageQuality;
    const uploadQuality = uploadResult.statistics.averageQuality;
    
    const overallQualityScore = (documentQuality + embeddingQuality + uploadQuality) / 3;

    // Identify quality issues
    const qualityIssues: string[] = [];
    if (documentQuality < 0.7) qualityIssues.push('Document extraction quality below optimal');
    if (embeddingQuality < 0.7) qualityIssues.push('Embedding quality below optimal');
    if (uploadResult.statistics.duplicatesSkipped > chunks.length * 0.1) {
      qualityIssues.push('High number of duplicate chunks detected');
    }

    return {
      // File processing
      filesProcessed: files.length,
      documentsExtracted: documentResult.documents.length,
      totalFileSize,
      
      // Chunking
      chunksCreated: chunks.length,
      averageChunkSize,
      chunkQualityDistribution,
      
      // Embedding
      embeddingsGenerated: embeddingResult.embeddings.length,
      totalTokensUsed: embeddingResult.statistics.totalTokensUsed,
      estimatedCost: embeddingResult.statistics.estimatedCost,
      averageEmbeddingQuality: embeddingQuality,
      
      // Storage
      documentsUploaded: uploadResult.uploaded,
      duplicatesSkipped: uploadResult.statistics.duplicatesSkipped,
      uploadSuccessRate: uploadResult.uploaded / (uploadResult.uploaded + uploadResult.failed),
      
      // Performance
      totalProcessingTimeMs: processingTimeMs,
      averageProcessingTimePerFile: processingTimeMs / files.length,
      throughputMBPerSecond,
      
      // Quality metrics
      overallQualityScore,
      qualityIssues,
      recommendations: [] // Will be filled by generateRecommendations
    };
  }

  /**
   * Generate quality recommendations
   */
  private generateRecommendations(statistics: ProcessingStatistics): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    if (statistics.throughputMBPerSecond < 1) {
      recommendations.push('Consider processing smaller batches for better performance');
    }

    // Quality recommendations
    if (statistics.overallQualityScore < 0.7) {
      recommendations.push('Review document quality and consider preprocessing');
    }

    if (statistics.duplicatesSkipped > statistics.chunksCreated * 0.1) {
      recommendations.push('High duplicate rate detected - consider deduplication before processing');
    }

    // Cost optimization
    if (statistics.estimatedCost > 1.0) {
      recommendations.push('Consider using smaller chunk sizes to reduce embedding costs');
    }

    // Chunking recommendations
    if (statistics.averageChunkSize < 100) {
      recommendations.push('Chunks are quite small - consider increasing chunk size for better context');
    } else if (statistics.averageChunkSize > 800) {
      recommendations.push('Chunks are large - consider reducing size for better retrieval precision');
    }

    return recommendations;
  }

  /**
   * Create failure result with partial statistics
   */
  private createFailureResult(
    message: string,
    errors: string[],
    warnings: string[],
    startTime: number,
    partialStats: Partial<ProcessingStatistics>
  ): RAGProcessingResult {
    const processingTimeMs = Date.now() - startTime;
    
    const statistics: ProcessingStatistics = {
      filesProcessed: 0,
      documentsExtracted: 0,
      totalFileSize: 0,
      chunksCreated: 0,
      averageChunkSize: 0,
      chunkQualityDistribution: { high: 0, medium: 0, low: 0 },
      embeddingsGenerated: 0,
      totalTokensUsed: 0,
      estimatedCost: 0,
      averageEmbeddingQuality: 0,
      documentsUploaded: 0,
      duplicatesSkipped: 0,
      uploadSuccessRate: 0,
      totalProcessingTimeMs: processingTimeMs,
      averageProcessingTimePerFile: 0,
      throughputMBPerSecond: 0,
      overallQualityScore: 0,
      qualityIssues: [],
      recommendations: [],
      ...partialStats
    };

    return {
      success: false,
      message,
      statistics,
      errors,
      warnings
    };
  }

  /**
   * Validate input files
   */
  private validateInputs(files: File[]): void {
    if (!files || files.length === 0) {
      throw new Error('No files provided for processing');
    }

    if (files.length > PROCESSING_CONFIG.BATCH_SIZES.FILES * 4) {
      throw new Error(`Too many files. Maximum ${PROCESSING_CONFIG.BATCH_SIZES.FILES * 4} allowed`);
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > 200 * 1024 * 1024) { // 200MB total limit
      throw new Error('Total file size exceeds 200MB limit');
    }
  }

  /**
   * Query the processed knowledge base
   */
  async query(
    queryText: string,
    options: any = {}
  ): Promise<any> {
    try {
      // Generate query embedding
      const embeddingService = createOpenAIEmbeddingService(this.credentials.openaiApiKey);
      const queryEmbedding = await embeddingService.generateQueryEmbedding(queryText);

      // Search vector database
      const vectorService = createSupabaseVectorService(
        this.credentials.supabaseUrl,
        this.credentials.supabaseServiceKey
      );

      const results = await vectorService.similaritySearch(queryEmbedding, options);

      return {
        success: true,
        results,
        query: queryText,
        resultCount: results.length
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Query failed',
        results: [],
        query: queryText,
        resultCount: 0
      };
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<any> {
    try {
      const vectorService = createSupabaseVectorService(
        this.credentials.supabaseUrl,
        this.credentials.supabaseServiceKey
      );

      return await vectorService.getDatabaseStats();
    } catch (error) {
      throw new Error(`Failed to get database stats: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`);
    }
  }
}

/**
 * Factory function for creating RAG orchestrator
 */
export function createRAGOrchestrator(
  credentials: RAGCredentials,
  options?: RAGProcessingOptions
): RAGOrchestrator {
  return new RAGOrchestrator(credentials, options);
}

/**
 * Legacy compatibility function
 */
export function createRAGProcessor(credentials: RAGCredentials, options?: any) {
  const orchestrator = createRAGOrchestrator(credentials, options);
  
  // Return object with legacy interface
  return {
    processFiles: (files: File[], onProgress?: any) => orchestrator.processFiles(files, onProgress),
    processFilesParallel: (files: File[], onProgress?: any) => orchestrator.processFiles(files, onProgress),
    query: (queryText: string, options?: any) => orchestrator.query(queryText, options),
    getDatabaseStats: () => orchestrator.getDatabaseStats()
  };
}
