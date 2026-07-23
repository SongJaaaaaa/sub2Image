import type { AuthUser } from './modules/auth/authProvider.js'

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser | null
    accountId: string
  }
}
