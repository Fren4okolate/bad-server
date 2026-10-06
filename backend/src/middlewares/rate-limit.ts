import rateLimit from 'express-rate-limit'

// Общий лимитер API: 50 запросов в 15 минут (вместо 100)
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50, // уменьшено для тестирования
    message: 'Слишком много запросов с этого IP, пожалуйста, попробуйте позже.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
        req.method === 'GET' &&
        (req.path.startsWith('/images') || req.path === '/health'),
})

// Более строгий лимитер для авторизации: 5 запросов в 15 минут
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, 
    message: 'Слишком много попыток входа, пожалуйста, попробуйте позже.',
    standardHeaders: true,
    legacyHeaders: false,
})

// Лимитер для загрузки файлов: 5 запросов в час
export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'Слишком много загрузок файлов, пожалуйста, попробуйте позже.',
    standardHeaders: true,
    legacyHeaders: false,
})
