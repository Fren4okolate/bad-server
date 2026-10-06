import { RequestHandler } from 'express'
import BadRequestError from '../errors/bad-request-error'

export const validateNoSQLInjection: RequestHandler = (req, _res, next) => {
    // An iterative walk bounds depth and avoids stack overflow on malicious JSON.
    const stack: { value: unknown; depth: number }[] = [{ value: req.body, depth: 0 }, { value: req.query, depth: 0 }]
    while (stack.length) {
        const entry = stack.pop()!
        if (entry.value && typeof entry.value === 'object') {
        if (entry.depth > 10) { next(new BadRequestError('Слишком глубокие данные')); return }
        const entries = Object.entries(entry.value)
        if (entries.some(([key]) => key.startsWith('$') || key.includes('.') || key.includes('[')
            || ['__proto__', 'prototype', 'constructor'].includes(key))) {
            next(new BadRequestError('Недопустимые ключи запроса')); return
        }
        entries.forEach(([, value]) => stack.push({ value, depth: entry.depth + 1 }))
        }
    }
    next()
}
