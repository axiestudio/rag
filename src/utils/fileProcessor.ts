/**
 * Client-side file processing utilities for serverless RAG
 * Handles PDF, DOCX, CSV, and TXT files directly in the browser
 */

import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import Papa from 'papaparse';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

export interface ProcessedDocument {
  content: string;
  source: string;
  metadata: {
    fileType: string;
    fileName: string;
    fileSize: number;
    pageCount?: number;
    wordCount: number;
    charCount: number;
  };
}

export interface FileProcessingResult {
  success: boolean;
  documents: ProcessedDocument[];
  errors: string[];
}

/**
 * Extract text from PDF file
 */
async function extractTextFromPDF(file: File): Promise<ProcessedDocument> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    const numPages = pdf.numPages;
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
    }
    
    return {
      content: fullText.trim(),
      source: file.name,
      metadata: {
        fileType: 'pdf',
        fileName: file.name,
        fileSize: file.size,
        pageCount: numPages,
        wordCount: fullText.split(/\s+/).length,
        charCount: fullText.length
      }
    };
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from DOCX file
 */
async function extractTextFromDOCX(file: File): Promise<ProcessedDocument> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value;
    
    return {
      content: text,
      source: file.name,
      metadata: {
        fileType: 'docx',
        fileName: file.name,
        fileSize: file.size,
        wordCount: text.split(/\s+/).length,
        charCount: text.length
      }
    };
  } catch (error) {
    throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from CSV file
 */
async function extractTextFromCSV(file: File): Promise<ProcessedDocument> {
  try {
    const text = await file.text();
    
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        complete: (results) => {
          try {
            // Convert CSV data to readable text format
            const headers = results.data[0] as string[];
            const rows = results.data.slice(1) as string[][];
            
            let formattedText = `CSV Data from ${file.name}\n\n`;
            formattedText += `Headers: ${headers.join(', ')}\n\n`;
            
            rows.forEach((row, index) => {
              if (row.length > 0 && row.some(cell => cell && cell.trim())) {
                formattedText += `Row ${index + 1}:\n`;
                headers.forEach((header, colIndex) => {
                  if (row[colIndex]) {
                    formattedText += `  ${header}: ${row[colIndex]}\n`;
                  }
                });
                formattedText += '\n';
              }
            });
            
            resolve({
              content: formattedText,
              source: file.name,
              metadata: {
                fileType: 'csv',
                fileName: file.name,
                fileSize: file.size,
                wordCount: formattedText.split(/\s+/).length,
                charCount: formattedText.length
              }
            });
          } catch (error) {
            reject(new Error(`Failed to process CSV data: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        },
        error: (error) => {
          reject(new Error(`Failed to parse CSV: ${error.message}`));
        },
        header: false,
        skipEmptyLines: true
      });
    });
  } catch (error) {
    throw new Error(`Failed to read CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text from TXT file
 */
async function extractTextFromTXT(file: File): Promise<ProcessedDocument> {
  try {
    const text = await file.text();
    
    return {
      content: text,
      source: file.name,
      metadata: {
        fileType: 'txt',
        fileName: file.name,
        fileSize: file.size,
        wordCount: text.split(/\s+/).length,
        charCount: text.length
      }
    };
  } catch (error) {
    throw new Error(`Failed to read text file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Process multiple files and extract text content
 */
export async function processFiles(files: File[]): Promise<FileProcessingResult> {
  const documents: ProcessedDocument[] = [];
  const errors: string[] = [];
  
  for (const file of files) {
    try {
      const fileExtension = file.name.toLowerCase().split('.').pop();
      let document: ProcessedDocument;
      
      switch (fileExtension) {
        case 'pdf':
          document = await extractTextFromPDF(file);
          break;
        case 'docx':
          document = await extractTextFromDOCX(file);
          break;
        case 'doc':
          // For .doc files, we'll treat them as unsupported for now
          // as they require more complex processing
          throw new Error('DOC files are not supported. Please convert to DOCX format.');
        case 'csv':
          document = await extractTextFromCSV(file);
          break;
        case 'txt':
          document = await extractTextFromTXT(file);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileExtension}`);
      }
      
      // Validate that we extracted meaningful content
      if (!document.content || document.content.trim().length < 10) {
        throw new Error('No meaningful content could be extracted from the file');
      }
      
      documents.push(document);
    } catch (error) {
      const errorMessage = `Error processing ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMessage);
      console.error(errorMessage);
    }
  }
  
  return {
    success: documents.length > 0,
    documents,
    errors
  };
}

/**
 * Validate file before processing
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  const maxSize = 16 * 1024 * 1024; // 16MB
  const allowedTypes = ['pdf', 'docx', 'doc', 'csv', 'txt'];
  
  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 16MB limit' };
  }
  
  const extension = file.name.toLowerCase().split('.').pop();
  if (!extension || !allowedTypes.includes(extension)) {
    return { valid: false, error: 'Unsupported file type' };
  }
  
  return { valid: true };
}
