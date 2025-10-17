/**
 * Enhanced OpenAI service for industry-standard embeddings
 * Optimized for serverless RAG with advanced embedding strategies
 */

import OpenAI from 'openai';
import { 
  EMBEDDING_CONFIG, 
  METADATA_CONFIG,
  estimateTokenCount 
} from '../config/embeddings';
import { API_CONFIG, PROCESSING_CONFIG } from '../config/constants';
import type { SemanticChunk } from '../processors/semanticChunker';

export interface EnhancedEmbedding {
  id: string;
  embedding: number[];
  text: string;
  tokens: number;
  source: string;
  metadata: EmbeddingMetadata;
  quality: EmbeddingQuality;
}

export interface EmbeddingMetadata {
  chunkId: string;
  contentType: string;
  importance: number;
  position: {
    documentIndex: number;
    sectionIndex: number;
    paragraphIndex: number;
  };
  semantics: {
    keywords: string[];
    topics: string[];
    entities: string[];
    sentiment: number;
  };
  structure: {
    isHeader: boolean;
    headerLevel?: number;
    listItem: boolean;
    tableCell: boolean;
  };
  relationships: {
    parentChunk?: string;
    childChunks: string[];
    siblingChunks: string[];
    references: string[];
  };
  processing: {
    model: string;
    timestamp: string;
    version: string;
    confidence: number;
  };
}

export interface EmbeddingQuality {
  textQuality: number;
  semanticCoherence: number;
  informationDensity: number;
  uniqueness: number;
  retrievalOptimization: number;
  overallScore: number;
}

export interface BatchEmbeddingResult {
  success: boolean;
  embeddings: EnhancedEmbedding[];
  errors: string[];
  statistics: EmbeddingStatistics;
}

export interface EmbeddingStatistics {
  totalChunks: number;
  successfulEmbeddings: number;
  failedEmbeddings: number;
  totalTokensUsed: number;
  estimatedCost: number;
  averageTokensPerChunk: number;
  processingTimeMs: number;
  qualityMetrics: {
    averageQuality: number;
    highQualityCount: number;
    lowQualityCount: number;
  };
}

export interface EmbeddingOptions {
  model: string;
  dimensions?: number;
  batchSize: number;
  maxRetries: number;
  retryDelay: number;
  qualityThreshold: number;
  optimizeForRetrieval: boolean;
  includeMetadata: boolean;
}

/**
 * Enhanced OpenAI embedding service
 */
export class OpenAIEmbeddingService {
  private client: OpenAI;
  private options: EmbeddingOptions;

