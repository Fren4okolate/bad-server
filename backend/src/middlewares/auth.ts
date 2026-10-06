import { NextFunction, Request, Response } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { Types } from 'mongoose'
import { ACCESS_TOKEN } from '../config'
import ForbiddenError from '../errors/forbidden-error'
import UnauthorizedError from '../errors/unauthorized-error'
import UserModel, { Role } from '../models/user'

// есть файл middlewares/auth.js, в нём мидлвэр для проверки JWT;

const auth = async (req: Request, res: Response, next: NextFunction) => {
    let payload: JwtPayload | null = null
    const authHeader = req.header('Authorization')
    if (!authHeader || authHeader.length > 4096 || !authHeader.startsWith('Bearer ')) {
        return next(new UnauthorizedError('Необходима авторизация'))
    }
    try {
        const accessTokenParts = authHeader.split(' ')
        if (accessTokenParts.length !== 2 || !accessTokenParts[1]) {
            return next(new UnauthorizedError('Невалидный токен'))
        }
        const aTkn = accessTokenParts[1]
        payload = jwt.verify(aTkn, ACCESS_TOKEN.secret, { algorithms: ['HS256'] }) as JwtPayload

        if (!payload || payload.type !== 'access' || !Types.ObjectId.isValid(String(payload.sub))) {
            return next(new UnauthorizedError('Невалидный токен'))
        }
        const user = await UserModel.findOne(
            {
                _id: new Types.ObjectId(payload.sub),
            },
            { password: 0, salt: 0 }
        )

        if (!user) {
            return next(new ForbiddenError('Нет доступа'))
        }
        res.locals.user = user

        return next()
    } catch (error) {
        // Всегда передаём ошибку через next, не выбрасываем её
        if (error instanceof Error && error.name === 'TokenExpiredError') {
            return next(new UnauthorizedError('Истек срок действия токена'))
        }
        return next(new UnauthorizedError('Необходима авторизация'))
    }
}

export function roleGuardMiddleware(...roles: Role[]) {
    return (_req: Request, res: Response, next: NextFunction) => {
        if (!res.locals.user) {
            return next(new UnauthorizedError('Необходима авторизация'))
        }

        const hasAccess = roles.some((role) =>
            res.locals.user.roles.includes(role)
        )

        if (!hasAccess) {
            return next(new ForbiddenError('Доступ запрещен'))
        }

        return next()
    }
}

export default auth
