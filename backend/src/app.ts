import { errors } from 'celebrate'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import 'dotenv/config'
import express, { json, urlencoded } from 'express'
import mongoose from 'mongoose'
import path from 'path'
import { DB_ADDRESS, ORIGIN_ALLOW } from './config'
import errorHandler from './middlewares/error-handler'
import { validateNoSQLInjection } from './middlewares/nosql-injection'
import { apiLimiter } from './middlewares/rate-limit'
import serveStatic from './middlewares/serverStatic'
import routes from './routes'

const { PORT = 3000 } = process.env
const app = express()

app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal'])

app.use(cookieParser())
app.use(helmet())

// CORS настройки - упрощенная версия
app.use(
    cors({
        origin: ORIGIN_ALLOW
            ? ORIGIN_ALLOW.split(',')
            : ['http://localhost:5173'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
)

// Применить лимитинг запросов ко всем API маршрутам
app.use(apiLimiter)

app.use(serveStatic(path.join(__dirname, 'public')))

app.use(urlencoded({ extended: true }))
app.use(json())

// Валидация на NoSQL-инъекции
app.use(validateNoSQLInjection)

app.use(routes)
app.use(errors())
app.use(errorHandler)

const bootstrap = async () => {
    try {
        await mongoose.connect(DB_ADDRESS)
        await app.listen(PORT, () =>
            console.log('Backend server started on port', PORT)
        )
    } catch (error) {
        console.error('Failed to start server:', error)
    }
}

bootstrap()
