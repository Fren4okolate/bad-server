import 'dotenv/config'
import { randomBytes } from 'crypto'
import path from 'path'
import { CookieOptions } from 'express'
import { Joi } from 'celebrate'

const production = process.env.NODE_ENV === 'production'
const secret = (key: string) => {
    const value = process.env[key]
    if (value && value.length >= 32) return value
    if (production || value) throw new Error(`Настройте ${key}: минимум 32 символа`)
    return randomBytes(32).toString('hex')
}
const seconds = (value: string | undefined, fallback: number) => {
    if (!value) return fallback
    const match = /^(\d{1,8})(s|m|h|d)$/.exec(value)
    if (!match) throw new Error('Некорректный срок действия токена')
    const scale: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }
    const result = Number(match[1]) * scale[match[2]]
    if (result < 1 || result > 30 * 86400) throw new Error('Срок токена превышает 30 дней')
    return result
}
export const PORT = Number(process.env.PORT || 3000)
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Некорректный PORT')
export const DB_ADDRESS = process.env.DB_ADDRESS || 'mongodb://127.0.0.1:27017/weblarek'
export const ORIGIN_ALLOW = process.env.ORIGIN_ALLOW || 'http://localhost:5173,http://localhost'
export const ORIGINS = ORIGIN_ALLOW.split(',').map((origin) => new URL(origin.trim()).origin)
export const COOKIE_SECURE = process.env.COOKIE_SECURE === undefined
    ? production : process.env.COOKIE_SECURE === 'true'
export const SESSION_SECRET = secret('SESSION_SECRET')
export const PUBLIC_ROOT = path.resolve(process.cwd(), 'src/public')
export const TEMP_ROOT = path.resolve(process.cwd(), 'temp')
export const ACCESS_TOKEN = { secret: secret('AUTH_ACCESS_TOKEN_SECRET'), expiry: seconds(process.env.AUTH_ACCESS_TOKEN_EXPIRY, 600) }
export const REFRESH_TOKEN = {
    secret: secret('AUTH_REFRESH_TOKEN_SECRET'),
    expiry: seconds(process.env.AUTH_REFRESH_TOKEN_EXPIRY, 7 * 86400),
    cookie: {
        name: 'refreshToken',
        options: {
            httpOnly: true,
            sameSite: 'strict',
            secure: COOKIE_SECURE,
            maxAge: seconds(process.env.AUTH_REFRESH_TOKEN_EXPIRY, 7 * 86400) * 1000,
            path: '/',
        } as CookieOptions,
    },
}
export const paginationQuery = Joi.object({
    page: Joi.number().integer().min(1).max(10_000).default(1),
    limit: Joi.number().integer().min(1).max(100_000).default(5).custom((value: number) => Math.min(value, 10)),
})
