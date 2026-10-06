import mongoose, { Document } from 'mongoose'

export interface IFile {
    fileName: string
    originalName: string
}

export interface IProduct extends Document {
    title: string
    image: IFile
    category: string
    description: string
    price: number | null
}

const cardsSchema = new mongoose.Schema<IProduct>(
    {
        title: {
            type: String,
            unique: true,
            required: [true, 'Поле "title" должно быть заполнено'],
            minlength: [2, 'Минимальная длина поля "title" - 2'],
            maxlength: [30, 'Максимальная длина поля "title" - 30'],
        },
        image: {
            fileName: {
                type: String,
                maxlength: 128,
                match: /^\/images\/[A-Za-z0-9_-]{1,100}\.(png|jpg|jpeg|webp|gif)$/,
                required: [true, 'Поле "image.fileName" должно быть заполнено'],
            },
            originalName: { type: String, maxlength: 128 },
        },
        category: {
            type: String,
            maxlength: 40,
            required: [true, 'Поле "category" должно быть заполнено'],
        },
        description: {
            type: String,
            maxlength: 2000,
        },
        price: {
            type: Number,
            min: 0, max: 1_000_000_000,
            validate: (value: number | null) => value === null || Number.isSafeInteger(value),
            default: null,
        },
    },
    { versionKey: false }
)

cardsSchema.index({ title: 'text' })

export default mongoose.model<IProduct>('product', cardsSchema)
