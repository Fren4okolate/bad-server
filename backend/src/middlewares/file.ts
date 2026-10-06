import { Request, Express } from 'express'
import fs from 'fs'
import multer, { FileFilterCallback } from 'multer'
import crypto from 'crypto'
import { join, extname } from 'path'

type DestinationCallback = (error: Error | null, destination: string) => void
type FileNameCallback = (error: Error | null, filename: string) => void

const storage = multer.diskStorage({
    destination: (
        _req: Request,
        _file: Express.Multer.File,
        cb: DestinationCallback
    ) => {
        try {
            const tempPath = process.env.UPLOAD_PATH_TEMP || 'temp'
            // В контейнере используем абсолютный путь от /app
            const destinationPath = join(process.cwd(), `public/${tempPath}`)
            // Убедимся, что директория существует
            try {
                fs.mkdirSync(destinationPath, { recursive: true })
            } catch (err) {
                // Если не удалось создать — отдадим ошибку дальше
                return cb(err as Error, '')
            }
            cb(null, destinationPath)
        } catch (error) {
            cb(error as Error, '')
        }
    },

    filename: (
        _req: Request,
        file: Express.Multer.File,
        cb: FileNameCallback
    ) => {
        try {
            console.log('file.filename callback, original:', file.originalname, 'mimetype:', file.mimetype)
            // Полностью игнорируем оригинальное имя
            const ext = extname(file.originalname).toLowerCase() || '.bin'

            // Генерируем полностью случайное имя БЕЗ оригинального имени
            const timestamp = Date.now()
            const randomString = crypto.randomBytes(16).toString('hex')
            const safeName = `${timestamp}-${randomString}${ext}`

            console.log('file will be saved as:', safeName)

            cb(null, safeName)
        } catch (error) {
            cb(error as Error, '')
        }
    },
})

// Разрешенные MIME types
const allowedMimeTypes = [
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/gif',
    'image/webp',
]

const fileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
) => {
    try {
        // Проверяем MIME type
        if (!allowedMimeTypes.includes(file.mimetype)) {
            return cb(
                new Error(
                    'Недопустимый тип файла. Разрешены только изображения: PNG, JPG, JPEG, GIF, WEBP'
                )
            )
        }

        // Проверяем расширение файла
        const ext = extname(file.originalname).toLowerCase()
        const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
        if (!allowedExtensions.includes(ext)) {
            return cb(
                new Error(
                    'Недопустимое расширение файла. Разрешены: .png, .jpg, .jpeg, .gif, .webp'
                )
            )
        }

        return cb(null, true)
    } catch (error) {
        return cb(error as Error)
    }
}

// Лимиты
const maxSize = 10 * 1024 * 1024 // 10MB

export default multer({
    storage,
    fileFilter,
    limits: {
        fileSize: maxSize,
        files: 1,
    },
})
