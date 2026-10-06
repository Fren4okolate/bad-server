import { csrfSync } from 'csrf-sync'

export const { generateToken, csrfSynchronisedProtection } = csrfSync({
    size: 32,
    getTokenFromRequest: (req) => {
        const token = req.get('x-csrf-token')
        return token && token.length <= 128 ? token : undefined
    },
})
