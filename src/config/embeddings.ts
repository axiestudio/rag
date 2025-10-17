/**
 * Industry-standard embedding configuration for optimal LLM retrieval
 * Optimized for serverless RAG systems with text-embedding-3-small
 */

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  maxTokensPerChunk: number;
  chunkOverlap: number;
  batchSize: number;
  similarityThreshold: number;
  maxRetries: number;
  retryDelay: number;
}

export interface ChunkingConfig {
  strategy: 'semantic' | 'fixed' | 'hybrid';
  maxTokens: number;
  minTokens: number;
  overlapPercentage: number;
  preserveSentences: boolean;
  preserveParagraphs: boolean;
  respectHeaders: boolean;
  semanticThreshold: number;
}

export interface MetadataConfig {
  includeStructure: boolean;
  includeContentType: boolean;
  includeSemanticTags: boolean;
  includePosition: boolean;
  includeStatistics: boolean;
  customFields: string[];
}

export interface RetrievalConfig {
  hybridSearch: boolean;
  rerankResults: boolean;
  contextWindow: number;
  maxResults: number;
  diversityThreshold: number;
  relevanceBoost: number;
}

/**
 * Industry-standard embedding configuration optimized for LLM retrieval
 */
export const EMBEDDING_CONFIG: EmbeddingConfig = {
  model: 'text-embedding-3-small',
  dimensions: 1536,
  maxTokensPerChunk: 512, // Optimal for most LLMs
  chunkOverlap: 102, // 20% overlap for context preservation
  batchSize: 50,
  similarityThreshold: 0.78, // Tuned for high precision
  maxRetries: 3,
  retryDelay: 1000
};

/**
 * Advanced chunking configuration for semantic coherence
 */
export const CHUNKING_CONFIG: ChunkingConfig = {
  strategy: 'semantic',
  maxTokens: 512,
  minTokens: 100,
  overlapPercentage: 20,
  preserveSentences: true,
  preserveParagraphs: true,
  respectHeaders: true,
  semanticThreshold: 0.85
};

/**
 * Metadata enrichment for enhanced retrieval
 */
export const METADATA_CONFIG: MetadataConfig = {
  includeStructure: true,
  includeContentType: true,
  includeSemanticTags: true,
  includePosition: true,
  includeStatistics: true,
  customFields: ['importance', 'topic', 'complexity']
};

/**
 * Retrieval optimization for LLM integration
 */
export const RETRIEVAL_CONFIG: RetrievalConfig = {
  hybridSearch: true,
  rerankResults: true,
  contextWindow: 4096, // Standard LLM context window
  maxResults: 10,
  diversityThreshold: 0.7,
  relevanceBoost: 1.2
};

/**
 * Content type classification for better retrieval
 */
export const CONTENT_TYPES = {
  HEADING: 'heading',
  PARAGRAPH: 'paragraph',
  LIST: 'list',
  TABLE: 'table',
  CODE: 'code',
  QUOTE: 'quote',
  FORMULA: 'formula',
  REFERENCE: 'reference'
} as const;

/**
 * Semantic importance levels for content prioritization
 */
export const IMPORTANCE_LEVELS = {
  CRITICAL: 1.0,
  HIGH: 0.8,
  MEDIUM: 0.6,
  LOW: 0.4,
  MINIMAL: 0.2
} as const;

/**
 * Token counting utility for accurate chunking
 */
export function estimateTokenCount(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters for English text
  // More accurate than simple word counting
  return Math.ceil(text.length / 4);
}

/**
 * Validate embedding configuration
 */
export function validateEmbeddingConfig(config: Partial<EmbeddingConfig>): boolean {
  const required = ['model', 'dimensions', 'maxTokensPerChunk'];
  return required.every(key => key in config);
}

/**
 * Get optimal chunk size based on content type
 */
export function getOptimalChunkSize(contentType: string): number {
  const sizeMap: Record<string, number> = {
    [CONTENT_TYPES.HEADING]: 256,
    [CONTENT_TYPES.PARAGRAPH]: 512,
    [CONTENT_TYPES.LIST]: 384,
    [CONTENT_TYPES.TABLE]: 768,
    [CONTENT_TYPES.CODE]: 1024,
    [CONTENT_TYPES.QUOTE]: 256,
    [CONTENT_TYPES.FORMULA]: 128,
    [CONTENT_TYPES.REFERENCE]: 384
  };
  
  return sizeMap[contentType] || CHUNKING_CONFIG.maxTokens;
}
