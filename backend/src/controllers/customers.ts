import { NextFunction, Request, Response } from 'express'
import { FilterQuery } from 'mongoose'
import NotFoundError from '../errors/not-found-error'
import Order from '../models/order'
import User, { IUser } from '../models/user'
import { sanitizeHTML } from '../utils/sanitize';
import { createSafeRegex, hasNoSQLInjection, sanitizeFilter } from '../utils/nosql-sanitize';
import BadRequestError from '../errors/bad-request-error';

// TODO: Добавить guard admin
// eslint-disable-next-line max-len
// Get GET /customers?page=2&limit=5&sort=totalAmount&order=desc&registrationDateFrom=2023-01-01&registrationDateTo=2023-12-31&lastOrderDateFrom=2023-01-01&lastOrderDateTo=2023-12-31&totalAmountFrom=100&totalAmountTo=1000&orderCountFrom=1&orderCountTo=10
export const getCustomers = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // СТРОГАЯ ВАЛИДАЦИЯ ПАРАМЕТРОВ
        const allowedParams = [
            'page', 'limit', 'sortField', 'sortOrder', 'registrationDateFrom',
            'registrationDateTo', 'lastOrderDateFrom', 'lastOrderDateTo',
            'totalAmountFrom', 'totalAmountTo', 'orderCountFrom', 'orderCountTo', 'search', 'name'
        ];
        
        // Проверяем, что нет лишних параметров
        const invalidParams = Object.keys(req.query).filter(param => !allowedParams.includes(param));
        if (invalidParams.length > 0) {
            return next(new BadRequestError(`Недопустимые параметры: ${invalidParams.join(', ')}`));
        }

        // ВАЛИДАЦИЯ ЧИСЛОВЫХ ПАРАМЕТРОВ
        const { page = 1, limit = 10 } = req.query;
        
        if (page && Number.isNaN(Number(page))) {
            return next(new BadRequestError('Параметр page должен быть числом'));
        }
        if (limit && Number.isNaN(Number(limit))) {
            return next(new BadRequestError('Параметр limit должен быть числом'));
        }

        const normalizedLimit = Math.min(Number(limit), 10);

        // ВАЛИДАЦИЯ ДАТ
        const { 
            registrationDateFrom,
            registrationDateTo,
            lastOrderDateFrom, 
            lastOrderDateTo 
        } = req.query;

        if (registrationDateFrom && Number.isNaN(Date.parse(registrationDateFrom as string))) {
            return next(new BadRequestError('Неверный формат даты registrationDateFrom'));
        }
        if (registrationDateTo && Number.isNaN(Date.parse(registrationDateTo as string))) {
            return next(new BadRequestError('Неверный формат даты registrationDateTo'));
        }
        if (lastOrderDateFrom && Number.isNaN(Date.parse(lastOrderDateFrom as string))) {
            return next(new BadRequestError('Неверный формат даты lastOrderDateFrom'));
        }
        if (lastOrderDateTo && Number.isNaN(Date.parse(lastOrderDateTo as string))) {
            return next(new BadRequestError('Неверный формат даты lastOrderDateTo'));
        }

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

        // ВАЛИДАЦИЯ sortField - разрешаем только безопасные поля
        const allowedSortFields = ['createdAt', 'totalAmount', 'orderCount', 'lastOrderDate'];
        if (sortField && !allowedSortFields.includes(sortField as string)) {
            return next(new BadRequestError('Невалидное поле для сортировки'));
        }

        // ВАЛИДАЦИЯ sortOrder - только 'asc' или 'desc'
        if (sortOrder && !['asc', 'desc'].includes(sortOrder as string)) {
            return next(new BadRequestError('Невалидный порядок сортировки'));
        }

        // ОБЪЯВЛЯЕМ filters ЗДЕСЬ - ПЕРЕД ИСПОЛЬЗОВАНИЕМ
        const filters: FilterQuery<Partial<IUser>> = {}

        // ОТДЕЛЬНАЯ ОБРАБОТКА ПАРАМЕТРА name С ВАЛИДАЦИЕЙ (ПЕРЕМЕЩАЕМ ПОСЛЕ ОБЪЯВЛЕНИЯ filters)
        if (name) {
            const nameValue = name as string;
            
            // Проверяем, что name - это простая строка, а не объект с операторами
            if (typeof nameValue !== 'string' || nameValue.trim() === '') {
                return next(new BadRequestError('Параметр name должен быть непустой строкой'));
            }
            
            // Проверяем на NoSQL-инъекции
            if (hasNoSQLInjection(nameValue)) {
                return next(new BadRequestError('Обнаружена попытка NoSQL-инъекции в name'));
            }
            
            // Проверяем длину (защита от больших payload)
            if (nameValue.length > 100) {
                return next(new BadRequestError('Слишком длинное значение name'));
            }
            
            // БЕЗОПАСНОЕ СОЗДАНИЕ ФИЛЬТРА
            const nameRegex = createSafeRegex(nameValue);
            filters.name = nameRegex;
        }

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
            )    

            const orderIds = orders.map((order) => order._id)

            filters.$or = [
                { name: searchRegex },
                { lastOrder: { $in: orderIds } },
            ]
        }
        
        // ДОБАВЛЯЕМ САНИТИЗАЦИЮ ФИЛЬТРОВ:
        const safeFilters = sanitizeFilter(filters);

        const sort: { [key: string]: any } = {}

        if (sortField && sortOrder) {
            sort[sortField as string] = sortOrder === 'desc' ? -1 : 1
        }

        const options = {
            sort,
            skip: (Number(page) - 1) * normalizedLimit,
            limit: normalizedLimit
        }

        const users = await User.find(safeFilters, null, options).populate([
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

        const totalUsers = await User.countDocuments(safeFilters)
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

// TODO: Добавить guard admin
// Get /customers/:id
export const getCustomerById = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = await User.findById(req.params.id).populate([
            'orders',
            'lastOrder',
        ])
        res.status(200).json(user)
    } catch (error) {
        next(error)
    }
}

// TODO: Добавить guard admin
// Patch /customers/:id
export const updateCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // Санитизируем данные от XSS перед обновлением
        const sanitizedBody = { ...req.body };
        
        if (sanitizedBody.name) {
            sanitizedBody.name = sanitizeHTML(sanitizedBody.name);
        }
        if (sanitizedBody.email) {
            sanitizedBody.email = sanitizeHTML(sanitizedBody.email);
        }
        
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            sanitizedBody,
            {
                new: true,
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

// TODO: Добавить guard admin
// Delete /customers/:id
export const deleteCustomer = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
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
