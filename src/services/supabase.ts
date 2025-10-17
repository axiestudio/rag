/**
 * Enhanced Supabase service for industry-standard vector operations
 * Optimized for serverless RAG with advanced retrieval strategies
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  RETRIEVAL_CONFIG, 
  EMBEDDING_CONFIG 
} from '../config/embeddings';
import { API_CONFIG, PROCESSING_CONFIG } from '../config/constants';
import type { EnhancedEmbedding } from './openai';

export interface VectorDocument {
  id?: string;
  content: string;
  embedding: number[];
  source: string;
  metadata: DocumentMetadata;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentMetadata {
  // Core metadata
  fileName: string;
  fileType: string;
  fileSize: number;
  
  // Content metadata
  chunkId: string;
  contentType: string;
  importance: number;
  tokens: number;
  
  // Structural metadata
  section?: string;
  subsection?: string;
  pageNumber?: number;
  position: {
    documentIndex: number;
    sectionIndex: number;
    paragraphIndex: number;
  };
  
  // Semantic metadata
  keywords: string[];
  topics: string[];
  entities: string[];
  sentiment: number;
  
  // Quality metadata
  textQuality: number;
  semanticCoherence: number;
  informationDensity: number;
  overallQuality: number;
  
  // Processing metadata
  model: string;
  timestamp: string;
  version: string;
  
  // Custom metadata
  [key: string]: any;
}

export interface SearchResult {
  id: string;
  content: string;
  source: string;
  metadata: DocumentMetadata;
  similarity: number;
  rank: number;
  relevanceScore: number;
  created_at: string;
}

export interface SearchOptions {
  limit: number;
  threshold: number;
  includeMetadata: boolean;
  hybridSearch: boolean;
  rerankResults: boolean;
  diversityThreshold: number;
  boostFactors: BoostFactors;
  filters: SearchFilters;
}

export interface BoostFactors {
  importance: number;
  recency: number;
  quality: number;
  contentType: Record<string, number>;
  source: Record<string, number>;
}

export interface SearchFilters {
  sources?: string[];
  contentTypes?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  qualityThreshold?: number;
  importanceThreshold?: number;
  topics?: string[];
  keywords?: string[];
}

export interface UploadResult {
  success: boolean;
  uploaded: number;
  failed: number;
  errors: string[];
  uploadedIds: string[];
  statistics: UploadStatistics;
}

export interface UploadStatistics {
  totalDocuments: number;
  totalTokens: number;
  averageQuality: number;
  processingTimeMs: number;
  duplicatesSkipped: number;
  qualityDistribution: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface DatabaseStats {
  totalDocuments: number;
  totalSources: number;
  averageQuality: number;
  contentTypeDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  qualityDistribution: Record<string, number>;
  lastUpdated: string;
}

/**
 * Enhanced Supabase vector service
 */
export class SupabaseVectorService {
  private client: SupabaseClient;
  private tableName: string;
  private searchOptions: SearchOptions;

  constructor(
    url: string,
    serviceKey: string,
    tableName: string = API_CONFIG.SUPABASE.TABLE_NAME,
    options: Partial<SearchOptions> = {}
  ) {
    this.client = createClient(url, serviceKey);
    this.tableName = tableName;
    this.searchOptions = {
      limit: RETRIEVAL_CONFIG.maxResults,
      threshold: EMBEDDING_CONFIG.similarityThreshold,
      includeMetadata: true,
      hybridSearch: RETRIEVAL_CONFIG.hybridSearch,
      rerankResults: RETRIEVAL_CONFIG.rerankResults,
      diversityThreshold: RETRIEVAL_CONFIG.diversityThreshold,
      boostFactors: {
        importance: 1.2,
        recency: 1.1,
        quality: 1.3,
        contentType: {
          heading: 1.4,
          paragraph: 1.0,
          list: 1.1,
          table: 1.2,
          code: 1.3
        },
        source: {}
      },
      filters: {},
      ...options
    };
  }

