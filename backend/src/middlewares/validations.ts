import { Joi, celebrate } from 'celebrate'
import { paginationQuery } from '../config'

export const phoneRegExp = /^\+?[0-9 ()-]{10,32}$/
export enum PaymentType { Card = 'card', Online = 'online' }
const text = (max: number) => Joi.string().max(max).custom((value: string, helpers) => (
    Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ? helpers.error('any.invalid') : value
))
const email = Joi.string().max(254).email({ tlds: { allow: false } })
const phone = Joi.string().max(32).pattern(phoneRegExp).custom((value: string, helpers) => {
    const {length} = value.replace(/[^0-9]/g, '')
    return length >= 10 && length <= 15 ? value : helpers.error('any.invalid')
})
const password = Joi.string().min(6).max(72).custom((value: string, helpers) => (
    Buffer.byteLength(value, 'utf8') <= 72 ? value : helpers.error('any.invalid')
))
const objectId = Joi.string().hex().length(24)
const image = Joi.object({
    fileName: Joi.string().max(128).pattern(/^\/images\/[A-Za-z0-9_-]{1,100}\.(png|jpg|jpeg|webp|gif)$/).required(),
    originalName: text(128).required(),
}).unknown(false)
const product = {
    title: text(30).min(2), image, category: text(40).min(1),
    description: Joi.string().max(2000), price: Joi.number().integer().min(0).max(1_000_000_000).allow(null),
}
const body = (schema: Joi.ObjectSchema) => celebrate({ body: schema.unknown(false) }, { convert: false })
export const validateOrderBody = body(Joi.object({
    items: Joi.array().items(objectId.required()).min(1).max(100).unique().required(),
    payment: Joi.string().valid('card', 'online').required(),
    email: email.required(), phone: phone.required(), address: text(500).min(1).required(),
    total: Joi.number().integer().min(0).max(100_000_000_000).required(),
    comment: Joi.string().max(2000).allow(''),
}))
export const validateProductBody = body(Joi.object({
    ...product, title: product.title.required(), image: image.required(),
    category: product.category.required(), description: product.description.required(),
}))
export const validateProductUpdateBody = body(Joi.object(product).min(1))
export const validateUserBody = body(Joi.object({ name: text(30).min(2), password: password.required(), email: email.required() }))
export const validateAuthentication = body(Joi.object({ email: email.required(), password: password.required() }))
export const validateSelfUpdate = body(Joi.object({ name: text(30).min(2), phone }).min(1))
export const validateCustomerUpdate = body(Joi.object({ name: text(30).min(2), phone, email }).min(1))
export const validateStatusUpdate = body(Joi.object({ status: Joi.string().valid('new', 'completed', 'cancelled', 'delivering').required() }))
export const validateId = (field: string) => celebrate({ params: Joi.object({ [field]: objectId.required() }).unknown(false) }, { convert: false })
export const validateObjId = validateId('productId')
export const validateOrderNumber = celebrate({ params: Joi.object({ orderNumber: Joi.string().pattern(/^[0-9]{1,10}$/).required() }) }, { convert: false })
const search = Joi.string().max(100).allow('')
const date = Joi.string().isoDate().max(30)
const amount = Joi.number().min(0).max(100_000_000_000)
const sortOrder = Joi.string().valid('asc', 'desc')
export const validateProductQuery = celebrate({ query: paginationQuery.unknown(false) })
export const validateOrderQuery = celebrate({ query: paginationQuery.keys({
    sortField: Joi.string().valid('createdAt', 'totalAmount', 'status', 'orderNumber'), sortOrder,
    status: Joi.string().valid('new', 'completed', 'cancelled', 'delivering').allow(''),
    totalAmountFrom: amount, totalAmountTo: amount, orderDateFrom: date, orderDateTo: date, search,
}).unknown(false) })
export const validateCustomerQuery = celebrate({ query: paginationQuery.keys({
    sortField: Joi.string().valid('createdAt', 'totalAmount', 'orderCount', 'lastOrderDate'), sortOrder,
    registrationDateFrom: date, registrationDateTo: date, lastOrderDateFrom: date, lastOrderDateTo: date,
    totalAmountFrom: amount, totalAmountTo: amount,
    orderCountFrom: Joi.number().integer().min(0).max(1_000_000),
    orderCountTo: Joi.number().integer().min(0).max(1_000_000), search, name: search,
}).unknown(false) })