  constructor(apiKey: string, options: Partial<EmbeddingOptions> = {}) {
    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true
    });

    this.options = {
      model: EMBEDDING_CONFIG.model,
      dimensions: EMBEDDING_CONFIG.dimensions,
      batchSize: EMBEDDING_CONFIG.batchSize,
      maxRetries: EMBEDDING_CONFIG.maxRetries,
      retryDelay: EMBEDDING_CONFIG.retryDelay,
      qualityThreshold: 0.7,
      optimizeForRetrieval: true,
      includeMetadata: true,
      ...options
    };
  }

  /**
   * Generate embeddings for semantic chunks with enhanced metadata
   */
  async generateEmbeddings(
    chunks: SemanticChunk[],
    onProgress?: (progress: number, current: number, total: number) => void
  ): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();
    const embeddings: EnhancedEmbedding[] = [];
    const errors: string[] = [];
    let totalTokensUsed = 0;

    // Process in batches for optimal performance
    for (let i = 0; i < chunks.length; i += this.options.batchSize) {
      const batch = chunks.slice(i, i + this.options.batchSize);
      
      try {
        const batchResult = await this.processBatch(batch);
        embeddings.push(...batchResult.embeddings);
        totalTokensUsed += batchResult.tokensUsed;
        errors.push(...batchResult.errors);
      } catch (error) {
        const errorMessage = `Batch ${Math.floor(i / this.options.batchSize) + 1} failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`;
        errors.push(errorMessage);
        console.error(errorMessage, error);
      }

      // Report progress
      if (onProgress) {
        const processed = Math.min(i + this.options.batchSize, chunks.length);
        const progress = processed / chunks.length;
        onProgress(progress, processed, chunks.length);
      }

      // Rate limiting delay
      if (i + this.options.batchSize < chunks.length) {
        await this.sleep(100);
      }
    }

    // Calculate statistics
    const statistics = this.calculateStatistics(
      chunks.length,
      embeddings,
      errors,
      totalTokensUsed,
      Date.now() - startTime
    );

    return {
      success: embeddings.length > 0,
      embeddings,
      errors,
      statistics
    };
  }

  /**
   * Process a batch of chunks
   */
  private async processBatch(chunks: SemanticChunk[]): Promise<{
    embeddings: EnhancedEmbedding[];
    tokensUsed: number;
    errors: string[];
  }> {
    const embeddings: EnhancedEmbedding[] = [];
    const errors: string[] = [];
    let tokensUsed = 0;

    // Prepare texts for embedding
    const texts = chunks.map(chunk => this.optimizeTextForEmbedding(chunk.content));
    
    try {
      // Generate embeddings using OpenAI API
      const response = await this.client.embeddings.create({
        model: this.options.model,
        input: texts,
        encoding_format: 'float',
        dimensions: this.options.dimensions
      });

      if (!response.data || response.data.length !== texts.length) {
        throw new Error('Mismatch between input texts and embedding results');
      }

      // Process results
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embeddingData = response.data[i];
        
        try {
          const enhancedEmbedding = await this.createEnhancedEmbedding(
            chunk,
            embeddingData.embedding,
            texts[i]
          );
          
          // Quality check
          if (enhancedEmbedding.quality.overallScore >= this.options.qualityThreshold) {
            embeddings.push(enhancedEmbedding);
          } else {
            errors.push(`Low quality embedding for chunk ${chunk.id}`);
          }
        } catch (error) {
          errors.push(`Failed to process chunk ${chunk.id}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`);
        }
      }

      tokensUsed = response.usage?.total_tokens || 0;

    } catch (error) {
      // Fallback to individual processing
      console.warn('Batch processing failed, falling back to individual requests:', error);
      
      for (const chunk of chunks) {
        try {
          const result = await this.generateSingleEmbedding(chunk);
          embeddings.push(result.embedding);
          tokensUsed += result.tokensUsed;
        } catch (individualError) {
          errors.push(`Individual embedding failed for chunk ${chunk.id}: ${
            individualError instanceof Error ? individualError.message : 'Unknown error'
          }`);
        }
      }
    }

    return { embeddings, tokensUsed, errors };
  }

  /**
   * Generate single embedding with retry logic
   */
  private async generateSingleEmbedding(
    chunk: SemanticChunk,
    retryCount = 0
  ): Promise<{ embedding: EnhancedEmbedding; tokensUsed: number }> {
    try {
      const optimizedText = this.optimizeTextForEmbedding(chunk.content);
      
      const response = await this.client.embeddings.create({
        model: this.options.model,
        input: optimizedText,
        encoding_format: 'float',
        dimensions: this.options.dimensions
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data received');
      }

      const enhancedEmbedding = await this.createEnhancedEmbedding(
        chunk,
        response.data[0].embedding,
        optimizedText
      );

      return {
        embedding: enhancedEmbedding,
        tokensUsed: response.usage?.total_tokens || 0
      };

    } catch (error) {
      if (retryCount < this.options.maxRetries) {
        console.warn(`Embedding attempt ${retryCount + 1} failed, retrying...`, error);
        await this.sleep(this.options.retryDelay * Math.pow(2, retryCount));
        return this.generateSingleEmbedding(chunk, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Optimize text for embedding generation
   */
  private optimizeTextForEmbedding(text: string): string {
    if (!this.options.optimizeForRetrieval) {
      return text;
    }

    // Remove excessive whitespace
    let optimized = text.replace(/\s+/g, ' ').trim();
    
    // Ensure optimal length
    const maxTokens = EMBEDDING_CONFIG.maxTokensPerChunk;
    const estimatedTokens = estimateTokenCount(optimized);
    
    if (estimatedTokens > maxTokens) {
      // Truncate while preserving sentence boundaries
      const sentences = optimized.split(/[.!?]+/);
      let truncated = '';
      let tokens = 0;
      
      for (const sentence of sentences) {
        const sentenceTokens = estimateTokenCount(sentence);
        if (tokens + sentenceTokens > maxTokens) break;
        
        truncated += (truncated ? '. ' : '') + sentence.trim();
        tokens += sentenceTokens;
      }
      
      optimized = truncated || optimized.substring(0, maxTokens * 4); // Fallback
    }

    return optimized;
  }

  /**
   * Create enhanced embedding with rich metadata
   */
  private async createEnhancedEmbedding(
    chunk: SemanticChunk,
    embedding: number[],
    optimizedText: string
  ): Promise<EnhancedEmbedding> {
    // Generate enhanced metadata
    const metadata = this.generateEmbeddingMetadata(chunk);
    
    // Calculate quality metrics
    const quality = this.calculateEmbeddingQuality(chunk, embedding, optimizedText);

    return {
      id: `emb_${chunk.id}_${Date.now()}`,
      embedding,
      text: optimizedText,
      tokens: estimateTokenCount(optimizedText),
      source: chunk.metadata.source,
      metadata,
      quality
    };
  }

  /**
   * Generate comprehensive embedding metadata
   */
  private generateEmbeddingMetadata(chunk: SemanticChunk): EmbeddingMetadata {
    return {
      chunkId: chunk.id,
      contentType: chunk.contentType,
      importance: chunk.importance,
      position: {
        documentIndex: chunk.position.documentIndex,
        sectionIndex: chunk.position.sectionIndex,
        paragraphIndex: chunk.position.paragraphIndex
      },
      semantics: {
        keywords: chunk.metadata.keywords,
        topics: chunk.metadata.topics,
        entities: this.extractEntities(chunk.content),
        sentiment: this.analyzeSentiment(chunk.content)
      },
      structure: {
        isHeader: chunk.contentType === 'heading',
        headerLevel: chunk.contentType === 'heading' ? this.detectHeaderLevel(chunk.content) : undefined,
        listItem: chunk.content.match(/^\s*[-*+]\s/) !== null,
        tableCell: chunk.contentType === 'table'
      },
      relationships: {
        parentChunk: chunk.relationships.find(r => r.type === 'parent')?.targetChunkId,
        childChunks: chunk.relationships.filter(r => r.type === 'child').map(r => r.targetChunkId),
        siblingChunks: chunk.relationships.filter(r => r.type === 'sibling').map(r => r.targetChunkId),
        references: chunk.relationships.filter(r => r.type === 'reference').map(r => r.targetChunkId)
      },
      processing: {
        model: this.options.model,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        confidence: 0.95
      }
    };
  }

  /**
   * Calculate embedding quality metrics
   */
  private calculateEmbeddingQuality(
    chunk: SemanticChunk,
    embedding: number[],
    optimizedText: string
  ): EmbeddingQuality {
    // Text quality (based on chunk quality and optimization)
    const textQuality = Math.min(1.0, chunk.tokens / EMBEDDING_CONFIG.maxTokensPerChunk);
    
    // Semantic coherence (based on content type and structure)
    const semanticCoherence = this.assessSemanticCoherence(chunk);
    
    // Information density (based on keyword density and content richness)
    const informationDensity = this.assessInformationDensity(optimizedText);
    
    // Uniqueness (based on content uniqueness indicators)
    const uniqueness = this.assessUniqueness(optimizedText);
    
    // Retrieval optimization (based on optimization applied)
    const retrievalOptimization = this.options.optimizeForRetrieval ? 0.9 : 0.7;
    
    // Overall score
    const overallScore = (
      textQuality * 0.2 +
      semanticCoherence * 0.25 +
      informationDensity * 0.25 +
      uniqueness * 0.15 +
      retrievalOptimization * 0.15
    );

    return {
      textQuality,
      semanticCoherence,
      informationDensity,
      uniqueness,
      retrievalOptimization,
      overallScore
    };
  }

  /**
   * Assess semantic coherence
   */
  private assessSemanticCoherence(chunk: SemanticChunk): number {
    let score = 0.7; // Base score
    
    // Boost for structured content
    if (chunk.contentType === 'heading') score += 0.2;
    if (chunk.metadata.section) score += 0.1;
    
    // Boost for high importance
    score += chunk.importance * 0.2;
    
    return Math.min(1.0, score);
  }

  /**
   * Assess information density
   */
  private assessInformationDensity(text: string): number {
    const words = text.split(/\s+/);
    const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
    const density = uniqueWords / words.length;
    
    return Math.min(1.0, density * 2); // Scale to 0-1
  }

  /**
   * Assess content uniqueness
   */
  private assessUniqueness(text: string): number {
    // Simple uniqueness based on character variety
    const uniqueChars = new Set(text.toLowerCase()).size;
    const totalChars = text.length;
    
    return Math.min(1.0, uniqueChars / Math.min(totalChars, 50));
  }

  /**
   * Extract named entities (simplified)
   */
  private extractEntities(text: string): string[] {
    const entities: string[] = [];
    
    // Simple pattern matching for common entities
    const patterns = [
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, // Person names
      /\b[A-Z]{2,}\b/g, // Acronyms
      /\b\d{4}\b/g, // Years
      /\$\d+(?:,\d{3})*(?:\.\d{2})?\b/g // Money
    ];
    
    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        entities.push(...matches);
      }
    });
    
    return [...new Set(entities)].slice(0, 10); // Dedupe and limit
  }

  /**
   * Analyze sentiment (simplified)
   */
  private analyzeSentiment(text: string): number {
    const positiveWords = ['good', 'great', 'excellent', 'positive', 'success', 'effective'];
    const negativeWords = ['bad', 'poor', 'negative', 'failure', 'problem', 'issue'];
    
    const words = text.toLowerCase().split(/\s+/);
    const positive = words.filter(w => positiveWords.includes(w)).length;
    const negative = words.filter(w => negativeWords.includes(w)).length;
    
    if (positive + negative === 0) return 0; // Neutral
    return (positive - negative) / (positive + negative);
  }

  /**
   * Detect header level
   */
  private detectHeaderLevel(text: string): number {
    const match = text.match(/^(#+)\s/);
    return match ? match[1].length : 1;
  }

  /**
   * Calculate comprehensive statistics
   */
  private calculateStatistics(
    totalChunks: number,
    embeddings: EnhancedEmbedding[],
    errors: string[],
    totalTokensUsed: number,
    processingTimeMs: number
  ): EmbeddingStatistics {
    const successfulEmbeddings = embeddings.length;
    const failedEmbeddings = totalChunks - successfulEmbeddings;
    const averageTokensPerChunk = successfulEmbeddings > 0 ? totalTokensUsed / successfulEmbeddings : 0;
    const estimatedCost = this.calculateCost(totalTokensUsed);
    
    // Quality metrics
    const qualityScores = embeddings.map(e => e.quality.overallScore);
    const averageQuality = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length || 0;
    const highQualityCount = qualityScores.filter(score => score >= 0.8).length;
    const lowQualityCount = qualityScores.filter(score => score < 0.6).length;

    return {
      totalChunks,
      successfulEmbeddings,
      failedEmbeddings,
      totalTokensUsed,
      estimatedCost,
      averageTokensPerChunk,
      processingTimeMs,
      qualityMetrics: {
        averageQuality,
        highQualityCount,
        lowQualityCount
      }
    };
  }

  /**
   * Calculate estimated cost
   */
  private calculateCost(tokenCount: number): number {
    const pricePerMillion = 0.02; // text-embedding-3-small pricing
    return (tokenCount / 1000000) * pricePerMillion;
  }

  /**
   * Generate query embedding for search
   */
  async generateQueryEmbedding(queryText: string): Promise<number[]> {
    const optimizedQuery = this.optimizeTextForEmbedding(queryText);
    
    const response = await this.client.embeddings.create({
      model: this.options.model,
      input: optimizedQuery,
      encoding_format: 'float',
      dimensions: this.options.dimensions
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('No embedding data received for query');
    }

    return response.data[0].embedding;
  }

  /**
   * Sleep utility for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function for creating OpenAI embedding service
 */
export function createOpenAIEmbeddingService(
  apiKey: string,
  options?: Partial<EmbeddingOptions>
): OpenAIEmbeddingService {
  return new OpenAIEmbeddingService(apiKey, options);
}

/**
 * Legacy compatibility function
 */
export function createOpenAIClient(apiKey: string, options?: any) {
  const service = createOpenAIEmbeddingService(apiKey, options);

  // Return object with legacy interface
  return {
    generateEmbeddings: async (chunks: any[], onProgress?: any) => {
      const result = await service.generateEmbeddings(chunks, onProgress);
      return {
        success: result.success,
        embeddings: result.embeddings.map(e => ({
          embedding: e.embedding,
          text: e.text,
          index: parseInt(e.id.split('_')[1]) || 0,
          source: e.source,
          metadata: e.metadata
        })),
        errors: result.errors,
        totalTokensUsed: result.statistics.totalTokensUsed,
        totalCost: result.statistics.estimatedCost
      };
    },
    generateQueryEmbedding: (queryText: string) => service.generateQueryEmbedding(queryText)
  };
}