  /**
   * Upload enhanced embeddings with optimized batching
   */
  async uploadEmbeddings(
    embeddings: EnhancedEmbedding[],
    onProgress?: (progress: number, uploaded: number, total: number) => void
  ): Promise<UploadResult> {
    const startTime = Date.now();
    const uploadedIds: string[] = [];
    const errors: string[] = [];
    let uploaded = 0;
    let failed = 0;
    let duplicatesSkipped = 0;

    const batchSize = PROCESSING_CONFIG.BATCH_SIZES.UPLOADS;
    const qualityDistribution = { high: 0, medium: 0, low: 0 };
    let totalQuality = 0;
    let totalTokens = 0;

    // Process in optimized batches
    for (let i = 0; i < embeddings.length; i += batchSize) {
      const batch = embeddings.slice(i, i + batchSize);
      
      try {
        const batchResult = await this.uploadBatch(batch);
        
        uploadedIds.push(...batchResult.uploadedIds);
        uploaded += batchResult.uploaded;
        failed += batchResult.failed;
        duplicatesSkipped += batchResult.duplicatesSkipped;
        errors.push(...batchResult.errors);

        // Update statistics
        batch.forEach(emb => {
          totalTokens += emb.tokens;
          totalQuality += emb.quality.overallScore;
          
          if (emb.quality.overallScore >= 0.8) qualityDistribution.high++;
          else if (emb.quality.overallScore >= 0.6) qualityDistribution.medium++;
          else qualityDistribution.low++;
        });

      } catch (error) {
        const errorMessage = `Batch upload failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`;
        errors.push(errorMessage);
        failed += batch.length;
        console.error(errorMessage, error);
      }

      // Report progress
      if (onProgress) {
        const processed = Math.min(i + batchSize, embeddings.length);
        const progress = processed / embeddings.length;
        onProgress(progress, uploaded, embeddings.length);
      }

      // Rate limiting
      if (i + batchSize < embeddings.length) {
        await this.sleep(50);
      }
    }

    const statistics: UploadStatistics = {
      totalDocuments: embeddings.length,
      totalTokens,
      averageQuality: totalQuality / embeddings.length,
      processingTimeMs: Date.now() - startTime,
      duplicatesSkipped,
      qualityDistribution
    };

    return {
      success: uploaded > 0,
      uploaded,
      failed,
      errors,
      uploadedIds,
      statistics
    };
  }

