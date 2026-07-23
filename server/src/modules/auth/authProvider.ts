export type AuthUser = {
  id: string
  email?: string
}

export type AuthRequest = {
  authorization?: string
  userAgent?: string
  ip: string
}

export interface AuthProvider {
  verify(req: AuthRequest): Promise<AuthUser>
}
