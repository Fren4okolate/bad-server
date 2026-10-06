import multer from 'multer'
import { randomUUID } from 'crypto'
import fs from 'fs'
import BadRequestError from '../errors/bad-request-error'
import { TEMP_ROOT } from '../config'

export default multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            fs.mkdir(TEMP_ROOT, { recursive: true }, (error) => cb(error, TEMP_ROOT))
        },
        filename: (_req, _file, cb) => cb(null, `${randomUUID()}.part`),
    }),
    fileFilter: (_req, file, cb) => {
        if (!['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(file.mimetype)
            || file.originalname.length > 128) {
            cb(new BadRequestError('Недопустимый тип или имя изображения')); return
        }
        cb(null, true)
    },
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1, fieldNameSize: 50 },
})
