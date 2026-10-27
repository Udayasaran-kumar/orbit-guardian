import type { User } from "../types/profile"

export function greeting(user: User): string {
  return `Hello, ${user.profile.name}`
}
