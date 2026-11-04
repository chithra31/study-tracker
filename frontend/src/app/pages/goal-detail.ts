import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, errMsg } from '../api.service';
import { AuthService } from '../auth';
import { GoalDetail, Progress, Review, Settings, StudySession, TopicView } from '../models';
import { MinutesChart } from './minutes-chart';

@Component({
  selector: 'app-goal-detail',
  imports: [FormsModule, RouterLink, DatePipe, MinutesChart],
  template: `
    <a routerLink="/goals" class="back">&larr; All goals</a>

    @if (goal(); as g) {
      <div class="page-head">
        <div>
          <h1>{{ g.title }}</h1>
          <p class="muted">{{ g.description }}</p>
          @if (auth.isMentor() && g.owner) {
            <p class="muted">Learner: <strong>{{ g.owner.name }}</strong></p>
          }
        </div>
        @if (canEdit()) {
          <button class="btn btn-danger" (click)="deleteGoal()">Delete goal</button>
        }
      </div>

      @if (!canEdit()) {
        <p class="notice">Read-only view. Only the learner who owns this goal can change it.</p>
      }
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      @if (progress(); as p) {
        <section class="card">
          <h2>Progress</h2>
          <div class="bar bar-lg"><div class="bar-fill" [style.width.%]="p.percentComplete"></div></div>
          <div class="kpis">
            <div><strong>{{ p.percentComplete }}%</strong><span>of topics complete</span></div>
            <div><strong>{{ p.completedTopics }}/{{ p.totalTopics }}</strong><span>topics done</span></div>
            <div><strong>{{ p.totalMinutes }}</strong><span>minutes logged</span></div>
            <div><strong>{{ p.lockedTopics }}</strong><span>locked topics</span></div>
          </div>
          <app-minutes-chart [weeks]="p.minutesPerWeek" />
        </section>
      }

      <section class="card">
        <div class="section-head">
          <h2>Weekly review</h2>
          <button class="btn" (click)="getReview()" [disabled]="reviewing()">
            {{ reviewing() ? 'Reviewing…' : review() ? 'Refresh review' : 'Generate review' }}
          </button>
        </div>
        @if (reviewError()) {
          <p class="error">{{ reviewError() }}</p>
        }
        @if (review(); as r) {
          <p class="review-source">
            <span class="badge" [class.badge-UNLOCKED]="r.source === 'ai'" [class.badge-LOCKED]="r.source === 'rules'">
              {{ r.source === 'ai' ? 'Written by Claude' : 'Rule-based review' }}
            </span>
            @if (r.source === 'rules') {
              <span class="muted"> Set ANTHROPIC_API_KEY on the server for an AI-written review.</span>
            }
          </p>
          <p>{{ r.summary }}</p>
          @if (r.highlights.length) {
            <ul class="review-list">
              @for (h of r.highlights; track h) {
                <li>{{ h }}</li>
              }
            </ul>
          }
          @if (r.suggestedPlan.length) {
            <h3>Suggested plan for next week</h3>
            <table>
              <thead><tr><th>Topic</th><th>Minutes</th><th>Why</th></tr></thead>
              <tbody>
                @for (p of r.suggestedPlan; track p.topic) {
                  <tr><td>{{ p.topic }}</td><td>{{ p.minutes }}</td><td>{{ p.reason }}</td></tr>
                }
              </tbody>
            </table>
          }
          @if (r.encouragement) {
            <p class="muted review-note">{{ r.encouragement }}</p>
          }
        } @else if (!reviewing()) {
          <p class="muted">Get a short summary of your week and a suggested plan, based on your sessions and which topics are unlocked.</p>
        }
      </section>

      <section class="card">
        <h2>Topics</h2>
        @for (t of g.topics; track t.id) {
          <div class="topic topic-{{ t.status }}">
            <div class="topic-main">
              <div>
                <span class="badge badge-{{ t.status }}">{{ statusLabel(t) }}</span>
                <strong class="topic-title">{{ t.title }}</strong>
                <span class="muted"> · {{ t.totalMinutes }} min</span>
              </div>
              @if (t.prerequisites.length) {
                <div class="prereqs">
                  Requires: {{ names(t.prerequisites) }}
                </div>
              }
              @if (t.missingPrerequisites.length) {
                <div class="missing">
                  Locked. Still missing: <strong>{{ names(t.missingPrerequisites) }}</strong>
                </div>
              }
            </div>

            @if (canEdit()) {
              <div class="topic-actions">
                @if (t.status === 'COMPLETE') {
                  <button class="btn btn-ghost" (click)="run(reopen(t))">Reopen</button>
                } @else {
                  <button class="btn" [disabled]="t.status === 'LOCKED'" (click)="run(complete(t))">Mark complete</button>
                }
                <button class="btn btn-ghost" (click)="startEdit(t)">Prerequisites</button>
                <button class="btn btn-ghost" (click)="removeTopic(t)">Delete</button>
              </div>
            }

            @if (editingId() === t.id) {
              <div class="prereq-editor">
                <p class="muted">
                  Choose the topics that must be complete first (maximum {{ settings()?.maxPrerequisitesPerTopic }}).
                </p>
                @for (o of otherTopics(t); track o.id) {
                  <label class="check">
                    <input type="checkbox" [checked]="selected().includes(o.id)" (change)="toggle(o.id)" />
                    {{ o.title }}
                  </label>
                } @empty {
                  <p class="muted">Add more topics to this goal first.</p>
                }
                @if (prereqError()) {
                  <p class="error">{{ prereqError() }}</p>
                }
                <button class="btn" (click)="savePrereqs(t)">Save prerequisites</button>
                <button class="btn btn-ghost" (click)="editingId.set(null)">Cancel</button>
              </div>
            }
          </div>
        } @empty {
          <p class="muted">No topics yet.</p>
        }

        @if (canEdit()) {
          <form class="inline-form" (ngSubmit)="addTopic()">
            <input name="topic" placeholder="New topic title" [(ngModel)]="newTopic" maxlength="120" />
            <button class="btn" type="submit" [disabled]="!newTopic().trim()">Add topic</button>
          </form>
        }
      </section>

      @if (canEdit()) {
        <section class="card">
          <h2>Log a study session</h2>
          <form class="session-form" (ngSubmit)="logSession()">
            <label>Topic
              <select name="topic" [(ngModel)]="sTopic">
                <option [ngValue]="null" disabled>Select a topic</option>
                @for (t of g.topics; track t.id) {
                  <option [ngValue]="t.id" [disabled]="t.status === 'LOCKED'">
                    {{ t.title }}{{ t.status === 'LOCKED' ? ' (locked)' : '' }}
                  </option>
                }
              </select>
            </label>
            <label>Date
              <input type="date" name="date" [(ngModel)]="sDate" [max]="today" required />
            </label>
            <label>Minutes
              <input type="number" name="minutes" [(ngModel)]="sMinutes"
                     [min]="settings()?.minSessionMinutes ?? null" [max]="settings()?.maxSessionMinutes ?? null" required />
              <small class="muted">{{ settings()?.minSessionMinutes }} to {{ settings()?.maxSessionMinutes }}</small>
            </label>
            <label class="wide">Note
              <input name="note" [(ngModel)]="sNote" maxlength="1000" placeholder="What did you study?" />
            </label>
            @if (sessionError()) {
              <p class="error wide">{{ sessionError() }}</p>
            }
            <button class="btn" type="submit" [disabled]="sTopic() === null">Log session</button>
          </form>
        </section>
      }

      <section class="card">
        <h2>Sessions</h2>
        <table>
          <thead><tr><th>Date</th><th>Topic</th><th>Minutes</th><th>Note</th>@if (canEdit()) {<th></th>}</tr></thead>
          <tbody>
            @for (s of sessions(); track s.id) {
              <tr>
                <td>{{ s.date | date: 'mediumDate' : 'UTC' }}</td>
                <td>{{ s.topic.title }}</td>
                <td>{{ s.minutes }}</td>
                <td>{{ s.note }}</td>
                @if (canEdit()) {
                  <td><button class="link" (click)="run(deleteSession(s))">Delete</button></td>
                }
              </tr>
            } @empty {
              <tr><td colspan="5" class="muted">No sessions logged yet.</td></tr>
            }
          </tbody>
        </table>
      </section>
    } @else if (error()) {
      <p class="error">{{ error() }}</p>
    }
  `,
})
export class GoalDetailPage implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected auth = inject(AuthService);

  private readonly id = Number(this.route.snapshot.paramMap.get('id'));
  /** Today as a UTC calendar day, matching how the server validates "not in the future". */
  protected readonly today = new Date().toISOString().slice(0, 10);

  goal = signal<GoalDetail | null>(null);
  progress = signal<Progress | null>(null);
  sessions = signal<StudySession[]>([]);
  settings = signal<Settings | null>(null);
  error = signal('');

  canEdit = computed(() => {
    const u = this.auth.user();
    const g = this.goal();
    return !!u && !!g && u.role === 'LEARNER' && g.ownerId === u.id;
  });

  newTopic = signal('');
  editingId = signal<number | null>(null);
  selected = signal<number[]>([]);
  prereqError = signal('');

  sTopic = signal<number | null>(null);
  sDate = signal(this.today);
  sMinutes = signal(30);
  sNote = signal('');
  sessionError = signal('');

  review = signal<Review | null>(null);
  reviewing = signal(false);
  reviewError = signal('');

  ngOnInit() {
    void this.load();
  }

  async getReview() {
    this.reviewing.set(true);
    this.reviewError.set('');
    try {
      this.review.set(await this.api.review(this.id));
    } catch (e) {
      this.reviewError.set(errMsg(e));
    } finally {
      this.reviewing.set(false);
    }
  }

  async load() {
    try {
      const [goal, progress, sessions, settings] = await Promise.all([
        this.api.goal(this.id),
        this.api.progress(this.id),
        this.api.sessions(this.id),
        this.api.settings(),
      ]);
      this.goal.set(goal);
      this.progress.set(progress);
      this.sessions.set(sessions);
      this.settings.set(settings);
    } catch (e) {
      this.error.set(errMsg(e));
    }
  }

  names = (list: { title: string }[]) => list.map((x) => x.title).join(', ');

  statusLabel(t: TopicView) {
    return t.status === 'COMPLETE' ? 'Complete' : t.status === 'UNLOCKED' ? 'Unlocked' : 'Locked';
  }

  otherTopics(t: TopicView) {
    return (this.goal()?.topics ?? []).filter((o) => o.id !== t.id);
  }

  /** Runs a mutation, shows any server error, then refreshes everything. */
  async run(op: Promise<unknown>) {
    this.error.set('');
    try {
      await op;
      await this.load();
    } catch (e) {
      this.error.set(errMsg(e));
      await this.load();
    }
  }

  complete = (t: TopicView) => this.api.completeTopic(t.id);
  reopen = (t: TopicView) => this.api.reopenTopic(t.id);
  deleteSession = (s: StudySession) => this.api.deleteSession(s.id);

  async addTopic() {
    const title = this.newTopic().trim();
    await this.run(this.api.addTopic(this.id, title));
    this.newTopic.set('');
  }

  async removeTopic(t: TopicView) {
    if (confirm(`Delete topic "${t.title}"?`)) await this.run(this.api.deleteTopic(t.id));
  }

  async deleteGoal() {
    if (!confirm('Delete this goal and all its topics and sessions?')) return;
    try {
      await this.api.deleteGoal(this.id);
      await this.router.navigate(['/goals']);
    } catch (e) {
      this.error.set(errMsg(e));
    }
  }

  startEdit(t: TopicView) {
    this.editingId.set(t.id);
    this.selected.set(t.prerequisites.map((p) => p.id));
    this.prereqError.set('');
  }

  toggle(id: number) {
    this.selected.update((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async savePrereqs(t: TopicView) {
    this.prereqError.set('');
    try {
      await this.api.setPrerequisites(t.id, this.selected());
      this.editingId.set(null);
      await this.load();
    } catch (e) {
      this.prereqError.set(errMsg(e));
    }
  }

  async logSession() {
    const topic = this.sTopic();
    if (topic === null) return;
    this.sessionError.set('');
    try {
      await this.api.logSession(topic, this.sDate(), this.sMinutes(), this.sNote());
      this.sNote.set('');
      await this.load();
    } catch (e) {
      this.sessionError.set(errMsg(e));
    }
  }
}
