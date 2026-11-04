import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { errMsg } from '../api.service';
import { AuthService } from '../auth';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="card login-card">
      <h1>Sign in</h1>
      <form (ngSubmit)="submit()">
        <label>Email
          <input type="email" name="email" [(ngModel)]="email" required autocomplete="username" />
        </label>
        <label>Password
          <input type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" />
        </label>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
        <button class="btn" type="submit" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
      </form>
      <details class="demo">
        <summary>Demo accounts (password <code>Password123!</code>)</summary>
        <ul>
          <li><button type="button" class="link" (click)="fill('alice@example.com')">alice&#64;example.com</button> learner</li>
          <li><button type="button" class="link" (click)="fill('bob@example.com')">bob&#64;example.com</button> learner</li>
          <li><button type="button" class="link" (click)="fill('mentor@example.com')">mentor&#64;example.com</button> mentor (admin)</li>
        </ul>
      </details>
    </div>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = signal('');
  password = signal('');
  error = signal('');
  busy = signal(false);

  fill(email: string) {
    this.email.set(email);
    this.password.set('Password123!');
  }

  async submit() {
    this.error.set('');
    this.busy.set(true);
    try {
      await this.auth.login(this.email(), this.password());
      await this.router.navigate(['/goals']);
    } catch (e) {
      this.error.set(errMsg(e));
    } finally {
      this.busy.set(false);
    }
  }
}
