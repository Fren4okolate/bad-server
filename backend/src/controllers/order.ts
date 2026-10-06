import { NextFunction, Request, Response } from 'express'
import { FilterQuery, Error as MongooseError, Types } from 'mongoose'
import BadRequestError from '../errors/bad-request-error'
import NotFoundError from '../errors/not-found-error'
import Order, { IOrder, StatusType } from '../models/order'
import Product, { IProduct } from '../models/product'
import User from '../models/user'
import escapeRegExp from '../utils/escapeRegExp'

// eslint-disable-next-line max-len
// GET /orders?page=2&limit=5&sort=totalAmount&order=desc&orderDateFrom=2024-07-01&orderDateTo=2024-08-01&status=delivering&totalAmountFrom=100&totalAmountTo=1000&search=%2B1
export const getOrders = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const {
            page = 1,
            limit = 10,
            sortField = 'createdAt',
            sortOrder = 'desc',
            status,
            totalAmountFrom,
            totalAmountTo,
            orderDateFrom,
            orderDateTo,
            search,
        } = req.query

        // Нормализация лимита: макс 10
        const normalizedLimit = Math.min(Math.max(1, Number(limit)), 10)
        const normalizedPage = Math.max(1, Number(page))

        const filters: FilterQuery<Partial<IOrder>> = {}

        // Безопасная фильтрация статуса
        if (
            status &&
            Object.values(StatusType).includes(status as StatusType)
        ) {
            filters.status = status as StatusType
        }

        if (totalAmountFrom) {
            filters.totalAmount = {
                ...filters.totalAmount,
                $gte: Number(totalAmountFrom),
            }
        }

        if (totalAmountTo) {
            filters.totalAmount = {
                ...filters.totalAmount,
                $lte: Number(totalAmountTo),
            }
        }

        if (orderDateFrom) {
            filters.createdAt = {
                ...filters.createdAt,
                $gte: new Date(orderDateFrom as string),
            }
        }

        if (orderDateTo) {
            const endOfDay = new Date(orderDateFrom as string)
            endOfDay.setHours(23, 59, 59, 999)
            filters.createdAt = {
                ...filters.createdAt,
                $lte: endOfDay,
            }
        }

        // Безопасный поиск - убираем агрегацию
        if (search) {
            const raw = String(search).slice(0, 200)
            const searchRegex = new RegExp(escapeRegExp(raw), 'i')
            const searchNumber = Number(raw)

            // Ищем продукты по названию
            const products = await Product.find({ title: searchRegex }, '_id')
            const productIds = products.map((p) => p._id)

            // Создаем безопасные условия поиска
            const searchConditions = []

            if (!Number.isNaN(searchNumber)) {
                searchConditions.push({ orderNumber: searchNumber })
            }

            if (productIds.length > 0) {
                searchConditions.push({ products: { $in: productIds } })
            }

            if (searchConditions.length > 0) {
                filters.$or = searchConditions
            }
        }

        const sort: { [key: string]: any } = {}

        // Безопасная сортировка - только по разрешенным полям
        const allowedSortFields = [
            'createdAt',
            'totalAmount',
            'orderNumber',
            'status',
        ]
        if (allowedSortFields.includes(sortField as string)) {
            sort[sortField as string] = sortOrder === 'desc' ? -1 : 1
        } else {
            sort.createdAt = -1 // fallback
        }

        // Используем безопасный подход с populate
        const orders = await Order.find(filters)
            .populate(['customer', 'products'])
            .sort(sort)
            .skip((normalizedPage - 1) * normalizedLimit)
            .limit(normalizedLimit)

        const totalOrders = await Order.countDocuments(filters)
        const totalPages = Math.ceil(totalOrders / normalizedLimit)

        res.status(200).json({
            orders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: normalizedPage,
                pageSize: normalizedLimit,
            },
        })
    } catch (error) {
        next(error)
    }
}

