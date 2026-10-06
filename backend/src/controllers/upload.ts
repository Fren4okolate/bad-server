import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import fs from 'fs'
import { join } from 'path'
import BadRequestError from '../errors/bad-request-error'

export const uploadFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        if (!req.file) {
            return next(new BadRequestError('Файл не загружен'))
        }

        const { filename: fileName, size, mimetype, originalname } = req.file

        // Проверяем, что файл имеет безопасное имя (не оригинальное)
        if (!fileName.includes('-') || fileName.includes('..') || fileName.includes('/')) {
            return next(new BadRequestError('Некорректное имя файла'))
        }

        // Минимальный размер файла (2KB)
        const minSize = 2 * 1024
        if (typeof size === 'number' && size < minSize) {
            return next(new BadRequestError('Файл слишком мал'))
        }

        // Проверим сигнатуру файла (magic bytes) чтобы убедиться, что файл соответствует указанному mime
        try {
            const tempDir = process.env.UPLOAD_PATH_TEMP || 'temp'
            const fullPath = join(process.cwd(), 'public', tempDir, fileName)
            const fd = fs.openSync(fullPath, 'r')
            const header = Buffer.alloc(12)
            fs.readSync(fd, header, 0, 12, 0)
            fs.closeSync(fd)

            let valid = false
            if (mimetype === 'image/png') {
                valid = header.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]))
            } else if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') {
                valid = header[0] === 0xFF && header[1] === 0xD8
            } else if (mimetype === 'image/gif') {
                const sig = header.toString('ascii', 0, 6)
                valid = sig === 'GIF87a' || sig === 'GIF89a'
            } else if (mimetype === 'image/webp') {
                valid = header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP'
            }

            if (!valid) {
                return next(new BadRequestError('Некорректные метаданные файла'))
            }
        } catch (err) {
            return next(err as Error)
        }

        const filePath = process.env.UPLOAD_PATH_TEMP
            ? `${process.env.UPLOAD_PATH_TEMP}/${fileName}`
            : `${fileName}`

        return res.status(constants.HTTP_STATUS_CREATED).send({
            fileName: filePath,
            originalName: originalname,
            size,
            mimetype,
        })
    } catch (error) {
        return next(error)
    }
}

export default {}