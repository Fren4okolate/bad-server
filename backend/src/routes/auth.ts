import { Router } from 'express'
import {
    getCurrentUser,
    getCurrentUserRoles,
    login,
    logout,
    refreshAccessToken,
    register,
    updateCurrentUser,
} from '../controllers/auth'
import auth from '../middlewares/auth'
import { validateUserBody, validateAuthentication, validateSelfUpdate } from '../middlewares/validations'
import { authLimiter } from '../middlewares/rate-limit'

const authRouter = Router()

authRouter.get('/user', auth, getCurrentUser)
authRouter.patch('/me', auth, validateSelfUpdate, updateCurrentUser)
authRouter.get('/user/roles', auth, getCurrentUserRoles)
authRouter.post('/login', authLimiter, validateAuthentication, login)
authRouter.post('/token', refreshAccessToken)
authRouter.post('/logout', logout)
authRouter.post('/register', authLimiter, validateUserBody, register)

export default authRouter
