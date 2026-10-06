import { Router } from 'express'
import {
    deleteCustomer,
    getCustomerById,
    getCustomers,
    updateCustomer,
} from '../controllers/customers'
import auth, { roleGuardMiddleware } from '../middlewares/auth'
import { validateCustomerQuery, validateCustomerUpdate, validateId } from '../middlewares/validations'
import { Role } from '../models/user'

const customerRouter = Router()

customerRouter.get('/', auth, roleGuardMiddleware(Role.Admin), validateCustomerQuery, getCustomers)
customerRouter.get('/:id', auth, roleGuardMiddleware(Role.Admin), validateId('id'), getCustomerById)
customerRouter.patch('/:id', auth, roleGuardMiddleware(Role.Admin), validateId('id'), validateCustomerUpdate, updateCustomer)
customerRouter.delete('/:id', auth, roleGuardMiddleware(Role.Admin), validateId('id'), deleteCustomer)

export default customerRouter
