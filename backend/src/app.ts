import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import express from 'express'
import session, { Store } from 'express-session'
import MongoStore from 'connect-mongo'
import mongoose from 'mongoose'
import fs from 'fs/promises'
import { DB_ADDRESS, ORIGINS, PORT, SESSION_SECRET, COOKIE_SECURE, PUBLIC_ROOT, TEMP_ROOT } from './config'
import errorHandler from './middlewares/error-handler'
import { validateNoSQLInjection } from './middlewares/nosql-injection'
import { apiLimiter } from './middlewares/rate-limit'
import { csrfSynchronisedProtection, generateToken } from './middlewares/csrf'
import serveStatic from './middlewares/serverStatic'
import routes from './routes'

export const createApp = (store?: Store) => {
    const app = express()
    app.disable('x-powered-by')
    app.set('query parser', 'simple')
    app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false)
    app.use(helmet({ strictTransportSecurity: false, crossOriginResourcePolicy: { policy: 'same-site' } }))
    app.use(cors({
        origin: (origin, callback) => callback(null, origin ? ORIGINS.includes(origin) && origin : ORIGINS[0]),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    }))
    app.use(apiLimiter)
    app.use(serveStatic(PUBLIC_ROOT))
    app.use((req, res, next) => {
        const origin = req.get('origin')
        if ((origin && !ORIGINS.includes(origin)) || req.get('sec-fetch-site') === 'cross-site') {
            res.status(403).json({ message: 'Источник запроса запрещён' })
            return
        }
        next()
    })
    app.use(cookieParser())
    app.use(session({
        name: '_csrf',
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: store || MongoStore.create({ mongoUrl: DB_ADDRESS, ttl: 3600, collectionName: 'sessions' }),
        cookie: { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict', maxAge: 3600_000, path: '/' },
    }))
    app.get('/auth/csrf-token', (req, res) => {
        res.set('Cache-Control', 'no-store')
        res.json({ csrfToken: generateToken(req) })
    })
    app.use(csrfSynchronisedProtection)
    app.use(express.json({ limit: '32kb', strict: true }))
    app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 30 }))
    app.use(validateNoSQLInjection)
    app.use(routes)
    app.use(errorHandler)
    return app
}

const bootstrap = async () => {
    await fs.mkdir(TEMP_ROOT, { recursive: true })
    await mongoose.connect(DB_ADDRESS, { serverSelectionTimeoutMS: 10_000 })
    const server = createApp().listen(PORT, () => console.log('Backend server started on port', PORT))
    server.requestTimeout = 15_000
    server.headersTimeout = 10_000
    server.keepAliveTimeout = 5000
    server.on('error', () => { console.error('HTTP startup failed'); process.exit(1) })
    const shutdown = () => {
        const timeout = setTimeout(() => process.exit(1), 10_000)
        timeout.unref()
        server.close(() => mongoose.disconnect().finally(() => process.exit(0)))
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
}
if (require.main === module) bootstrap().catch(() => { console.error('Backend startup failed'); process.exit(1) })
