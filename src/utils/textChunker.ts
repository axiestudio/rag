/**
 * Client-side text chunking utilities for serverless RAG
 * Implements intelligent text segmentation without heavy ML dependencies
 */

import { encodingForModel } from 'js-tiktoken';

export interface TextChunk {
  content: string;
  index: number;
  source: string;
  metadata: {
    startChar: number;
    endChar: number;
    tokenCount: number;
    wordCount: number;
    chunkType: 'paragraph' | 'sentence' | 'arbitrary';
    quality: number; // 0-1 score based on content analysis
  };
}

export interface ChunkingOptions {
  maxTokens: number;
  chunkOverlap: number;
  preserveParagraphs: boolean;
  preserveSentences: boolean;
  minChunkSize: number;
}

export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  maxTokens: 800,
  chunkOverlap: 100,
  preserveParagraphs: true,
  preserveSentences: true,
  minChunkSize: 50
};

/**
 * Count tokens using tiktoken for OpenAI compatibility
 */
function countTokens(text: string): number {
  try {
    const encoding = encodingForModel('text-embedding-3-small');
    const tokens = encoding.encode(text);
    return tokens.length;
  } catch (error) {
    // Fallback to approximate token count (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4);
  }
}

/**
 * Calculate content quality score based on various factors
 */
function calculateQuality(text: string): number {
  let score = 0.5; // Base score
  
  // Length factor (prefer medium-length chunks)
  const wordCount = text.split(/\s+/).length;
  if (wordCount >= 50 && wordCount <= 200) {
    score += 0.2;
  } else if (wordCount < 20) {
    score -= 0.2;
  }
  
  // Sentence completeness
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length >= 2) {
    score += 0.1;
  }
  
  // Paragraph structure
  if (text.includes('\n\n') || text.includes('\n')) {
    score += 0.1;
  }
  
  // Content density (avoid chunks with too many short words)
  const avgWordLength = text.replace(/\s+/g, '').length / wordCount;
  if (avgWordLength >= 4) {
    score += 0.1;
  }
  
  // Avoid chunks that are mostly punctuation or numbers
  const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
  if (alphaRatio >= 0.7) {
    score += 0.1;
  } else if (alphaRatio < 0.5) {
    score -= 0.2;
  }
  
  return Math.max(0, Math.min(1, score));
}

/**
 * Split text by paragraphs while respecting token limits
 */
