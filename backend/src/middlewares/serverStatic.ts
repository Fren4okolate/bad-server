import express from 'express'
import path from 'path'

export default function serveStatic(baseDir: string) {
    const router = express.Router()
    router.use('/images', express.static(path.join(baseDir, 'images'), {
        dotfiles: 'deny', index: false, redirect: false, maxAge: '1d', fallthrough: false,
    }))
    return router
}
