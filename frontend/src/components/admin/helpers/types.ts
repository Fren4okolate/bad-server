import { IProduct } from '../../../utils/types'

export type ProductFormValues = Pick<IProduct, 'title' | 'description' | 'price'>