function splitByParagraphs(text: string, maxTokens: number, overlap: number): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    const testChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
    const tokenCount = countTokens(testChunk);
    
    if (tokenCount <= maxTokens) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        
        // Add overlap from the end of current chunk
        if (overlap > 0) {
          const words = currentChunk.split(/\s+/);
          const overlapWords = words.slice(-Math.min(overlap, words.length));
          currentChunk = overlapWords.join(' ') + '\n\n' + paragraph;
        } else {
          currentChunk = paragraph;
        }
      } else {
        // Single paragraph is too long, split by sentences
        const sentenceChunks = splitBySentences(paragraph, maxTokens, overlap);
        chunks.push(...sentenceChunks);
        currentChunk = '';
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Split text by sentences while respecting token limits
 */
function splitBySentences(text: string, maxTokens: number, overlap: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const testChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
    const tokenCount = countTokens(testChunk);
    
    if (tokenCount <= maxTokens) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        
        // Add overlap
        if (overlap > 0) {
          const words = currentChunk.split(/\s+/);
          const overlapWords = words.slice(-Math.min(overlap, words.length));
          currentChunk = overlapWords.join(' ') + ' ' + sentence;
        } else {
          currentChunk = sentence;
        }
      } else {
        // Single sentence is too long, split arbitrarily
        const arbitraryChunks = splitArbitrarily(sentence, maxTokens, overlap);
        chunks.push(...arbitraryChunks);
        currentChunk = '';
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Split text arbitrarily when other methods fail
 */
function splitArbitrarily(text: string, maxTokens: number, overlap: number): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/);
  let currentChunk = '';
  
  for (const word of words) {
    const testChunk = currentChunk ? currentChunk + ' ' + word : word;
    const tokenCount = countTokens(testChunk);
    
    if (tokenCount <= maxTokens) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        
        // Add overlap
        if (overlap > 0) {
          const chunkWords = currentChunk.split(/\s+/);
          const overlapWords = chunkWords.slice(-Math.min(overlap, chunkWords.length));
          currentChunk = overlapWords.join(' ') + ' ' + word;
        } else {
          currentChunk = word;
        }
      } else {
        // Single word is somehow too long (shouldn't happen normally)
        chunks.push(word);
        currentChunk = '';
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Main chunking function with intelligent text segmentation
 */
export function chunkText(
  text: string,
  source: string,
  options: Partial<ChunkingOptions> = {}
): TextChunk[] {
  const opts = { ...DEFAULT_CHUNKING_OPTIONS, ...options };
  
  // Clean and normalize text
  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  if (!cleanText || countTokens(cleanText) <= opts.maxTokens) {
    // Text is short enough to be a single chunk
    return [{
      content: cleanText,
      index: 0,
      source,
      metadata: {
        startChar: 0,
        endChar: cleanText.length,
        tokenCount: countTokens(cleanText),
        wordCount: cleanText.split(/\s+/).length,
        chunkType: 'paragraph',
        quality: calculateQuality(cleanText)
      }
    }];
  }
  
  let textChunks: string[] = [];
  
  // Try different splitting strategies in order of preference
  if (opts.preserveParagraphs) {
    textChunks = splitByParagraphs(cleanText, opts.maxTokens, opts.chunkOverlap);
  } else if (opts.preserveSentences) {
    textChunks = splitBySentences(cleanText, opts.maxTokens, opts.chunkOverlap);
  } else {
    textChunks = splitArbitrarily(cleanText, opts.maxTokens, opts.chunkOverlap);
  }
  
  // Convert to TextChunk objects with metadata
  const chunks: TextChunk[] = [];
  let currentPos = 0;
  
  for (let i = 0; i < textChunks.length; i++) {
    const chunkText = textChunks[i];
    const startPos = cleanText.indexOf(chunkText, currentPos);
    const endPos = startPos + chunkText.length;
    
    // Determine chunk type
    let chunkType: 'paragraph' | 'sentence' | 'arbitrary' = 'arbitrary';
    if (chunkText.includes('\n\n')) {
      chunkType = 'paragraph';
    } else if (chunkText.match(/[.!?]\s*$/)) {
      chunkType = 'sentence';
    }
    
    chunks.push({
      content: chunkText,
      index: i,
      source,
      metadata: {
        startChar: startPos >= 0 ? startPos : currentPos,
        endChar: startPos >= 0 ? endPos : currentPos + chunkText.length,
        tokenCount: countTokens(chunkText),
        wordCount: chunkText.split(/\s+/).length,
        chunkType,
        quality: calculateQuality(chunkText)
      }
    });
    
    currentPos = startPos >= 0 ? endPos : currentPos + chunkText.length;
  }
  
  // Filter out chunks that are too small
  return chunks.filter(chunk => 
    chunk.metadata.tokenCount >= opts.minChunkSize || 
    chunk.metadata.wordCount >= 10
  );
}

/**
 * Batch process multiple documents
 */
export function chunkDocuments(
  documents: Array<{ content: string; source: string }>,
  options: Partial<ChunkingOptions> = {}
): TextChunk[] {
  const allChunks: TextChunk[] = [];
  let globalIndex = 0;
  
  for (const doc of documents) {
    const chunks = chunkText(doc.content, doc.source, options);
    
    // Update global indices
    chunks.forEach(chunk => {
      chunk.index = globalIndex++;
      allChunks.push(chunk);
    });
  }
  
  return allChunks;
}
