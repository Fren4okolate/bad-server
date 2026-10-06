import DOMPurify from 'dompurify'

export const safeComment = (value: string) => DOMPurify.sanitize(value, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a'],
    ALLOWED_ATTR: ['href'],
})
