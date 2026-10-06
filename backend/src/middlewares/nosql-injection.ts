import { NextFunction, Request, Response } from 'express'
import BadRequestError from '../errors/bad-request-error'

export const validateNoSQLInjection = (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    try {
        // Более гибкая проверка: проверяем query и body, но разрешаем простые параметры поиска в query
        const checkForOperators = (obj: any, path: string = '', isQuery: boolean = false): void => {
            if (!obj || typeof obj !== 'object') return

            Object.keys(obj).forEach((key) => {
                const currentPath = path ? `${path}.${key}` : key

                // Блокируем операторы MongoDB в ключах
                if (key.startsWith('$')) {
                    throw new BadRequestError(
                        `Запрещенный оператор: ${currentPath}`
                    )
                }

                const value = obj[key]

                // Блокируем оператор $ в значениях, но разрешаем его в простых query-параметрах поиска
                if (typeof value === 'string' && value.includes('$')) {
                    const simpleSearchParams = ['search', 'name', 'q']
                    if (!(isQuery && simpleSearchParams.includes(key))) {
                        throw new BadRequestError(
                            `Запрещенный символ в значении: ${currentPath}`
                        )
                    }
                }

                // Рекурсивно проверяем вложенные объекты
                if (typeof value === 'object' && value !== null) {
                    checkForOperators(value, currentPath, isQuery)
                }
            })
        }

        // Проверяем query параметры (помечаем как isQuery=true)
        checkForOperators(req.query, '', true)

        // Проверяем body
        if (req.body && typeof req.body === 'object') {
            checkForOperators(req.body, '', false)
        }

        next()
    } catch (error) {
        next(error)
    }
}
