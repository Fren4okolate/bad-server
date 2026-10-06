import mongoose, { Document, Schema } from 'mongoose'

interface ICounter extends Document<string> {
    _id: string
    sequenceValue: number
}

const counterSchema = new Schema<ICounter>({
    _id: { type: String, required: true },
    sequenceValue: {
        type: Number,
        required: true,
    },
})

export default mongoose.model<ICounter>('counter', counterSchema)
