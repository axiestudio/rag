/**
 * Advanced semantic chunking for optimal LLM retrieval
 * Industry-standard chunking strategies for serverless RAG
 */

import { 
  CHUNKING_CONFIG, 
  CONTENT_TYPES, 
  IMPORTANCE_LEVELS,
  estimateTokenCount,
  getOptimalChunkSize 
} from '../config/embeddings';

export interface SemanticChunk {
  id: string;
  content: string;
  tokens: number;
  contentType: string;
  importance: number;
  position: ChunkPosition;
  metadata: ChunkMetadata;
  relationships: ChunkRelationship[];
}

export interface ChunkPosition {
  documentIndex: number;
  sectionIndex: number;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
}

export interface ChunkMetadata {
  source: string;
  title?: string;
  section?: string;
  subsection?: string;
  keywords: string[];
  topics: string[];
  complexity: 'low' | 'medium' | 'high';
  readability: number;
  language: string;
  createdAt: string;
}

export interface ChunkRelationship {
  type: 'parent' | 'child' | 'sibling' | 'reference';
  targetChunkId: string;
  strength: number;
}

export interface DocumentStructure {
  title: string;
  sections: Section[];
  metadata: Record<string, any>;
}

export interface Section {
  title: string;
  level: number;
  content: string;
  subsections: Section[];
  type: string;
}

/**
 * Advanced semantic chunker for optimal LLM retrieval
 */
export class SemanticChunker {
  private config = CHUNKING_CONFIG;

  /**
   * Chunk document using semantic boundaries
   */
  async chunkDocument(
    content: string,
    source: string,
    metadata: Record<string, any> = {}
  ): Promise<SemanticChunk[]> {
    // Parse document structure
    const structure = this.parseDocumentStructure(content);
    
    // Apply chunking strategy
    switch (this.config.strategy) {
      case 'semantic':
        return this.semanticChunking(structure, source, metadata);
      case 'hybrid':
        return this.hybridChunking(structure, source, metadata);
      default:
        return this.fixedChunking(content, source, metadata);
    }
  }

  /**
   * Parse document structure for semantic understanding
   */
  private parseDocumentStructure(content: string): DocumentStructure {
    const lines = content.split('\n');
    const sections: Section[] = [];
    let currentSection: Section | null = null;
    let title = 'Untitled Document';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) continue;

      // Detect title (first significant line or markdown header)
      if (i === 0 || line.startsWith('# ')) {
        title = line.replace(/^#\s*/, '');
        continue;
      }

      // Detect section headers
      const headerMatch = line.match(/^(#{2,6})\s+(.+)$/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const sectionTitle = headerMatch[2];
        
        const section: Section = {
          title: sectionTitle,
          level,
          content: '',
          subsections: [],
          type: CONTENT_TYPES.HEADING
        };

        if (level === 2 || !currentSection) {
          sections.push(section);
          currentSection = section;
        } else if (currentSection) {
          currentSection.subsections.push(section);
        }
        continue;
      }

      // Add content to current section
      if (currentSection) {
        currentSection.content += line + '\n';
      } else {
        // Create default section for content without headers
        if (sections.length === 0) {
          sections.push({
            title: 'Content',
            level: 1,
            content: '',
            subsections: [],
            type: CONTENT_TYPES.PARAGRAPH
          });
          currentSection = sections[0];
        }
        if (currentSection) {
          currentSection.content += line + '\n';
        }
      }
    }

    return {
      title,
      sections,
      metadata: {}
    };
  }

  /**
   * Semantic chunking based on content boundaries
   */
  private semanticChunking(
    structure: DocumentStructure,
    source: string,
    metadata: Record<string, any>
  ): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    let chunkIndex = 0;

    for (let sectionIndex = 0; sectionIndex < structure.sections.length; sectionIndex++) {
      const section = structure.sections[sectionIndex];
      const sectionChunks = this.chunkSection(section, source, metadata, sectionIndex, chunkIndex);
      chunks.push(...sectionChunks);
      chunkIndex += sectionChunks.length;
    }

    // Add relationships between chunks
    this.addChunkRelationships(chunks);

