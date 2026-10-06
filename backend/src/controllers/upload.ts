import { RequestHandler } from 'express'
import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import { PUBLIC_ROOT } from '../config'
import BadRequestError from '../errors/bad-request-error'

export const uploadFile: RequestHandler = async (req, res, next) => {
    const {file} = req
    let output: string | undefined
    try {
        if (!file || file.size < 2048) throw new BadRequestError('Файл не загружен или меньше 2 КБ')
        const image = sharp(file.path, { limitInputPixels: 16_000_000, failOn: 'warning' })
        const metadata = await image.metadata()
        const mimeFormats: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp' }
        if (metadata.format !== mimeFormats[file.mimetype]) throw new BadRequestError('Некорректные метаданные изображения')
        const name = `${randomUUID()}.webp`
        const directory = path.join(PUBLIC_ROOT, 'images')
        await fs.mkdir(directory, { recursive: true })
        output = path.join(directory, name)
        // Re-encode pixels, stripping active data and metadata from the uploaded file.
        await image.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp().toFile(output)
        res.status(201).json({ fileName: `/images/${name}`, originalName: path.basename(file.originalname), size: file.size, mimetype: 'image/webp' })
    } catch (_error) {
        if (output) await fs.unlink(output).catch(() => undefined)
        next(new BadRequestError('Невалидное изображение. Разрешены PNG, JPEG, GIF и WEBP от 2 КБ до 10 МБ'))
    } finally {
        if (file) await fs.unlink(file.path).catch(() => undefined)
    }
}
