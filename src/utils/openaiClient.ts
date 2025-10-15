/**
 * Client-side OpenAI integration for serverless RAG
 * Handles embeddings generation directly from the browser
 */

import OpenAI from 'openai';
import type { TextChunk } from './textChunker';

export interface EmbeddingResult {
  embedding: number[];
  text: string;
  index: number;
  source: string;
  metadata: any;
}

export interface BatchEmbeddingResult {
  success: boolean;
  embeddings: EmbeddingResult[];
  errors: string[];
  totalTokensUsed: number;
  totalCost: number; // Estimated cost in USD
}

export interface EmbeddingOptions {
  model: string;
  batchSize: number;
  maxRetries: number;
  retryDelay: number;
}

export const DEFAULT_EMBEDDING_OPTIONS: EmbeddingOptions = {
  model: 'text-embedding-3-small',
  batchSize: 50,
  maxRetries: 3,
  retryDelay: 1000
};

/**
 * OpenAI client wrapper for embeddings
 */
export class OpenAIEmbeddingClient {
  private client: OpenAI;
  private options: EmbeddingOptions;

  constructor(apiKey: string, options: Partial<EmbeddingOptions> = {}) {
    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true // Required for browser usage
    });
    this.options = { ...DEFAULT_EMBEDDING_OPTIONS, ...options };
  }

  /**
   * Calculate estimated cost for embeddings
   */
  private calculateCost(tokenCount: number, model: string): number {
    // Pricing as of 2024 (per 1M tokens)
    const pricing: Record<string, number> = {
      'text-embedding-3-small': 0.02,
      'text-embedding-3-large': 0.13,
      'text-embedding-ada-002': 0.10
    };
    
    const pricePerMillion = pricing[model] || pricing['text-embedding-3-small'];
    return (tokenCount / 1000000) * pricePerMillion;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate embedding for a single text with retry logic
   */
  private async generateEmbeddingWithRetry(
    text: string,
    retryCount = 0
  ): Promise<{ embedding: number[]; tokensUsed: number }> {
    try {
      const response = await this.client.embeddings.create({
        model: this.options.model,
        input: text,
        encoding_format: 'float'
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data received from OpenAI');
      }

      return {
        embedding: response.data[0].embedding,
        tokensUsed: response.usage?.total_tokens || 0
      };
    } catch (error) {
      if (retryCount < this.options.maxRetries) {
        console.warn(`Embedding attempt ${retryCount + 1} failed, retrying...`, error);
        await this.sleep(this.options.retryDelay * (retryCount + 1));
        return this.generateEmbeddingWithRetry(text, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Generate embeddings for a batch of texts
   */
  private async generateBatchEmbeddings(
    texts: string[]
  ): Promise<{ embeddings: number[][]; tokensUsed: number }> {
    try {
      const response = await this.client.embeddings.create({
        model: this.options.model,
        input: texts,
        encoding_format: 'float'
      });

      if (!response.data || response.data.length !== texts.length) {
        throw new Error('Mismatch between input texts and embedding results');
      }

      const embeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding);

      return {
        embeddings,
        tokensUsed: response.usage?.total_tokens || 0
      };
    } catch (error) {
      // If batch fails, fall back to individual requests
      console.warn('Batch embedding failed, falling back to individual requests:', error);
      
      const embeddings: number[][] = [];
      let totalTokens = 0;
      
      for (const text of texts) {
        try {
          const result = await this.generateEmbeddingWithRetry(text);
          embeddings.push(result.embedding);
          totalTokens += result.tokensUsed;
        } catch (individualError) {
          console.error('Individual embedding failed:', individualError);
          // Push a zero vector as placeholder
          embeddings.push(new Array(1536).fill(0));
        }
      }
      
      return { embeddings, tokensUsed: totalTokens };
    }
  }

  /**
   * Generate embeddings for text chunks
   */
  async generateEmbeddings(
    chunks: TextChunk[],
    onProgress?: (progress: number, current: number, total: number) => void
  ): Promise<BatchEmbeddingResult> {
    const embeddings: EmbeddingResult[] = [];
    const errors: string[] = [];
    let totalTokensUsed = 0;
    
    // Process chunks in batches
    const batches: TextChunk[][] = [];
    for (let i = 0; i < chunks.length; i += this.options.batchSize) {
      batches.push(chunks.slice(i, i + this.options.batchSize));
    }
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      try {
        const texts = batch.map(chunk => chunk.content);
        const result = await this.generateBatchEmbeddings(texts);
        
        totalTokensUsed += result.tokensUsed;
        
        // Create embedding results
        for (let i = 0; i < batch.length; i++) {
          const chunk = batch[i];
          const embedding = result.embeddings[i];
          
          if (embedding && embedding.length > 0) {
            embeddings.push({
              embedding,
              text: chunk.content,
              index: chunk.index,
              source: chunk.source,
              metadata: chunk.metadata
            });
          } else {
            errors.push(`Failed to generate embedding for chunk ${chunk.index} from ${chunk.source}`);
          }
        }
        
        // Report progress
        if (onProgress) {
          const processed = (batchIndex + 1) * this.options.batchSize;
          const progress = Math.min(processed / chunks.length, 1);
          onProgress(progress, Math.min(processed, chunks.length), chunks.length);
        }
        
      } catch (error) {
        const errorMessage = `Failed to process batch ${batchIndex + 1}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`;
        errors.push(errorMessage);
        console.error(errorMessage);
        
        // Add failed chunks to errors
        batch.forEach(chunk => {
          errors.push(`Failed to generate embedding for chunk ${chunk.index} from ${chunk.source}`);
        });
      }
      
      // Add a small delay between batches to avoid rate limiting
      if (batchIndex < batches.length - 1) {
        await this.sleep(100);
      }
    }
    
    const totalCost = this.calculateCost(totalTokensUsed, this.options.model);
    
    return {
      success: embeddings.length > 0,
      embeddings,
      errors,
      totalTokensUsed,
      totalCost
    };
  }

  /**
   * Generate embedding for a single query text
   */
  async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      const result = await this.generateEmbeddingWithRetry(query);
      return result.embedding;
    } catch (error) {
      throw new Error(`Failed to generate query embedding: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`);
    }
  }

  /**
   * Test the API connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.generateEmbeddingWithRetry('test');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Utility function to create an OpenAI client
 */
export function createOpenAIClient(
  apiKey: string,
  options?: Partial<EmbeddingOptions>
): OpenAIEmbeddingClient {
  return new OpenAIEmbeddingClient(apiKey, options);
}
