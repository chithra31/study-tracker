import { Role } from '@prisma/client';

/** The authenticated user attached to each request by the JWT strategy. */
export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}
