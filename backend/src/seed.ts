import fs from 'fs/promises'
import path from 'path'
import mongoose from 'mongoose'
import Product from './models/product'
import User, { Role } from './models/user'
import { DB_ADDRESS } from './config'

const seed = async () => {
    if (process.env.NODE_ENV === 'production') throw new Error('Демонстрационные пользователи запрещены в production')
    await mongoose.connect(DB_ADDRESS, { serverSelectionTimeoutMS: 10_000 })
    try {
        const records = JSON.parse(await fs.readFile(path.resolve(process.env.SEED_PATH || '../.dump', 'weblarek.products.json'), 'utf8'))
        await Product.init()
        await User.init()
        await Promise.all(records.map(async (record: Record<string, unknown>) => {
            const { _id, ...fields } = record
            const id = (_id as { $oid: string }).$oid
            const product = new Product({ ...fields, _id: id })
            await product.validate()
            await Product.updateOne({ _id: id }, { $set: fields }, { upsert: true, runValidators: true })
        }))
        if (process.env.SEED_USERS !== 'false') {
            const users = [
                { email: 'admin@mail.ru', password: 'password', name: 'Admin', roles: [Role.Admin] },
                { email: 'user1@mail.ru', password: 'password1', name: 'First Customer', roles: [Role.Customer] },
            ]
            await Promise.all(users.map(async (data) => {
                const existing = await User.findOne({ email: data.email }).select('+password')
                if (!existing) await User.create(data)
                else if (!existing.password.startsWith('$2')) { existing.password = data.password; existing.tokens = []; await existing.save() }
            }))
        }
        console.log(`Импортировано товаров: ${records.length}`)
    } finally { await mongoose.disconnect() }
}
seed().catch(() => { console.error('Не удалось импортировать демонстрационные данные'); process.exitCode = 1 })
