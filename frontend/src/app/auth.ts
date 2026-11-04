import { HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { tap } from 'rxjs';
import { ApiService } from './api.service';
import { User } from './models';

const TOKEN_KEY = 'st_token';
const USER_KEY = 'st_user';

// localStorage can be unavailable (private mode, blocked data), so every access is guarded.
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly user = signal<User | null>(this.restoreUser());
  readonly isMentor = computed(() => this.user()?.role === 'MENTOR');
  readonly isLoggedIn = computed(() => this.user() !== null && this.token() !== null);

  token(): string | null {
    return read(TOKEN_KEY);
  }

  async login(email: string, password: string) {
    const res = await this.api.login(email, password);
    write(TOKEN_KEY, res.accessToken);
    write(USER_KEY, JSON.stringify(res.user));
    this.user.set(res.user);
  }

  logout() {
    write(TOKEN_KEY, null);
    write(USER_KEY, null);
    this.user.set(null);
    void this.router.navigate(['/login']);
  }

  private restoreUser(): User | null {
    try {
      const raw = read(USER_KEY);
      return raw && read(TOKEN_KEY) ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }
}

/** Sends the JWT with every request and signs out when the server says it has expired. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authed).pipe(
    tap({
      error: (e) => {
        if (e.status === 401 && !req.url.endsWith('/auth/login')) auth.logout();
      },
    }),
  );
};

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/login']);
};

/** UI convenience only. The server enforces the real role check. */
export const mentorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isMentor() ? true : inject(Router).createUrlTree(['/goals']);
};
