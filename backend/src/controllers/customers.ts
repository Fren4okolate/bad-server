import { NextFunction, Request, Response } from 'express'
import { FilterQuery } from 'mongoose'
import ConflictError from '../errors/conflict-error'
import NotFoundError from '../errors/not-found-error'
import Order from '../models/order'
import User, { IUser } from '../models/user'
import escapeRegExp from '../utils/escapeRegExp'

// eslint-disable-next-line max-len
// Get GET /customers?page=2&limit=5&sort=totalAmount&order=desc&registrationDateFrom=2023-01-01&registrationDateTo=2023-12-31&lastOrderDateFrom=2023-01-01&lastOrderDateTo=2023-12-31&totalAmountFrom=100&totalAmountTo=1000&orderCountFrom=1&orderCountTo=10
export const getCustomers = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { page = 1, limit = 5, registrationDateFrom, registrationDateTo, lastOrderDateFrom, lastOrderDateTo } = req.query
        const normalizedLimit = Number(limit)
        const {
            sortField = 'createdAt',
            sortOrder = 'desc',
            totalAmountFrom,
            totalAmountTo,
            orderCountFrom,
            orderCountTo,
            search,
            name,
        } = req.query;

        const filters: FilterQuery<Partial<IUser>> = {}
        if (name) filters.name = new RegExp(escapeRegExp(String(name)), 'i')
        if (registrationDateFrom) {
            filters.createdAt = {
                ...filters.createdAt,
                $gte: new Date(registrationDateFrom as string),
            }
        }

        if (registrationDateTo) {
            const endOfDay = new Date(registrationDateTo as string)
            endOfDay.setHours(23, 59, 59, 999)
            filters.createdAt = {
                ...filters.createdAt,
                $lte: endOfDay,
            }
        }

        if (lastOrderDateFrom) {
            filters.lastOrderDate = {
                ...filters.lastOrderDate,
                $gte: new Date(lastOrderDateFrom as string),
            }
        }

        if (lastOrderDateTo) {
            const endOfDay = new Date(lastOrderDateTo as string)
            endOfDay.setHours(23, 59, 59, 999)
            filters.lastOrderDate = {
                ...filters.lastOrderDate,
                $lte: endOfDay,
            }
        }

        // БЕЗОПАСНОЕ СОЗДАНИЕ ФИЛЬТРОВ БЕЗ ОПЕРАТОРОВ ИЗ QUERY
        if (totalAmountFrom) {
            filters.totalAmount = { $gte: Number(totalAmountFrom) };
        }

        if (totalAmountTo) {
            filters.totalAmount = {
                ...filters.totalAmount,
                $lte: Number(totalAmountTo)
            }
        }

        if (orderCountFrom) {
            filters.orderCount = { $gte: Number(orderCountFrom) };
        }

        if (orderCountTo) {
            filters.orderCount = {
                ...filters.orderCount,
                $lte: Number(orderCountTo)
            }
        }

        if (search) {
            // Экранируем специальные символы напрямую
            const escapedSearch = (search as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escapedSearch, 'i');

            const orders = await Order.find(
                {
                    $or: [{ deliveryAddress: searchRegex }],
                },
                '_id'
            ).limit(1000).maxTimeMS(5000)

            const orderIds = orders.map((order) => order._id)

            filters.$or = [
                { name: searchRegex },
                { lastOrder: { $in: orderIds } },
            ]
        }

        // ДОБАВЛЯЕМ САНИТИЗАЦИЮ ФИЛЬТРОВ:
        const safeFilters = filters

        const sort: Record<string, 1 | -1> = {}

        if (sortField && sortOrder) {
            sort[sortField as string] = sortOrder === 'desc' ? -1 : 1
        }

        const options = {
            sort,
            skip: (Number(page) - 1) * normalizedLimit,
            limit: normalizedLimit
        }

        const users = await User.find(safeFilters, null, options).maxTimeMS(5000).populate([
            'orders',
            {
                path: 'lastOrder',
                populate: {
                    path: 'products',
                },
            },
            {
                path: 'lastOrder',
                populate: {
                    path: 'customer',
                },
            },
        ])

        const totalUsers = await User.countDocuments(safeFilters).maxTimeMS(5000)
        const totalPages = Math.ceil(totalUsers / normalizedLimit)

        res.status(200).json({
            customers: users,
            pagination: {
                totalUsers,
                totalPages,
                currentPage: Number(page),
                pageSize: normalizedLimit,
            },
        })
    } catch (error) {
        if (error instanceof Error) {
            next(error);
        } else {
            next(new Error('Произошла неизвестная ошибка'));
        }
    }
}

// Get /customers/:id
export const getCustomerById = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = await User.findById(req.params.id).orFail(() => new NotFoundError('Пользователь не найден')).populate([
            'orders',
            { path: 'lastOrder', populate: { path: 'products' } },
        ])
        res.status(200).json(user)
    } catch (error) {
        next(error)
    }
}

// Patch /customers/:id
export const updateCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { name, email, phone } = req.body
        const updates = Object.fromEntries(Object.entries({ name, email, phone }).filter(([, value]) => value !== undefined))
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            {
                new: true, runValidators: true,
            }
        )
            .orFail(
                () =>
                    new NotFoundError(
                        'Пользователь по заданному id отсутствует в базе'
                    )
            )
            .populate(['orders', 'lastOrder'])
        res.status(200).json(updatedUser)
    } catch (error) {
        next(error)
    }
}

// Delete /customers/:id
export const deleteCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        if (await Order.exists({ customer: req.params.id })) throw new ConflictError('Пользователь имеет заказы и не может быть удалён')
        const deletedUser = await User.findByIdAndDelete(req.params.id).orFail(
            () =>
                new NotFoundError(
                    'Пользователь по заданному id отсутствует в базе'
                )
        )
        res.status(200).json(deletedUser)
    } catch (error) {
        next(error)
    }
}
