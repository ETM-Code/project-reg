const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const rtfParser = require('rtf-parser');
const pathManager = require('./pathManager');

/**
 * Supported file extensions and their MIME types
 */
const SUPPORTED_EXTENSIONS = {
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.csv': 'text/csv',
    '.rtf': 'application/rtf'
};

/**
 * Check if a file extension is supported
 * @param {string} filePath - Path to the file
 * @returns {boolean} - True if supported
 */
function isSupportedFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return Object.keys(SUPPORTED_EXTENSIONS).includes(ext);
}

/**
 * Convert a file to text content
 * @param {string} filePath - Path to the source file
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
async function convertFileToText(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return { success: false, error: 'File does not exist' };
        }

        const ext = path.extname(filePath).toLowerCase();
        
        if (!isSupportedFile(filePath)) {
            return { success: false, error: `Unsupported file type: ${ext}` };
        }

        let content = '';

        switch (ext) {
            case '.txt':
                content = await convertTxtFile(filePath);
                break;
            case '.pdf':
                content = await convertPdfFile(filePath);
                break;
            case '.docx':
                content = await convertDocxFile(filePath);
                break;
            case '.xlsx':
            case '.xls':
                content = await convertExcelFile(filePath);
                break;
            case '.csv':
                content = await convertCsvFile(filePath);
                break;
            case '.rtf':
                content = await convertRtfFile(filePath);
                break;
            default:
                return { success: false, error: `Conversion not implemented for ${ext}` };
        }

        if (!content || content.trim().length === 0) {
            return { success: false, error: 'No text content could be extracted from the file' };
        }

        return { success: true, content: content.trim() };
    } catch (error) {
        console.error('[FileConverter] Error converting file:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Convert TXT file
 */
async function convertTxtFile(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

/**
 * Convert PDF file
 */
async function convertPdfFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
}

/**
 * Convert DOCX file
 */
async function convertDocxFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
}

/**
 * Convert Excel file (XLSX/XLS)
 */
async function convertExcelFile(filePath) {
    const workbook = XLSX.readFile(filePath);
    let text = '';
    
    // Process all worksheets
    workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const sheetText = XLSX.utils.sheet_to_txt(worksheet, { FS: '\t' });
        text += `Sheet: ${sheetName}\n${sheetText}\n\n`;
    });
    
    return text;
}

/**
 * Convert CSV file
 */
async function convertCsvFile(filePath) {
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_txt(worksheet, { FS: '\t' });
}

/**
 * Convert RTF file
 */
async function convertRtfFile(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                reject(err);
                return;
            }

            try {
                rtfParser.parseString(data, (err, doc) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    // Extract text from RTF document
                    let text = '';
                    function extractText(node) {
                        if (node.text) {
                            text += node.text;
                        }
                        if (node.children) {
                            node.children.forEach(extractText);
                        }
                    }
                    
                    extractText(doc);
                    resolve(text);
                });
            } catch (parseError) {
                reject(parseError);
            }
        });
    });
}

/**
 * Save converted content as a context file
 * @param {string} content - Text content to save
 * @param {string} originalFileName - Original file name
 * @returns {Promise<{success: boolean, contextFile?: object, error?: string}>}
 */
async function saveAsContextFile(content, originalFileName) {
    try {
        // Use path manager for consistent directory handling
        const contextDir = pathManager.getContextDir();

        // Generate unique file name
        const baseName = path.parse(originalFileName).name;
        const timestamp = Date.now();
        const contextFileName = `${baseName}-${timestamp}.txt`;
        const contextFilePath = path.join(contextDir, contextFileName);

        // Write content to file
        fs.writeFileSync(contextFilePath, content, 'utf8');

        // Create context file object with relative path for portability
        const contextFile = {
            id: `context-${timestamp}`,
            name: `${baseName} (from ${originalFileName})`,
            path: contextFilePath,
            relativePath: `data/context/${contextFileName}`,
            originalFile: originalFileName,
            createdAt: new Date().toISOString(),
            type: 'user-uploaded'
        };

        return { success: true, contextFile };
    } catch (error) {
        console.error('[FileConverter] Error saving context file:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get supported file extensions as a string for file dialogs
 */
function getSupportedExtensions() {
    return Object.keys(SUPPORTED_EXTENSIONS);
}

module.exports = {
    convertFileToText,
    saveAsContextFile,
    isSupportedFile,
    getSupportedExtensions,
    SUPPORTED_EXTENSIONS
}; 