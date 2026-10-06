import { RequestHandler } from 'express'
import mongoose from 'mongoose'
import Product from '../models/product'
import Order from '../models/order'
import NotFoundError from '../errors/not-found-error'
import ConflictError from '../errors/conflict-error'

const cache = new Map<string, { expires: number; data: unknown }>()
const pending = new Map<string, Promise<unknown>>()
let revision = 0
const invalidate = () => { cache.clear(); pending.clear(); revision += 1 }

export const getProducts: RequestHandler = async (req, res, next) => {
    try {
        const page = Number(req.query.page)
        const limit = Number(req.query.limit)
        const key = `${page}:${limit}`
        let data = cache.get(key)?.data
        if (!data || cache.get(key)!.expires < Date.now()) {
            if (!pending.has(key)) {
                const version = revision
                pending.set(key, Promise.all([
                    Product.find({}).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit).maxTimeMS(5000).lean(),
                    Product.countDocuments().maxTimeMS(5000),
                ]).then(([items, totalProducts]) => {
                    const result = { items, pagination: { totalProducts, totalPages: Math.ceil(totalProducts / limit), currentPage: page, pageSize: limit } }
                    if (version === revision) {
                        if (cache.size >= 100) cache.clear()
                        cache.set(key, { expires: Date.now() + 30_000, data: result })
                    }
                    return result
                }).finally(() => { pending.delete(key) }))
            }
            data = await pending.get(key)
        }
        res.set('Cache-Control', 'public, max-age=30')
        res.json(data)
    } catch (error) { next(error) }
}
export const getProduct: RequestHandler = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.productId).maxTimeMS(5000).orFail(() => new NotFoundError('Нет товара'))
        res.json(product)
    } catch (error) { next(error) }
}
const productError = (error: unknown) => error instanceof mongoose.mongo.MongoServerError && error.code === 11000
    ? new ConflictError('Товар с таким заголовком уже существует') : error
export const createProduct: RequestHandler = async (req, res, next) => {
    try {
        const { description, category, price, title, image } = req.body
        const product = await Product.create({ description, category, price, title, image })
        invalidate()
        res.status(201).json(product)
    } catch (error) { next(productError(error)) }
}
export const updateProduct: RequestHandler = async (req, res, next) => {
    try {
        // Route validation allows exactly the product fields, never update operators.
        const product = await Product.findByIdAndUpdate(req.params.productId, { $set: req.body }, { runValidators: true, new: true })
            .orFail(() => new NotFoundError('Нет товара'))
        invalidate()
        res.json(product)
    } catch (error) { next(productError(error)) }
}
export const deleteProduct: RequestHandler = async (req, res, next) => {
    try {
        if (await Order.exists({ products: req.params.productId })) throw new ConflictError('Товар присутствует в заказах и не может быть удалён')
        const product = await Product.findByIdAndDelete(req.params.productId).orFail(() => new NotFoundError('Нет товара'))
        invalidate()
        res.json(product)
    } catch (error) { next(error) }
}
