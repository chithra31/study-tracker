import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, errMsg } from '../api.service';
import { AuthService } from '../auth';
import { GoalSummary, Person } from '../models';

@Component({
  selector: 'app-goals',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-head">
      <h1>{{ auth.isMentor() ? 'Learner goals' : 'My goals' }}</h1>
      @if (auth.isMentor()) {
        <label class="inline">Learner
          <select [ngModel]="ownerId()" (ngModelChange)="filter($event)">
            <option [ngValue]="null">All learners</option>
            @for (l of learners(); track l.id) {
              <option [ngValue]="l.id">{{ l.name }}</option>
            }
          </select>
        </label>
      }
    </div>

    @if (error()) {
      <p class="error">{{ error() }}</p>
    }

    @if (auth.isMentor()) {
      <p class="muted">Read-only view. Mentors can see every learner's goals and manage configuration.</p>
    } @else {
      <form class="card inline-form" (ngSubmit)="create()">
        <input name="title" placeholder="New goal title" [(ngModel)]="title" required maxlength="120" />
        <input name="desc" placeholder="Description (optional)" [(ngModel)]="description" maxlength="500" />
        <button class="btn" type="submit" [disabled]="!title().trim()">Add goal</button>
      </form>
    }

    <div class="grid">
      @for (g of goals(); track g.id) {
        <a class="card goal-card" [routerLink]="['/goals', g.id]">
          <h2>{{ g.title }}</h2>
          @if (auth.isMentor()) {
            <p class="muted">{{ g.owner.name }}</p>
          }
          <p class="muted">{{ g.description }}</p>
          <div class="bar"><div class="bar-fill" [style.width.%]="g.percentComplete"></div></div>
          <p class="stats">
            <strong>{{ g.percentComplete }}%</strong> complete ·
            {{ g.completedTopics }}/{{ g.totalTopics }} topics ·
            {{ g.totalMinutes }} min logged
          </p>
        </a>
      } @empty {
        @if (!loading()) {
          <p class="muted">No goals yet.</p>
        }
      }
    </div>
  `,
})
export class GoalsPage implements OnInit {
  private api = inject(ApiService);
  protected auth = inject(AuthService);

  goals = signal<GoalSummary[]>([]);
  learners = signal<Person[]>([]);
  ownerId = signal<number | null>(null);
  error = signal('');
  loading = signal(true);
  title = signal('');
  description = signal('');

  async ngOnInit() {
    if (this.auth.isMentor()) {
      this.learners.set(await this.api.learners().catch(() => []));
    }
    await this.load();
  }

  async filter(id: number | null) {
    this.ownerId.set(id);
    await this.load();
  }

  async load() {
    try {
      this.goals.set(await this.api.goals(this.ownerId() ?? undefined));
      this.error.set('');
    } catch (e) {
      this.error.set(errMsg(e));
    } finally {
      this.loading.set(false);
    }
  }

  async create() {
    try {
      await this.api.createGoal(this.title().trim(), this.description().trim());
      this.title.set('');
      this.description.set('');
      await this.load();
    } catch (e) {
      this.error.set(errMsg(e));
    }
  }
}
