const JWT = require('jsonwebtoken')
const createError = require('http-errors')
require('dotenv').config()

module.exports = {
    signAccessToken: (userId, role, userEmail) => {
        return new Promise((resolve, reject) => {
            let roleLabel
            let roleId
            if (role !== null && typeof role === 'object') {
                roleLabel = role.role_name || role.name || 'role'
                roleId = role._id ? role._id.toString() : undefined
            } else {
                roleLabel = role
                roleId = undefined
            }

            const payload = {
                role: roleLabel,
                userId: userId,
                ...(roleId && { roleId }),
            }

            const secret = process.env.ACCESS_TOKEN_SECRET

            const options = {
                expiresIn: '1y',
                issuer: 'OXIUM',
                audience: userEmail || String(userId),
            }

            JWT.sign(payload, secret, options, (err, token) => {
                if (err) {
                    return reject(createError.InternalServerError())
                }
                resolve(token)
            })
        })
    },

    verifyAccessToken: (req, res, next) => {
        if (!req.headers['authorization']) {
            return next(createError.Unauthorized())
        }

        const authHeader = req.headers['authorization']
        const bearerToken = authHeader.split(' ')
        const token = bearerToken[1]
        JWT.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, payload) => {
            if (err) {
                const message = err.name === 'JsonWebTokenError' ? 'Unauthorized' : err.message
                return next(createError.Unauthorized(message))
            }

            req.payload = payload
            next()
        })

    },

    signRefreshToken: (userId, role) => {
        return new Promise((resolve, reject) => {

            const payload = {
                role: role
            }

            const secret = process.env.REFRESH_TOKEN_SECRET

            const options = {
                expiresIn: '1y',
                issuer: 'ict-academy.com',
                audience: userId
            }



            JWT.sign(payload, secret, options, (err, token) => {
                if (err) {
                    return reject(createError.InternalServerError())
                }
                resolve(token)
            })
        })
    },

    verifyRefreshToken: (refreshToken) => {
        return new Promise((resolve, reject) => {
            JWT.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, payload) => {
                if (err) return reject(createError.Unauthorized())

                const userId = payload.aud

                resolve(userId)
            })
        })
    }



}