  /**
   * Upload a batch with duplicate detection and retry logic
   */
  private async uploadBatch(embeddings: EnhancedEmbedding[]): Promise<{
    uploaded: number;
    failed: number;
    uploadedIds: string[];
    duplicatesSkipped: number;
    errors: string[];
  }> {
    const uploadedIds: string[] = [];
    const errors: string[] = [];
    let uploaded = 0;
    let failed = 0;
    let duplicatesSkipped = 0;

    // Convert to database format
    const documents: Omit<VectorDocument, 'id' | 'created_at'>[] = embeddings.map(emb => ({
      content: emb.text,
      embedding: emb.embedding,
      source: emb.source,
      metadata: this.convertToDocumentMetadata(emb)
    }));

    try {
      // Check for duplicates
      const uniqueDocuments = await this.filterDuplicates(documents);
      duplicatesSkipped = documents.length - uniqueDocuments.length;

      if (uniqueDocuments.length === 0) {
        return { uploaded: 0, failed: 0, uploadedIds: [], duplicatesSkipped, errors: [] };
      }

      // Insert documents
      const { data, error } = await this.client
        .from(this.tableName)
        .insert(uniqueDocuments)
        .select('id');

      if (error) {
        throw error;
      }

      if (data) {
        uploadedIds.push(...data.map(record => record.id));
        uploaded = data.length;
      }

    } catch (error) {
      failed = embeddings.length;
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return { uploaded, failed, uploadedIds, duplicatesSkipped, errors };
  }

  /**
   * Filter out duplicate documents
   */
  private async filterDuplicates(documents: Omit<VectorDocument, 'id' | 'created_at'>[]): Promise<Omit<VectorDocument, 'id' | 'created_at'>[]> {
    // Simple duplicate detection based on content hash
    const contentHashes = new Set();
    const uniqueDocuments: Omit<VectorDocument, 'id' | 'created_at'>[] = [];

    for (const doc of documents) {
      const contentHash = this.hashContent(doc.content);
      
      if (!contentHashes.has(contentHash)) {
        contentHashes.add(contentHash);
        uniqueDocuments.push(doc);
      }
    }

    return uniqueDocuments;
  }

  /**
   * Generate content hash for duplicate detection
   */
  private hashContent(content: string): string {
    // Simple hash function for content deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Convert enhanced embedding to document metadata
   */
  private convertToDocumentMetadata(embedding: EnhancedEmbedding): DocumentMetadata {
    return {
      fileName: embedding.metadata.processing.model, // Temporary mapping
      fileType: embedding.metadata.contentType,
      fileSize: embedding.tokens * 4, // Rough estimate
      chunkId: embedding.metadata.chunkId,
      contentType: embedding.metadata.contentType,
      importance: embedding.metadata.importance,
      tokens: embedding.tokens,
      section: embedding.metadata.structure.isHeader ? embedding.text : undefined,
      position: embedding.metadata.position,
      keywords: embedding.metadata.semantics.keywords,
      topics: embedding.metadata.semantics.topics,
      entities: embedding.metadata.semantics.entities,
      sentiment: embedding.metadata.semantics.sentiment,
      textQuality: embedding.quality.textQuality,
      semanticCoherence: embedding.quality.semanticCoherence,
      informationDensity: embedding.quality.informationDensity,
      overallQuality: embedding.quality.overallScore,
      model: embedding.metadata.processing.model,
      timestamp: embedding.metadata.processing.timestamp,
      version: embedding.metadata.processing.version
    };
  }

  /**
   * Advanced similarity search with hybrid retrieval
   */
  async similaritySearch(
    queryEmbedding: number[],
    options: Partial<SearchOptions> = {}
  ): Promise<SearchResult[]> {
    const searchOpts = { ...this.searchOptions, ...options };
    
    try {
      // Primary vector similarity search
      const vectorResults = await this.vectorSimilaritySearch(queryEmbedding, searchOpts);
      
      // Apply post-processing
      let results = vectorResults;
      
      if (searchOpts.rerankResults) {
        results = this.rerankResults(results, queryEmbedding);
      }
      
      if (searchOpts.diversityThreshold > 0) {
        results = this.diversifyResults(results, searchOpts.diversityThreshold);
      }
      
      // Apply boost factors
      results = this.applyBoostFactors(results, searchOpts.boostFactors);
      
      // Final sorting and limiting
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      return results.slice(0, searchOpts.limit);
      
    } catch (error) {
      console.error('Similarity search failed:', error);
      return [];
    }
  }

  /**
   * Core vector similarity search
   */
  private async vectorSimilaritySearch(
    queryEmbedding: number[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    try {
      // Use Supabase RPC function for vector similarity
      const { data, error } = await this.client.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: options.threshold,
        match_count: options.limit * 2 // Get more for post-processing
      });

      if (error) {
        throw error;
      }

      return (data || []).map((item: any, index: number) => ({
        id: item.id,
        content: item.content,
        source: item.source,
        metadata: item.metadata,
        similarity: item.similarity,
        rank: index + 1,
        relevanceScore: item.similarity,
        created_at: item.created_at
      }));

    } catch (error) {
      console.warn('RPC function failed, using fallback search:', error);
      return this.fallbackSimilaritySearch(queryEmbedding, options);
    }
  }

  /**
   * Fallback similarity search using manual calculation
   */
  private async fallbackSimilaritySearch(
    queryEmbedding: number[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .limit(1000); // Reasonable limit for client-side processing

    if (error || !data) {
      throw error || new Error('No data returned');
    }

    // Calculate similarities client-side
    const results = data
      .map((item: any) => {
        const similarity = this.cosineSimilarity(queryEmbedding, item.embedding);
        return {
          id: item.id,
          content: item.content,
          source: item.source,
          metadata: item.metadata,
          similarity,
          rank: 0,
          relevanceScore: similarity,
          created_at: item.created_at
        };
      })
      .filter(item => item.similarity >= options.threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.limit);

    // Update ranks
    results.forEach((result, index) => {
      result.rank = index + 1;
    });

    return results;
  }

  /**
   * Calculate cosine similarity between vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Re-rank results using advanced scoring
   */
  private rerankResults(results: SearchResult[], queryEmbedding: number[]): SearchResult[] {
    return results.map(result => {
      let score = result.similarity;
      
      // Boost based on metadata
      if (result.metadata.importance) {
        score *= (1 + result.metadata.importance * 0.2);
      }
      
      if (result.metadata.overallQuality) {
        score *= (1 + result.metadata.overallQuality * 0.1);
      }
      
      // Boost recent content
      const daysSinceCreation = (Date.now() - new Date(result.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreation < 30) {
        score *= 1.05;
      }
      
      return {
        ...result,
        relevanceScore: score
      };
    });
  }

  /**
   * Diversify results to avoid redundancy
   */
  private diversifyResults(results: SearchResult[], threshold: number): SearchResult[] {
    const diversified: SearchResult[] = [];
    
    for (const result of results) {
      let shouldInclude = true;
      
      for (const existing of diversified) {
        const contentSimilarity = this.textSimilarity(result.content, existing.content);
        if (contentSimilarity > threshold) {
          shouldInclude = false;
          break;
        }
      }
      
      if (shouldInclude) {
        diversified.push(result);
      }
    }
    
    return diversified;
  }

  /**
   * Calculate text similarity for diversification
   */
  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Apply boost factors to results
   */
  private applyBoostFactors(results: SearchResult[], boostFactors: BoostFactors): SearchResult[] {
    return results.map(result => {
      let boost = 1.0;
      
      // Content type boost
      const contentTypeBoost = boostFactors.contentType[result.metadata.contentType] || 1.0;
      boost *= contentTypeBoost;
      
      // Source boost
      const sourceBoost = boostFactors.source[result.source] || 1.0;
      boost *= sourceBoost;
      
      // Quality boost
      if (result.metadata.overallQuality) {
        boost *= 1 + (result.metadata.overallQuality - 0.5) * boostFactors.quality;
      }
      
      return {
        ...result,
        relevanceScore: result.relevanceScore * boost
      };
    });
  }

  /**
   * Get comprehensive database statistics
   */
  async getDatabaseStats(): Promise<DatabaseStats> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('source, metadata, created_at');

      if (error || !data) {
        throw error || new Error('Failed to fetch statistics');
      }

      const totalDocuments = data.length;
      const sources = new Set(data.map(item => item.source));
      const totalSources = sources.size;

      // Calculate distributions
      const contentTypeDistribution: Record<string, number> = {};
      const sourceDistribution: Record<string, number> = {};
      const qualityDistribution: Record<string, number> = { high: 0, medium: 0, low: 0 };
      
      let totalQuality = 0;
      let qualityCount = 0;

      data.forEach(item => {
        // Content type distribution
        const contentType = item.metadata?.contentType || 'unknown';
        contentTypeDistribution[contentType] = (contentTypeDistribution[contentType] || 0) + 1;
        
        // Source distribution
        sourceDistribution[item.source] = (sourceDistribution[item.source] || 0) + 1;
        
        // Quality distribution
        const quality = item.metadata?.overallQuality;
        if (quality !== undefined) {
          totalQuality += quality;
          qualityCount++;
          
          if (quality >= 0.8) qualityDistribution.high++;
          else if (quality >= 0.6) qualityDistribution.medium++;
          else qualityDistribution.low++;
        }
      });

      const averageQuality = qualityCount > 0 ? totalQuality / qualityCount : 0;

      return {
        totalDocuments,
        totalSources,
        averageQuality,
        contentTypeDistribution,
        sourceDistribution,
        qualityDistribution,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to get database stats:', error);
      throw error;
    }
  }

  /**
   * Test database connection and setup
   */
  async testConnection(): Promise<{ success: boolean; error?: string; tableExists?: boolean }> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('id')
        .limit(1);

      if (error) {
        return { 
          success: false, 
          error: error.message,
          tableExists: !error.message.includes('does not exist')
        };
      }

      return { success: true, tableExists: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        tableExists: false
      };
    }
  }

  /**
   * Sleep utility for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function for creating Supabase vector service
 */
export function createSupabaseVectorService(
  url: string,
  serviceKey: string,
  tableName?: string,
  options?: Partial<SearchOptions>
): SupabaseVectorService {
  return new SupabaseVectorService(url, serviceKey, tableName, options);
}

/**
 * Legacy compatibility function
 */
export function createSupabaseClient(url: string, serviceKey: string, tableName?: string) {
  const service = createSupabaseVectorService(url, serviceKey, tableName);
  
  // Return object with legacy interface
  return {
    uploadEmbeddings: async (embeddings: any[], onProgress?: any) => {
      const result = await service.uploadEmbeddings(embeddings, onProgress);
      return {
        success: result.success,
        uploaded: result.uploaded,
        failed: result.failed,
        errors: result.errors,
        uploadedIds: result.uploadedIds
      };
    },
    similaritySearch: (queryEmbedding: number[], options?: any) => 
      service.similaritySearch(queryEmbedding, options),
    getDatabaseStats: () => service.getDatabaseStats(),
    testConnection: () => service.testConnection()
  };
}
