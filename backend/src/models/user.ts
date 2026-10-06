/* eslint-disable no-param-reassign */
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import mongoose, { Document, HydratedDocument, Model, Types } from 'mongoose'
import validator from 'validator'
import bcrypt from 'bcryptjs'

import { ACCESS_TOKEN, REFRESH_TOKEN } from '../config'
import UnauthorizedError from '../errors/unauthorized-error'

export enum Role {
    Customer = 'customer',
    Admin = 'admin',
}

export interface IUser extends Document {
    name: string
    email: string
    password: string
    tokens: { token: string }[]
    roles: Role[]
    phone: string
    totalAmount: number
    orderCount: number
    orders: Types.ObjectId[]
    lastOrderDate: Date | null
    lastOrder: Types.ObjectId | null
}

interface IUserMethods {
    generateAccessToken(): string
    generateRefreshToken(): Promise<string>
    toJSON(): unknown
    calculateOrderStats(): Promise<void>
}

interface IUserModel extends Model<IUser, Record<string, never>, IUserMethods> {
    findUserByCredentials: (
        email: string,
        password: string
    ) => Promise<HydratedDocument<IUser, IUserMethods>>
}

const userSchema = new mongoose.Schema<IUser, IUserModel, IUserMethods>(
    {
        name: {
            type: String,
            default: 'Евлампий',
            minlength: [2, 'Минимальная длина поля "name" - 2'],
            maxlength: [30, 'Максимальная длина поля "name" - 30'],
        },
        // в схеме пользователя есть обязательные email и password
        email: {
            type: String,
            maxlength: 254,
            lowercase: true,
            required: [true, 'Поле "email" должно быть заполнено'],
            unique: true, // поле email уникально (есть опция unique: true);
            validate: {
                // для проверки email студенты используют validator
                validator: (v: string) => validator.isEmail(v),
                message: 'Поле "email" должно быть валидным email-адресом',
            },
        },
        // поле password не имеет ограничения на длину, т.к. пароль хранится в виде хэша
        password: {
            type: String,
            required: [true, 'Поле "password" должно быть заполнено'],
            minlength: [6, 'Минимальная длина поля "password" - 6'],
            select: false,
        },

        tokens: [
            {
                token: { required: true, type: String },
            },
        ],
        roles: {
            type: [String],
            enum: Object.values(Role),
            default: [Role.Customer],
        },
        phone: {
            type: String,
            maxlength: 32,
        },
        lastOrderDate: {
            type: Date,
            default: null,
        },
        lastOrder: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'order',
            default: null,
        },
        totalAmount: { type: Number, default: 0 },
        orderCount: { type: Number, default: 0 },
        orders: [
            {
                type: Types.ObjectId,
                ref: 'order',
            },
        ],
    },
    {
        versionKey: false,
        timestamps: true,
        // Возможно удаление пароля в контроллере создания, т.к. select: false не работает в случае создания сущности https://mongoosejs.com/docs/api/document.html#Document.prototype.toJSON()
        toJSON: {
            virtuals: true,
            transform: (_doc, ret) => {
                const { tokens: _tokens, password: _password, _id, roles: _roles, ...rest } = ret
                return rest
            },
        },
    }
)

// Возможно добавление хеша в контроллере регистрации
userSchema.pre('save', async function hashingPassword(next) {
    try {
        if (this.isModified('password')) {
            const saltRounds = 10
            this.password = await bcrypt.hash(this.password, saltRounds)
        }
        next()
    } catch (error) {
        next(error as Error)
    }
})

// централизованное создание accessToken и  refresh токена

userSchema.methods.generateAccessToken = function generateAccessToken() {
    const user = this
    // Создание accessToken токена возможно в контроллере авторизации
    return jwt.sign(
        {
            _id: user._id.toString(),
            email: user.email,
            type: 'access',
        },
        ACCESS_TOKEN.secret,
        {
            expiresIn: ACCESS_TOKEN.expiry,
            subject: user.id.toString(),
        }
    )
}

userSchema.methods.generateRefreshToken =
    async function generateRefreshToken() {
        const user = this
        // Создание refresh токена возможно в контроллере авторизации/регистрации
        const refreshToken = jwt.sign(
            {
                _id: user._id.toString(),
                type: 'refresh',
                jti: crypto.randomUUID(),
            },
            REFRESH_TOKEN.secret,
            {
                expiresIn: REFRESH_TOKEN.expiry,
                subject: user.id.toString(),
            }
        )

        //  Создаем хеш refresh токена
        const rTknHash = crypto
            .createHmac('sha256', REFRESH_TOKEN.secret)
            .update(refreshToken)
            .digest('hex')

        // Сохраняем refresh токена в базу данных, можно делать в контроллере авторизации/регистрации
        await (user.constructor as IUserModel).updateOne({ _id: user._id }, {
            $push: { tokens: { $each: [{ token: rTknHash }], $slice: -10 } },
        })

        return refreshToken
    }

userSchema.statics.findUserByCredentials = async function findByCredentials(
    email: string,
    password: string
) {
    const user = await this.findOne({ email: email.toLowerCase() })
        .select('+password')
        .orFail(() => new UnauthorizedError('Неправильные почта или пароль'))
    const passwdMatch = await bcrypt.compare(password, user.password)
    if (!passwdMatch) {
        return Promise.reject(new UnauthorizedError('Неправильные почта или пароль'))
    }
    return user
}

userSchema.methods.calculateOrderStats = async function calculateOrderStats() {
    const user = this
    const orderStats = await mongoose.model('order').aggregate([
        { $match: { customer: user._id } },
        { $sort: { createdAt: 1 } },
        {
            $group: {
                _id: null,
                totalAmount: { $sum: '$totalAmount' },
                lastOrderDate: { $max: '$createdAt' },
                orderCount: { $sum: 1 },
                lastOrder: { $last: '$_id' },
            },
        },
    ]).option({ maxTimeMS: 5000 })

    if (orderStats.length > 0) {
        const stats = orderStats[0]
        user.totalAmount = stats.totalAmount
        user.orderCount = stats.orderCount
        user.lastOrderDate = stats.lastOrderDate
        user.lastOrder = stats.lastOrder
    } else {
        user.totalAmount = 0
        user.orderCount = 0
        user.lastOrderDate = null
        user.lastOrder = null
    }

    await (user.constructor as IUserModel).updateOne({ _id: user._id }, { $set: {
        totalAmount: user.totalAmount, orderCount: user.orderCount,
        lastOrderDate: user.lastOrderDate, lastOrder: user.lastOrder,
    } })
}
const UserModel = mongoose.model<IUser, IUserModel>('user', userSchema)

export default UserModel
