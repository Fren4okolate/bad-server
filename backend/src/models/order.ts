/* eslint-disable prefer-arrow-callback */
import mongoose, { Document, Schema, Types } from 'mongoose'
import validator from 'validator'
import { PaymentType, phoneRegExp } from '../middlewares/validations'
import Counter from './counter'
import User from './user'

export enum StatusType {
    Cancelled = 'cancelled',
    Completed = 'completed',
    New = 'new',
    Delivering = 'delivering',
}

export interface IOrder extends Document {
    id: Types.ObjectId
    orderNumber: number
    status: string
    totalAmount: number
    products: Types.ObjectId[]
    payment: PaymentType
    customer: Types.ObjectId
    deliveryAddress: string
    phone: string
    comment: string
    email: string
}

const orderSchema: Schema = new Schema(
    {
        orderNumber: { type: Number, unique: true },
        status: {
            type: String,
            enum: Object.values(StatusType),
            default: StatusType.New,
        },
        totalAmount: { type: Number, required: true, min: 0, max: 100_000_000_000 },
        products: [
            {
                type: Types.ObjectId,
                ref: 'product',
            },
        ],
        payment: {
            type: String,
            enum: Object.values(PaymentType),
            required: true,
        },
        customer: { type: Types.ObjectId, ref: 'user' },
        deliveryAddress: { type: String, maxlength: 500 },
        email: {
            type: String,
            maxlength: 254,
            required: [true, 'Поле "email" должно быть заполнено'],
            validate: {
                validator: (v: string) => validator.isEmail(v),
                message: 'Поле "email" должно быть валидным email-адресом',
            },
        },
        phone: {
            type: String,
            maxlength: 32,
            required: [true, 'Поле "phone" должно быть заполнено'],
            validate: {
                validator: (v: string) => phoneRegExp.test(v),
                message: 'Поле "phone" должно быть валидным телефоном.',
            },
        },
        comment: {
            type: String,
            maxlength: 2000,
            default: '',
        },
    },
    { versionKey: false, timestamps: true }
)

orderSchema.pre('save', async function incrementOrderNumber(next) {
    const order = this

    if (order.isNew) {
        const counter = await Counter.findOneAndUpdate(
            { _id: 'order' },
            { $inc: { sequenceValue: 1 } },
            { new: true, upsert: true }
        )

        order.orderNumber = counter.sequenceValue
    }

    next()
})

orderSchema.post('save', async function updateUserStats(doc) {
    const user = await User.findByIdAndUpdate(doc.customer, {
        $push: { orders: { $each: [doc._id], $slice: -1000 } },
    }, { new: true })
    await user?.calculateOrderStats()
})
orderSchema.post('findOneAndDelete', async function updateUserStats(order) {
    if (!order) return
    const user = await User.findByIdAndUpdate(order.customer, { $pull: { orders: order._id } })
    await user?.calculateOrderStats()
})
orderSchema.index({ customer: 1, createdAt: -1 })
export default mongoose.model<IOrder>('order', orderSchema)
