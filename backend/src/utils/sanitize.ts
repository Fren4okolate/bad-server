// XSS защита - экранирование HTML
export const sanitizeHTML = (dirty: string): string => {
    if (!dirty || typeof dirty !== 'string') {
        return dirty;
    }
    
    let sanitized = dirty
        .replace(/&/g, '&amp;')   
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');

    sanitized = sanitized
        .replace(/javascript:/gi, '') 
        .replace(/vbscript:/gi, '')   
        .replace(/on\w+\s*=/gi, '')  
        .replace(/expression\(/gi, '') 
        .replace(/url\(/gi, '')       
        .replace(/<script/gi, '&lt;script') 
        .replace(/<\/script/gi, '&lt;/script');

    return sanitized.trim();
};
