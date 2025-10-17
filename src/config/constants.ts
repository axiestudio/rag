/**
 * Application constants and configuration
 * Centralized configuration for the serverless RAG system
 */

/**
 * API Configuration
 */
export const API_CONFIG = {
  OPENAI: {
    BASE_URL: 'https://api.openai.com/v1',
    MODELS: {
      EMBEDDING: 'text-embedding-3-small',
      EMBEDDING_LARGE: 'text-embedding-3-large',
      LEGACY: 'text-embedding-ada-002'
    },
    RATE_LIMITS: {
      REQUESTS_PER_MINUTE: 3000,
      TOKENS_PER_MINUTE: 1000000
    }
  },
  SUPABASE: {
    TABLE_NAME: 'documents',
    VECTOR_COLUMN: 'embedding',
    SIMILARITY_FUNCTION: 'match_documents',
    BATCH_SIZE: 100
  }
} as const;

/**
 * File Processing Configuration
 */
export const FILE_CONFIG = {
  SUPPORTED_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'application/json',
    'text/markdown'
  ],
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_FILES: 20,
  ENCODING: 'utf-8'
} as const;

/**
 * Processing Configuration
 */
export const PROCESSING_CONFIG = {
  BATCH_SIZES: {
    FILES: 5,
    CHUNKS: 50,
    EMBEDDINGS: 50,
    UPLOADS: 100
  },
  CONCURRENCY: {
    MAX_PARALLEL: 5,
    FILE_PROCESSING: 3,
    API_CALLS: 5
  },
  TIMEOUTS: {
    FILE_PROCESSING: 30000, // 30 seconds
    API_CALL: 60000, // 60 seconds
    UPLOAD: 120000 // 2 minutes
  },
  RETRY: {
    MAX_ATTEMPTS: 3,
    BASE_DELAY: 1000,
    MAX_DELAY: 10000,
    BACKOFF_FACTOR: 2
  }
} as const;

/**
 * UI Configuration
 */
export const UI_CONFIG = {
  PROGRESS: {
    UPDATE_INTERVAL: 100, // ms
    SMOOTH_ANIMATION: true
  },
  NOTIFICATIONS: {
    AUTO_DISMISS: 5000, // 5 seconds
    MAX_VISIBLE: 3
  },
  THEME: {
    PRIMARY_COLOR: '#667eea',
    SECONDARY_COLOR: '#764ba2',
    SUCCESS_COLOR: '#10b981',
    ERROR_COLOR: '#ef4444',
    WARNING_COLOR: '#f59e0b'
  }
} as const;

/**
 * Performance Monitoring
 */
export const PERFORMANCE_CONFIG = {
  METRICS: {
    TRACK_PROCESSING_TIME: true,
    TRACK_API_LATENCY: true,
    TRACK_MEMORY_USAGE: true,
    TRACK_ERROR_RATES: true
  },
  THRESHOLDS: {
    SLOW_PROCESSING: 30000, // 30 seconds
    HIGH_ERROR_RATE: 0.1, // 10%
    MEMORY_WARNING: 100 * 1024 * 1024 // 100MB
  }
} as const;

/**
 * Error Messages
 */
export const ERROR_MESSAGES = {
  FILE: {
    UNSUPPORTED_TYPE: 'File type not supported',
    TOO_LARGE: 'File size exceeds maximum limit',
    CORRUPTED: 'File appears to be corrupted',
    EMPTY: 'File is empty or contains no readable content'
  },
  API: {
    OPENAI_QUOTA: 'OpenAI API quota exceeded',
    OPENAI_INVALID_KEY: 'Invalid OpenAI API key',
    SUPABASE_CONNECTION: 'Failed to connect to Supabase',
    SUPABASE_INVALID_CREDENTIALS: 'Invalid Supabase credentials'
  },
  PROCESSING: {
    CHUNKING_FAILED: 'Failed to chunk document',
    EMBEDDING_FAILED: 'Failed to generate embeddings',
    UPLOAD_FAILED: 'Failed to upload to database',
    TIMEOUT: 'Processing timeout exceeded'
  }
} as const;

/**
 * Success Messages
 */
export const SUCCESS_MESSAGES = {
  PROCESSING: {
    FILES_UPLOADED: 'Files uploaded successfully',
    EMBEDDINGS_GENERATED: 'Embeddings generated successfully',
    DATA_UPLOADED: 'Data uploaded to database successfully',
    PROCESSING_COMPLETE: 'Processing completed successfully'
  },
  SETUP: {
    CREDENTIALS_SAVED: 'Credentials saved successfully',
    CONNECTION_VERIFIED: 'Connection verified successfully',
    DATABASE_READY: 'Database is ready for use'
  }
} as const;

/**
 * Development Configuration
 */
export const DEV_CONFIG = {
  DEBUG: process.env.NODE_ENV === 'development',
  VERBOSE_LOGGING: process.env.NODE_ENV === 'development',
  MOCK_API_CALLS: false,
  SKIP_VALIDATION: false
} as const;

/**
 * Production Optimizations
 */
export const PROD_CONFIG = {
  ENABLE_COMPRESSION: true,
  CACHE_EMBEDDINGS: true,
  BATCH_OPTIMIZATION: true,
  MEMORY_CLEANUP: true
} as const;

/**
 * Utility function to get environment-specific config
 */
export function getConfig() {
  return process.env.NODE_ENV === 'production' ? PROD_CONFIG : DEV_CONFIG;
}

/**
 * Validate required environment variables
 */
export function validateEnvironment(): { valid: boolean; missing: string[] } {
  const required = ['VITE_OPENAI_API_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_SERVICE_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  return {
    valid: missing.length === 0,
    missing
  };
}