export const getOrdersCurrentUser = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = res.locals.user._id
        const { search, page = 1, limit = 5 } = req.query
        // Нормализация лимита
        const normalizedLimit = Math.min(Math.max(1, Number(limit)), 10)
        const normalizedPage = Math.max(1, Number(page))
        const options = {
            skip: (normalizedPage - 1) * normalizedLimit,
            limit: normalizedLimit,
        }

        const user = await User.findById(userId)
            .populate({
                path: 'orders',
                populate: [
                    {
                        path: 'products',
                    },
                    {
                        path: 'customer',
                    },
                ],
            })
            .orFail(
                () =>
                    new NotFoundError(
                        'Пользователь по заданному id отсутствует в базе'
                    )
            )

        let orders = user.orders as unknown as IOrder[]

        if (search) {
            // Экранируем пользовательский ввод перед созданием RegExp
            const raw = String(search).slice(0, 200)
            const searchRegex = new RegExp(escapeRegExp(raw), 'i')
            const searchNumber = Number(raw)
            const products = await Product.find({ title: searchRegex })
            const productIds = products.map((product) => product._id)

            orders = orders.filter((order) => {
                // eslint-disable-next-line max-len
                const matchesProductTitle = order.products.some((product) =>
                    productIds.some((id) => id.equals(product._id))
                )
                // eslint-disable-next-line max-len
                const matchesOrderNumber =
                    !Number.isNaN(searchNumber) &&
                    order.orderNumber === searchNumber

                return matchesOrderNumber || matchesProductTitle
            })
        }

        const totalOrders = orders.length
        const totalPages = Math.ceil(totalOrders / normalizedLimit)

        orders = orders.slice(options.skip, options.skip + normalizedLimit)

        return res.send({
            orders,
            pagination: {
                totalOrders,
                totalPages,
                currentPage: normalizedPage,
                pageSize: normalizedLimit,
            },
        })
    } catch (error) {
        next(error)
    }
}

// Get order by ID
export const getOrderByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const order = await Order.findOne({
            orderNumber: req.params.orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
        return res.status(200).json(order)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}

export const getOrderCurrentUserByNumber = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const userId = res.locals.user._id
    try {
        const order = await Order.findOne({
            orderNumber: req.params.orderNumber,
        })
            .populate(['customer', 'products'])
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
        if (!order.customer._id.equals(userId)) {
            // Если нет доступа не возвращаем 403, а отдаем 404
            return next(
                new NotFoundError('Заказ по заданному id отсутствует в базе')
            )
        }
        return res.status(200).json(order)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}

// POST /product
export const createOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const basket: IProduct[] = []
        const products = await Product.find<IProduct>({})
        const userId = res.locals.user._id
        const { address, payment, phone, total, email, items } = req.body

        // Санитизация комментария: удаляем HTML теги
        const sanitizedComment = (req.body.comment || '')
            .replace(/<[^>]*>/g, '')
            .slice(0, 500)

        // Проверяем items: массив и допустимый размер
        if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
            return next(new BadRequestError('Неверный список товаров'))
        }

        items.forEach((id: Types.ObjectId | string) => {
            if (!Types.ObjectId.isValid(String(id))) {
                throw new BadRequestError(`Товар с id ${id} не найден`)
            }
            const product = products.find((p) => p._id.equals(id))
            if (!product) {
                throw new BadRequestError(`Товар с id ${id} не найден`)
            }
            if (product.price === null) {
                throw new BadRequestError(`Товар с id ${id} не продается`)
            }
            return basket.push(product)
        })
        const totalBasket = basket.reduce((a, c) => a + c.price, 0)
        if (totalBasket !== total) {
            return next(new BadRequestError('Неверная сумма заказа'))
        }

        const newOrder = new Order({
            totalAmount: total,
            products: items,
            payment,
            phone,
            email,
            comment: sanitizedComment,
            customer: userId,
            deliveryAddress: address,
        })
        const populateOrder = await newOrder.populate(['customer', 'products'])
        await populateOrder.save()

        return res.status(200).json(populateOrder)
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        return next(error)
    }
}

// Update an order
export const updateOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { status } = req.body
        // Валидация статуса заказа
        if (
            status !== undefined &&
            !Object.values(StatusType).includes(status)
        ) {
            return next(new BadRequestError('Недопустимый статус заказа'))
        }
        const updatedOrder = await Order.findOneAndUpdate(
            { orderNumber: req.params.orderNumber },
            { status },
            { new: true, runValidators: true }
        )
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
            .populate(['customer', 'products'])
        return res.status(200).json(updatedOrder)
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) {
            return next(new BadRequestError(error.message))
        }
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}

// Delete an order
export const deleteOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const deletedOrder = await Order.findByIdAndDelete(req.params.id)
            .orFail(
                () =>
                    new NotFoundError(
                        'Заказ по заданному id отсутствует в базе'
                    )
            )
            .populate(['customer', 'products'])
        return res.status(200).json(deletedOrder)
    } catch (error) {
        if (error instanceof MongooseError.CastError) {
            return next(new BadRequestError('Передан не валидный ID заказа'))
        }
        return next(error)
    }
}
