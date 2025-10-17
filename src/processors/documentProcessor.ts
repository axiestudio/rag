/**
 * Enhanced document processor for industry-standard RAG systems
 * Optimized for serverless architecture with advanced content extraction
 */

import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import Papa from 'papaparse';
import { FILE_CONFIG, ERROR_MESSAGES } from '../config/constants';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

export interface EnhancedDocument {
  content: string;
  source: string;
  structure: DocumentStructure;
  metadata: EnhancedMetadata;
  quality: QualityMetrics;
}

export interface DocumentStructure {
  title: string;
  sections: DocumentSection[];
  tableOfContents: TOCEntry[];
  references: Reference[];
  figures: Figure[];
  tables: Table[];
}

export interface DocumentSection {
  id: string;
  title: string;
  level: number;
  content: string;
  startPage?: number;
  endPage?: number;
  wordCount: number;
  subsections: DocumentSection[];
}

export interface TOCEntry {
  title: string;
  level: number;
  pageNumber?: number;
  sectionId: string;
}

export interface Reference {
  id: string;
  text: string;
  type: 'citation' | 'url' | 'internal';
  target?: string;
}

export interface Figure {
  id: string;
  caption: string;
  pageNumber?: number;
  type: 'image' | 'chart' | 'diagram';
}

export interface Table {
  id: string;
  caption: string;
  headers: string[];
  rows: string[][];
  pageNumber?: number;
}

export interface EnhancedMetadata {
  fileType: string;
  fileName: string;
  fileSize: number;
  pageCount?: number;
  wordCount: number;
  charCount: number;
  language: string;
  encoding: string;
  createdAt: string;
  modifiedAt?: string;
  author?: string;
  title?: string;
  subject?: string;
  keywords?: string[];
  contentType: string;
  extractionMethod: string;
  processingTime: number;
}

export interface QualityMetrics {
  textQuality: number; // 0-1 score
  structureQuality: number; // 0-1 score
  readability: number; // Flesch reading ease
  completeness: number; // 0-1 score
  confidence: number; // Overall confidence in extraction
  issues: string[];
  warnings: string[];
}

export interface ProcessingResult {
  success: boolean;
  documents: EnhancedDocument[];
  errors: string[];
  totalProcessingTime: number;
}

/**
 * Enhanced document processor with industry-standard extraction
 */
export class DocumentProcessor {
  private startTime: number = 0;

  /**
   * Process multiple files with enhanced extraction
   */
  async processFiles(files: File[]): Promise<ProcessingResult> {
    this.startTime = Date.now();
    const documents: EnhancedDocument[] = [];
    const errors: string[] = [];

    // Validate files first
    const validationErrors = this.validateFiles(files);
    if (validationErrors.length > 0) {
      return {
        success: false,
        documents: [],
        errors: validationErrors,
        totalProcessingTime: Date.now() - this.startTime
      };
    }

    // Process each file
    for (const file of files) {
      try {
        const document = await this.processFile(file);
        documents.push(document);
      } catch (error) {
        const errorMessage = `Failed to process ${file.name}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`;
        errors.push(errorMessage);
        console.error(errorMessage, error);
      }
    }

    return {
      success: documents.length > 0,
      documents,
      errors,
      totalProcessingTime: Date.now() - this.startTime
    };
  }

  /**
   * Process a single file with enhanced extraction
   */
  private async processFile(file: File): Promise<EnhancedDocument> {
    const fileStartTime = Date.now();
    
    // Determine processing method based on file type
    let extractedContent: string;
    let rawMetadata: any = {};
    
    switch (file.type) {
      case 'application/pdf':
        const pdfResult = await this.extractFromPDF(file);
        extractedContent = pdfResult.content;
        rawMetadata = pdfResult.metadata;
        break;
        
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        const docxResult = await this.extractFromDOCX(file);
        extractedContent = docxResult.content;
        rawMetadata = docxResult.metadata;
        break;
        
      case 'text/plain':
        extractedContent = await this.extractFromText(file);
        break;
        
      case 'text/csv':
        extractedContent = await this.extractFromCSV(file);
        break;
        
      case 'application/json':
        extractedContent = await this.extractFromJSON(file);
        break;
        
      default:
        throw new Error(ERROR_MESSAGES.FILE.UNSUPPORTED_TYPE);
    }

    // Analyze document structure
    const structure = this.analyzeStructure(extractedContent, file.name);
    
    // Generate enhanced metadata
    const metadata = this.generateMetadata(
      file, 
      extractedContent, 
      rawMetadata, 
      Date.now() - fileStartTime
    );
    
    // Calculate quality metrics
    const quality = this.calculateQuality(extractedContent, structure);

    return {
      content: extractedContent,
      source: file.name,
      structure,
      metadata,
      quality
    };
  }

