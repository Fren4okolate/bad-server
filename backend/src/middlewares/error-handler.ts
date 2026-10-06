import { ErrorRequestHandler } from 'express'
import { isCelebrateError } from 'celebrate'
import { Error as MongooseError } from 'mongoose'
import { MulterError } from 'multer'
import BadRequestError from '../errors/bad-request-error'
import ConflictError from '../errors/conflict-error'
import ForbiddenError from '../errors/forbidden-error'
import NotFoundError from '../errors/not-found-error'
import UnauthorizedError from '../errors/unauthorized-error'

const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
    if (res.headersSent) { next(err); return }
    if (isCelebrateError(err) || err instanceof MongooseError.ValidationError || err instanceof MongooseError.CastError) {
        res.status(400).json({ message: 'Некорректные данные запроса' }); return
    }
    if (err instanceof MulterError) {
        res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: 'Нарушены ограничения загрузки' }); return
    }
    let candidate: unknown = 500
    if (err && typeof err === 'object') {
        if ('statusCode' in err) candidate = err.statusCode
        else if ('status' in err) candidate = err.status
    }
    const status = typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500
    let message = 'На сервере произошла ошибка'
    if (status < 500) {
        const messages: Record<number, string> = { 400: 'Некорректный запрос', 401: 'Необходима авторизация', 403: 'Доступ запрещён', 404: 'Ресурс не найден', 413: 'Слишком большой запрос' }
        message = messages[status] || 'Запрос отклонён'
        if ([BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError].some((Type) => err instanceof Type)) {
            message = (err as Error).message
        }
    }
    res.status(status).json({ message })
}
export default errorHandler
