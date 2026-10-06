import rateLimit from 'express-rate-limit'

export const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 40,
    message: { message: 'Слишком много запросов. Повторите через минуту.' },
    standardHeaders: 'draft-8', legacyHeaders: false,
    skip: (req) => req.method === 'GET' && (req.path.startsWith('/images/') || req.path === '/health'),
})
export const authLimiter = rateLimit({
    windowMs: 60_000, limit: 20,
    message: { message: 'Слишком много попыток входа' },
    standardHeaders: 'draft-8', legacyHeaders: false,
})
export const uploadLimiter = rateLimit({
    windowMs: 60_000, limit: 10,
    message: { message: 'Слишком много загрузок файлов' },
    standardHeaders: 'draft-8', legacyHeaders: false,
})