  /**
   * Enhanced PDF extraction with structure analysis
   */
  private async extractFromPDF(file: File): Promise<{ content: string; metadata: any }> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    const metadata = await pdf.getMetadata();
    const numPages = pdf.numPages;
    
    // Extract text page by page with structure preservation
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Preserve text positioning and formatting
      const pageText = this.reconstructPageText(textContent);
      fullText += `\n--- Page ${pageNum} ---\n${pageText}\n`;
    }

    return {
      content: this.cleanExtractedText(fullText),
      metadata: metadata.info
    };
  }

  /**
   * Reconstruct text from PDF with better formatting
   */
  private reconstructPageText(textContent: any): string {
    const items = textContent.items;
    let text = '';
    let lastY = 0;
    let lastX = 0;

    for (const item of items) {
      const currentY = item.transform[5];
      const currentX = item.transform[4];
      
      // Add line breaks for significant Y position changes
      if (lastY !== 0 && Math.abs(currentY - lastY) > 5) {
        text += '\n';
      }
      // Add spaces for significant X position changes on same line
      else if (lastX !== 0 && currentX - lastX > 10) {
        text += ' ';
      }
      
      text += item.str;
      lastY = currentY;
      lastX = currentX + item.width;
    }

    return text;
  }

  /**
   * Enhanced DOCX extraction with structure preservation
   */
  private async extractFromDOCX(file: File): Promise<{ content: string; metadata: any }> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    
    return {
      content: this.cleanExtractedText(result.value),
      metadata: {
        warnings: result.messages,
        extractionMethod: 'mammoth'
      }
    };
  }

  /**
   * Extract from plain text with encoding detection
   */
  private async extractFromText(file: File): Promise<string> {
    const text = await file.text();
    return this.cleanExtractedText(text);
  }

  /**
   * Enhanced CSV extraction with structure preservation
   */
  private async extractFromCSV(file: File): Promise<string> {
    const text = await file.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    
    if (parsed.errors.length > 0) {
      console.warn('CSV parsing warnings:', parsed.errors);
    }

    // Convert to readable format
    const headers = Object.keys(parsed.data[0] || {});
    let content = `CSV Data with columns: ${headers.join(', ')}\n\n`;
    
    parsed.data.forEach((row: any, index: number) => {
      content += `Row ${index + 1}:\n`;
      headers.forEach(header => {
        content += `  ${header}: ${row[header] || 'N/A'}\n`;
      });
      content += '\n';
    });

    return content;
  }

  /**
   * Extract from JSON with structure preservation
   */
  private async extractFromJSON(file: File): Promise<string> {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Convert JSON to readable text format
    return this.jsonToReadableText(data);
  }

  /**
   * Convert JSON to human-readable text
   */
  private jsonToReadableText(obj: any, depth: number = 0): string {
    const indent = '  '.repeat(depth);
    let text = '';

    if (Array.isArray(obj)) {
      text += `${indent}List with ${obj.length} items:\n`;
      obj.forEach((item, index) => {
        text += `${indent}  Item ${index + 1}:\n`;
        text += this.jsonToReadableText(item, depth + 2);
      });
    } else if (typeof obj === 'object' && obj !== null) {
      Object.entries(obj).forEach(([key, value]) => {
        text += `${indent}${key}: `;
        if (typeof value === 'object') {
          text += '\n' + this.jsonToReadableText(value, depth + 1);
        } else {
          text += `${value}\n`;
        }
      });
    } else {
      text += `${indent}${obj}\n`;
    }

    return text;
  }

  /**
   * Clean and normalize extracted text
   */
  private cleanExtractedText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s{3,}/g, '\n\n')
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      // Remove trailing spaces
      .replace(/[ \t]+$/gm, '')
      // Remove excessive empty lines
      .replace(/\n{4,}/g, '\n\n\n')
      // Trim
      .trim();
  }

  /**
   * Analyze document structure for better chunking
   */
  private analyzeStructure(content: string, fileName: string): DocumentStructure {
    const lines = content.split('\n');
    const sections: DocumentSection[] = [];
    const tableOfContents: TOCEntry[] = [];
    const references: Reference[] = [];
    const figures: Figure[] = [];
    const tables: Table[] = [];

    let currentSection: DocumentSection | null = null;
    let sectionCounter = 0;

    // Extract title (first significant line or from filename)
    const title = this.extractTitle(content, fileName);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Detect headers
      const headerLevel = this.detectHeaderLevel(line);
      if (headerLevel > 0) {
        const section: DocumentSection = {
          id: `section_${sectionCounter++}`,
          title: line.replace(/^#+\s*/, ''),
          level: headerLevel,
          content: '',
          wordCount: 0,
          subsections: []
        };

        if (headerLevel === 1 || !currentSection) {
          sections.push(section);
          currentSection = section;
        } else if (currentSection) {
          currentSection.subsections.push(section);
        }

        tableOfContents.push({
          title: section.title,
          level: headerLevel,
          sectionId: section.id
        });
        continue;
      }

      // Detect references
      if (line.match(/^\[\d+\]|^References?:|^Bibliography:/i)) {
        references.push({
          id: `ref_${references.length}`,
          text: line,
          type: 'citation'
        });
        continue;
      }

      // Detect figures
      if (line.match(/^Figure \d+:|^Fig\. \d+:/i)) {
        figures.push({
          id: `fig_${figures.length}`,
          caption: line,
          type: 'image'
        });
        continue;
      }

      // Detect tables
      if (line.match(/^Table \d+:|^\|.*\|/)) {
        tables.push({
          id: `table_${tables.length}`,
          caption: line,
          headers: [],
          rows: []
        });
        continue;
      }

      // Add content to current section
      if (currentSection) {
        currentSection.content += line + '\n';
        currentSection.wordCount += line.split(/\s+/).length;
      }
    }

    return {
      title,
      sections,
      tableOfContents,
      references,
      figures,
      tables
    };
  }

  /**
   * Extract document title
   */
  private extractTitle(content: string, fileName: string): string {
    const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
    
    // Look for markdown header
    const h1Match = lines.find(line => line.match(/^#\s+/));
    if (h1Match) {
      return h1Match.replace(/^#\s+/, '');
    }

    // Look for title-like first line
    if (lines.length > 0 && lines[0].length < 100 && !lines[0].includes('.')) {
      return lines[0];
    }

    // Fallback to filename
    return fileName.replace(/\.[^/.]+$/, '');
  }

  /**
   * Detect header level from line
   */
  private detectHeaderLevel(line: string): number {
    // Markdown headers
    const mdMatch = line.match(/^(#+)\s/);
    if (mdMatch) {
      return mdMatch[1].length;
    }

    // All caps lines (potential headers)
    if (line === line.toUpperCase() && line.length < 100 && line.length > 3) {
      return 2;
    }

    // Lines ending with colon (potential headers)
    if (line.endsWith(':') && line.length < 100 && !line.includes('.')) {
      return 3;
    }

    return 0;
  }

  /**
   * Generate enhanced metadata
   */
  private generateMetadata(
    file: File,
    content: string,
    rawMetadata: any,
    processingTime: number
  ): EnhancedMetadata {
    const words = content.split(/\s+/).filter(Boolean);
    
    return {
      fileType: file.type,
      fileName: file.name,
      fileSize: file.size,
      wordCount: words.length,
      charCount: content.length,
      language: this.detectLanguage(content),
      encoding: 'utf-8',
      createdAt: new Date().toISOString(),
      author: rawMetadata?.Author || rawMetadata?.author,
      title: rawMetadata?.Title || rawMetadata?.title,
      subject: rawMetadata?.Subject || rawMetadata?.subject,
      keywords: this.extractKeywords(content),
      contentType: this.classifyContentType(content),
      extractionMethod: this.getExtractionMethod(file.type),
      processingTime,
      ...rawMetadata
    };
  }

  /**
   * Calculate quality metrics for extracted content
   */
  private calculateQuality(content: string, structure: DocumentStructure): QualityMetrics {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Text quality assessment
    const textQuality = this.assessTextQuality(content, issues, warnings);
    
    // Structure quality assessment
    const structureQuality = this.assessStructureQuality(structure, issues, warnings);
    
    // Readability calculation
    const readability = this.calculateReadability(content);
    
    // Completeness assessment
    const completeness = this.assessCompleteness(content, structure, issues);
    
    // Overall confidence
    const confidence = (textQuality + structureQuality + completeness) / 3;

    return {
      textQuality,
      structureQuality,
      readability,
      completeness,
      confidence,
      issues,
      warnings
    };
  }

  /**
   * Assess text quality
   */
  private assessTextQuality(content: string, issues: string[], warnings: string[]): number {
    let score = 1.0;

    // Check for minimum content
    if (content.length < 100) {
      issues.push('Content too short');
      score -= 0.3;
    }

    // Check for excessive special characters
    const specialCharRatio = (content.match(/[^\w\s]/g) || []).length / content.length;
    if (specialCharRatio > 0.3) {
      warnings.push('High special character ratio');
      score -= 0.1;
    }

    // Check for repeated patterns (extraction artifacts)
    const repeatedPatterns = content.match(/(.{10,})\1{3,}/g);
    if (repeatedPatterns) {
      warnings.push('Repeated content patterns detected');
      score -= 0.1;
    }

    return Math.max(0, score);
  }

  /**
   * Assess structure quality
   */
  private assessStructureQuality(structure: DocumentStructure, issues: string[], warnings: string[]): number {
    let score = 1.0;

    // Check for sections
    if (structure.sections.length === 0) {
      warnings.push('No clear document structure detected');
      score -= 0.2;
    }

    // Check for balanced structure
    const avgSectionLength = structure.sections.reduce((sum, s) => sum + s.wordCount, 0) / structure.sections.length;
    if (avgSectionLength < 50) {
      warnings.push('Sections appear to be very short');
      score -= 0.1;
    }

    return Math.max(0, score);
  }

  /**
   * Calculate readability score
   */
  private calculateReadability(content: string): number {
    const sentences = content.split(/[.!?]+/).length;
    const words = content.split(/\s+/).length;
    const syllables = this.countSyllables(content);

    if (sentences === 0 || words === 0) return 0;

    // Flesch Reading Ease
    const score = 206.835 - (1.015 * (words / sentences)) - (84.6 * (syllables / words));
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Count syllables in text
   */
  private countSyllables(text: string): number {
    return text.toLowerCase()
      .replace(/[^a-z]/g, '')
      .replace(/[aeiou]{2,}/g, 'a')
      .replace(/[^aeiou]/g, '')
      .length || 1;
  }

  /**
   * Assess content completeness
   */
  private assessCompleteness(content: string, structure: DocumentStructure, issues: string[]): number {
    let score = 1.0;

    // Check for truncated content
    if (content.endsWith('...') || content.includes('content truncated')) {
      issues.push('Content appears to be truncated');
      score -= 0.3;
    }

    // Check for missing sections
    if (structure.sections.length > 0) {
      const emptySections = structure.sections.filter(s => s.wordCount < 10).length;
      if (emptySections > 0) {
        warnings.push(`${emptySections} sections appear to be empty`);
        score -= 0.1 * (emptySections / structure.sections.length);
      }
    }

    return Math.max(0, score);
  }

  /**
   * Detect content language
   */
  private detectLanguage(content: string): string {
    // Simple language detection based on common words
    const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const words = content.toLowerCase().split(/\s+/);
    const englishCount = words.filter(word => englishWords.includes(word)).length;
    
    return englishCount > words.length * 0.05 ? 'en' : 'unknown';
  }

  /**
   * Extract keywords from content
   */
  private extractKeywords(content: string): string[] {
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
   * Classify content type
   */
  private classifyContentType(content: string): string {
    if (content.includes('class ') || content.includes('function ')) return 'code';
    if (content.includes('Table') && content.includes('|')) return 'data';
    if (content.match(/^\d+\./m)) return 'structured';
    return 'text';
  }

  /**
   * Get extraction method name
   */
  private getExtractionMethod(fileType: string): string {
    const methods: Record<string, string> = {
      'application/pdf': 'pdf.js',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'mammoth',
      'text/plain': 'native',
      'text/csv': 'papaparse',
      'application/json': 'native'
    };
    
    return methods[fileType] || 'unknown';
  }

  /**
   * Validate files before processing
   */
  private validateFiles(files: File[]): string[] {
    const errors: string[] = [];

    if (files.length === 0) {
      errors.push('No files provided');
      return errors;
    }

    if (files.length > FILE_CONFIG.MAX_FILES) {
      errors.push(`Too many files. Maximum ${FILE_CONFIG.MAX_FILES} allowed`);
    }

    for (const file of files) {
      // Check file type
      if (!FILE_CONFIG.SUPPORTED_TYPES.includes(file.type)) {
        errors.push(`Unsupported file type: ${file.type} (${file.name})`);
      }

      // Check file size
      if (file.size > FILE_CONFIG.MAX_FILE_SIZE) {
        errors.push(`File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      }

      // Check for empty files
      if (file.size === 0) {
        errors.push(`Empty file: ${file.name}`);
      }
    }

    return errors;
  }
}

/**
 * Factory function for creating document processor
 */
export function createDocumentProcessor(): DocumentProcessor {
  return new DocumentProcessor();
}

/**
 * Legacy compatibility function
 */
export async function processFiles(files: File[]): Promise<{ success: boolean; documents: any[]; errors: string[] }> {
  const processor = createDocumentProcessor();
  const result = await processor.processFiles(files);
  
  // Convert to legacy format
  return {
    success: result.success,
    documents: result.documents.map(doc => ({
      content: doc.content,
      source: doc.source,
      metadata: {
        fileType: doc.metadata.fileType,
        fileName: doc.metadata.fileName,
        fileSize: doc.metadata.fileSize,
        pageCount: doc.metadata.pageCount,
        wordCount: doc.metadata.wordCount,
        charCount: doc.metadata.charCount
      }
    })),
    errors: result.errors
  };
}
