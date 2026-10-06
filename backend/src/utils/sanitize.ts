import sanitizeHtml from 'sanitize-html'

// Rich comments may contain only formatting and HTTP(S) links, never active content.
export const sanitizeHTML = (dirty: string): string => sanitizeHtml(dirty, {
    allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
})