    return chunks;
  }

  /**
   * Chunk a section while preserving semantic boundaries
   */
  private chunkSection(
    section: Section,
    source: string,
    metadata: Record<string, any>,
    sectionIndex: number,
    startChunkIndex: number
  ): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    const content = section.content.trim();
    
    if (!content) return chunks;

    // Split by paragraphs first
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
    
    let currentChunk = '';
    let currentTokens = 0;
    let paragraphIndex = 0;

    for (const paragraph of paragraphs) {
      const paragraphTokens = estimateTokenCount(paragraph);
      const optimalSize = getOptimalChunkSize(section.type);

      // If adding this paragraph would exceed optimal size, create a chunk
      if (currentTokens + paragraphTokens > optimalSize && currentChunk) {
        chunks.push(this.createChunk(
          currentChunk.trim(),
          source,
          metadata,
          section,
          sectionIndex,
          paragraphIndex,
          startChunkIndex + chunks.length
        ));
        
        currentChunk = '';
        currentTokens = 0;
      }

      // Add paragraph to current chunk
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      currentTokens += paragraphTokens;
      paragraphIndex++;
    }

    // Add remaining content as final chunk
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(
        currentChunk.trim(),
        source,
        metadata,
        section,
        sectionIndex,
        paragraphIndex,
        startChunkIndex + chunks.length
      ));
    }

    return chunks;
  }

  /**
   * Create a semantic chunk with rich metadata
   */
  private createChunk(
    content: string,
    source: string,
    metadata: Record<string, any>,
    section: Section,
    sectionIndex: number,
    paragraphIndex: number,
    chunkIndex: number
  ): SemanticChunk {
    const tokens = estimateTokenCount(content);
    const contentType = this.classifyContent(content);
    const importance = this.calculateImportance(content, section);
    const keywords = this.extractKeywords(content);
    const topics = this.extractTopics(content);

    return {
      id: `chunk_${chunkIndex}_${Date.now()}`,
      content,
      tokens,
      contentType,
      importance,
      position: {
        documentIndex: 0,
        sectionIndex,
        paragraphIndex,
        startOffset: 0,
        endOffset: content.length
      },
      metadata: {
        source,
        title: metadata.title || 'Untitled',
        section: section.title,
        keywords,
        topics,
        complexity: this.assessComplexity(content),
        readability: this.calculateReadability(content),
        language: 'en',
        createdAt: new Date().toISOString(),
        ...metadata
      },
      relationships: []
    };
  }

  /**
   * Classify content type for optimal processing
   */
  private classifyContent(content: string): string {
    if (content.match(/^#+\s/)) return CONTENT_TYPES.HEADING;
    if (content.match(/^\s*[-*+]\s/m)) return CONTENT_TYPES.LIST;
    if (content.match(/^\s*\|.*\|/m)) return CONTENT_TYPES.TABLE;
    if (content.match(/```|`[^`]+`/)) return CONTENT_TYPES.CODE;
    if (content.match(/^\s*>/m)) return CONTENT_TYPES.QUOTE;
    if (content.match(/\$.*\$|\\\(.*\\\)/)) return CONTENT_TYPES.FORMULA;
    
    return CONTENT_TYPES.PARAGRAPH;
  }

  /**
   * Calculate content importance for retrieval prioritization
   */
  private calculateImportance(content: string, section: Section): number {
    let importance = IMPORTANCE_LEVELS.MEDIUM;

    // Boost importance for headers
    if (section.type === CONTENT_TYPES.HEADING) {
      importance = IMPORTANCE_LEVELS.HIGH;
    }

    // Boost for key phrases
    const keyPhrases = ['important', 'key', 'critical', 'essential', 'main', 'primary'];
    const hasKeyPhrases = keyPhrases.some(phrase => 
      content.toLowerCase().includes(phrase)
    );
    
    if (hasKeyPhrases) {
      importance = Math.min(importance + 0.2, IMPORTANCE_LEVELS.CRITICAL);
    }

    // Reduce importance for very short content
    if (content.length < 100) {
      importance = Math.max(importance - 0.2, IMPORTANCE_LEVELS.MINIMAL);
    }

    return importance;
  }

  /**
   * Extract keywords for enhanced retrieval
   */
  private extractKeywords(content: string): string[] {
    // Simple keyword extraction (can be enhanced with NLP libraries)
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);

    const wordFreq: Record<string, number> = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    return Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Extract topics for semantic understanding
   */
  private extractTopics(content: string): string[] {
    // Simple topic extraction based on common patterns
    const topics: string[] = [];
    
    // Technical topics
    if (content.match(/\b(API|database|server|client|authentication)\b/i)) {
      topics.push('technical');
    }
    
    // Business topics
    if (content.match(/\b(strategy|business|market|customer|revenue)\b/i)) {
      topics.push('business');
    }
    
    // Process topics
    if (content.match(/\b(process|workflow|procedure|steps|method)\b/i)) {
      topics.push('process');
    }

    return topics;
  }

  /**
   * Assess content complexity
   */
  private assessComplexity(content: string): 'low' | 'medium' | 'high' {
    const sentences = content.split(/[.!?]+/).length;
    const words = content.split(/\s+/).length;
    const avgWordsPerSentence = words / sentences;

    if (avgWordsPerSentence > 20) return 'high';
    if (avgWordsPerSentence > 12) return 'medium';
    return 'low';
  }

  /**
   * Calculate readability score
   */
  private calculateReadability(content: string): number {
    // Simplified readability calculation
    const sentences = content.split(/[.!?]+/).length;
    const words = content.split(/\s+/).length;
    const syllables = this.countSyllables(content);

    // Flesch Reading Ease approximation
    const score = 206.835 - (1.015 * (words / sentences)) - (84.6 * (syllables / words));
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Count syllables in text (approximation)
   */
  private countSyllables(text: string): number {
    return text.toLowerCase()
      .replace(/[^a-z]/g, '')
      .replace(/[aeiou]{2,}/g, 'a')
      .replace(/[^aeiou]/g, '')
      .length || 1;
  }

  /**
   * Add relationships between chunks
   */
  private addChunkRelationships(chunks: SemanticChunk[]): void {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Add sibling relationships
      if (i > 0) {
        chunk.relationships.push({
          type: 'sibling',
          targetChunkId: chunks[i - 1].id,
          strength: 0.8
        });
      }
      
      if (i < chunks.length - 1) {
        chunk.relationships.push({
          type: 'sibling',
          targetChunkId: chunks[i + 1].id,
          strength: 0.8
        });
      }
    }
  }

  /**
   * Hybrid chunking combining semantic and fixed strategies
   */
  private hybridChunking(
    structure: DocumentStructure,
    source: string,
    metadata: Record<string, any>
  ): SemanticChunk[] {
    // Start with semantic chunking
    const semanticChunks = this.semanticChunking(structure, source, metadata);
    
    // Post-process to ensure optimal sizes
    const optimizedChunks: SemanticChunk[] = [];
    
    for (const chunk of semanticChunks) {
      if (chunk.tokens > this.config.maxTokens * 1.5) {
        // Split large chunks
        const subChunks = this.splitLargeChunk(chunk);
        optimizedChunks.push(...subChunks);
      } else if (chunk.tokens < this.config.minTokens) {
        // Merge small chunks with next chunk if possible
        const lastChunk = optimizedChunks[optimizedChunks.length - 1];
        if (lastChunk && lastChunk.tokens + chunk.tokens <= this.config.maxTokens) {
          lastChunk.content += '\n\n' + chunk.content;
          lastChunk.tokens += chunk.tokens;
        } else {
          optimizedChunks.push(chunk);
        }
      } else {
        optimizedChunks.push(chunk);
      }
    }
    
    return optimizedChunks;
  }

  /**
   * Split large chunks while preserving semantic boundaries
   */
  private splitLargeChunk(chunk: SemanticChunk): SemanticChunk[] {
    const sentences = chunk.content.split(/(?<=[.!?])\s+/);
    const subChunks: SemanticChunk[] = [];
    
    let currentContent = '';
    let currentTokens = 0;
    let subChunkIndex = 0;

    for (const sentence of sentences) {
      const sentenceTokens = estimateTokenCount(sentence);
      
      if (currentTokens + sentenceTokens > this.config.maxTokens && currentContent) {
        subChunks.push({
          ...chunk,
          id: `${chunk.id}_sub_${subChunkIndex}`,
          content: currentContent.trim(),
          tokens: currentTokens
        });
        
        currentContent = '';
        currentTokens = 0;
        subChunkIndex++;
      }
      
      currentContent += (currentContent ? ' ' : '') + sentence;
      currentTokens += sentenceTokens;
    }
    
    if (currentContent.trim()) {
      subChunks.push({
        ...chunk,
        id: `${chunk.id}_sub_${subChunkIndex}`,
        content: currentContent.trim(),
        tokens: currentTokens
      });
    }
    
    return subChunks;
  }

  /**
   * Fixed chunking fallback
   */
  private fixedChunking(
    content: string,
    source: string,
    metadata: Record<string, any>
  ): SemanticChunk[] {
    const chunks: SemanticChunk[] = [];
    const words = content.split(/\s+/);
    const wordsPerChunk = Math.floor(this.config.maxTokens * 0.75); // Conservative estimate
    
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      const chunkWords = words.slice(i, i + wordsPerChunk);
      const chunkContent = chunkWords.join(' ');
      
      chunks.push({
        id: `fixed_chunk_${i / wordsPerChunk}_${Date.now()}`,
        content: chunkContent,
        tokens: estimateTokenCount(chunkContent),
        contentType: CONTENT_TYPES.PARAGRAPH,
        importance: IMPORTANCE_LEVELS.MEDIUM,
        position: {
          documentIndex: 0,
          sectionIndex: 0,
          paragraphIndex: Math.floor(i / wordsPerChunk),
          startOffset: i,
          endOffset: i + chunkWords.length
        },
        metadata: {
          source,
          keywords: [],
          topics: [],
          complexity: 'medium',
          readability: 50,
          language: 'en',
          createdAt: new Date().toISOString(),
          ...metadata
        },
        relationships: []
      });
    }
    
    return chunks;
  }
}
