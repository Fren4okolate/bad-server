import { NextFunction, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'

export default function serveStatic(baseDir: string) {
    const resolvedBase = path.resolve(baseDir)
    return (req: Request, res: Response, next: NextFunction) => {
        const requested = path.resolve(resolvedBase, `.${req.path}`)

        // Если запрошенный файл находится вне базовой директории — игнорируем
        if (!requested.startsWith(resolvedBase)) {
            return next()
        }

        fs.access(requested, fs.constants.F_OK, (err) => {
            if (err) {
                return next()
            }
            return res.sendFile(requested, (sendErr) => {
                if (sendErr) {
                    next(sendErr)
                }
            })
        })
    }
}
