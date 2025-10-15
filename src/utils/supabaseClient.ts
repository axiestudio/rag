/**
 * Client-side Supabase integration for serverless RAG
 * Handles vector storage and similarity search directly from the browser
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { EmbeddingResult } from './openaiClient';

export interface DocumentRecord {
  id?: string;
  content: string;
  embedding: number[];
  source: string;
  metadata: any;
  created_at?: string;
}

export interface SimilaritySearchResult {
  id: string;
  content: string;
  source: string;
  metadata: any;
  similarity: number;
  created_at: string;
}

export interface SearchOptions {
  limit: number;
  threshold: number;
  includeMetadata: boolean;
}

export interface UploadResult {
  success: boolean;
  uploaded: number;
  failed: number;
  errors: string[];
  uploadedIds: string[];
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  limit: 10,
  threshold: 0.7,
  includeMetadata: true
};

/**
 * Supabase client wrapper for vector operations
 */
export class SupabaseVectorClient {
  private client: SupabaseClient;
  private tableName: string;

  constructor(url: string, serviceKey: string, tableName = 'documents') {
    this.client = createClient(url, serviceKey);
    this.tableName = tableName;
  }

  /**
   * Test the database connection and table structure
   */
  async testConnection(): Promise<{ success: boolean; error?: string; tableExists?: boolean }> {
    try {
      // Test basic connection
      const { data, error } = await this.client
        .from(this.tableName)
        .select('id')
        .limit(1);

      if (error) {
        if (error.message.includes('relation') && error.message.includes('does not exist')) {
          return {
            success: false,
            error: 'Documents table does not exist. Please run the SQL setup first.',
            tableExists: false
          };
        }
        return {
          success: false,
          error: error.message,
          tableExists: false
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
   * Check if the pgvector extension is enabled
   */
  async checkVectorExtension(): Promise<{ enabled: boolean; error?: string }> {
    try {
      const { data, error } = await this.client.rpc('check_vector_extension');
      
      if (error) {
        return { enabled: false, error: error.message };
      }
      
      return { enabled: true };
    } catch (error) {
      // If the function doesn't exist, we can't check directly
      // Try a vector operation instead
      try {
        await this.client
          .from(this.tableName)
          .select('embedding')
          .limit(1);
        return { enabled: true };
      } catch (vectorError) {
        return {
          enabled: false,
          error: 'pgvector extension may not be enabled'
        };
      }
    }
  }

  /**
   * Upload embeddings to Supabase in batches
   */
  async uploadEmbeddings(
    embeddings: EmbeddingResult[],
    onProgress?: (progress: number, uploaded: number, total: number) => void
  ): Promise<UploadResult> {
    const batchSize = 50; // Supabase batch limit
    const uploadedIds: string[] = [];
    const errors: string[] = [];
    let uploaded = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < embeddings.length; i += batchSize) {
      const batch = embeddings.slice(i, i + batchSize);
      
      try {
        // Prepare records for insertion
        const records: Omit<DocumentRecord, 'id' | 'created_at'>[] = batch.map(emb => ({
          content: emb.text,
          embedding: emb.embedding,
          source: emb.source,
          metadata: {
            ...emb.metadata,
            original_index: emb.index
          }
        }));

        const { data, error } = await this.client
          .from(this.tableName)
          .insert(records)
          .select('id');

        if (error) {
          throw error;
        }

        if (data) {
          uploadedIds.push(...data.map(record => record.id));
          uploaded += batch.length;
        }

      } catch (error) {
        const errorMessage = `Batch ${Math.floor(i / batchSize) + 1} failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`;
        errors.push(errorMessage);
        failed += batch.length;
        console.error(errorMessage);
      }

      // Report progress
      if (onProgress) {
        const processed = Math.min(i + batchSize, embeddings.length);
        const progress = processed / embeddings.length;
        onProgress(progress, uploaded, embeddings.length);
      }

      // Small delay between batches
      if (i + batchSize < embeddings.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      success: uploaded > 0,
      uploaded,
      failed,
      errors,
      uploadedIds
    };
  }

  /**
   * Perform similarity search using vector similarity
   */
  async similaritySearch(
    queryEmbedding: number[],
    options: Partial<SearchOptions> = {}
  ): Promise<SimilaritySearchResult[]> {
    const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options };

    try {
      // Use Supabase's vector similarity function
      const { data, error } = await this.client.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: opts.threshold,
        match_count: opts.limit
      });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      // Fallback to manual similarity calculation if RPC function doesn't exist
      console.warn('RPC function not available, using fallback similarity search');
      return this.fallbackSimilaritySearch(queryEmbedding, opts);
    }
  }

  /**
   * Fallback similarity search using manual calculation
   */
  private async fallbackSimilaritySearch(
    queryEmbedding: number[],
    options: SearchOptions
  ): Promise<SimilaritySearchResult[]> {
    try {
      // Fetch all documents (this is not efficient for large datasets)
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .limit(1000); // Limit to prevent memory issues

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Calculate cosine similarity for each document
      const results = data
        .map(doc => {
          const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
          return {
            id: doc.id,
            content: doc.content,
            source: doc.source,
            metadata: doc.metadata,
            similarity,
            created_at: doc.created_at
          };
        })
        .filter(result => result.similarity >= options.threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, options.limit);

      return results;
    } catch (error) {
      console.error('Fallback similarity search failed:', error);
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Get document count
   */
  async getDocumentCount(): Promise<number> {
    try {
      const { count, error } = await this.client
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        throw error;
      }

      return count || 0;
    } catch (error) {
      console.error('Failed to get document count:', error);
      return 0;
    }
  }

  /**
   * Get documents by source
   */
  async getDocumentsBySource(source: string): Promise<DocumentRecord[]> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('source', source);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get documents by source:', error);
      return [];
    }
  }

  /**
   * Delete documents by source
   */
  async deleteDocumentsBySource(source: string): Promise<{ success: boolean; deleted: number; error?: string }> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .delete()
        .eq('source', source)
        .select('id');

      if (error) {
        throw error;
      }

      return {
        success: true,
        deleted: data?.length || 0
      };
    } catch (error) {
      return {
        success: false,
        deleted: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Clear all documents
   */
  async clearAllDocuments(): Promise<{ success: boolean; deleted: number; error?: string }> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all except non-existent ID
        .select('id');

      if (error) {
        throw error;
      }

      return {
        success: true,
        deleted: data?.length || 0
      };
    } catch (error) {
      return {
        success: false,
        deleted: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Utility function to create a Supabase client
 */
export function createSupabaseClient(
  url: string,
  serviceKey: string,
  tableName?: string
): SupabaseVectorClient {
  return new SupabaseVectorClient(url, serviceKey, tableName);
}
