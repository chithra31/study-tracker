import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  GoalDetail,
  GoalSummary,
  LoginResponse,
  Person,
  Progress,
  Review,
  Settings,
  StudySession,
  TopicView,
} from './models';

export const API_URL = 'http://localhost:3000';

/** Turns an HTTP error from the API into a readable message. */
export function errMsg(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    const m = e.error?.message;
    if (Array.isArray(m)) return m.join('. ');
    if (typeof m === 'string') return m;
    if (e.status === 0) return 'Cannot reach the server. Is the backend running?';
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private get = <T>(path: string) => firstValueFrom(this.http.get<T>(API_URL + path));
  private post = <T>(path: string, body: unknown = {}) => firstValueFrom(this.http.post<T>(API_URL + path, body));
  private put = <T>(path: string, body: unknown) => firstValueFrom(this.http.put<T>(API_URL + path, body));
  private del = <T>(path: string) => firstValueFrom(this.http.delete<T>(API_URL + path));

  login = (email: string, password: string) => this.post<LoginResponse>('/auth/login', { email, password });

  // Goals
  goals = (ownerId?: number) => this.get<GoalSummary[]>('/goals' + (ownerId ? `?ownerId=${ownerId}` : ''));
  goal = (id: number) => this.get<GoalDetail>(`/goals/${id}`);
  progress = (id: number) => this.get<Progress>(`/goals/${id}/progress`);
  createGoal = (title: string, description?: string) => this.post('/goals', { title, description: description || undefined });
  deleteGoal = (id: number) => this.del(`/goals/${id}`);
  learners = () => this.get<Person[]>('/users/learners');

  // Topics: each mutation returns the goal's refreshed topic list
  addTopic = (goalId: number, title: string) => this.post<TopicView[]>(`/goals/${goalId}/topics`, { title });
  deleteTopic = (id: number) => this.del<TopicView[]>(`/topics/${id}`);
  setPrerequisites = (id: number, prerequisiteIds: number[]) =>
    this.put<TopicView[]>(`/topics/${id}/prerequisites`, { prerequisiteIds });
  completeTopic = (id: number) => this.post<TopicView[]>(`/topics/${id}/complete`);
  reopenTopic = (id: number) => this.post<TopicView[]>(`/topics/${id}/reopen`);

  // Sessions
  sessions = (goalId: number) => this.get<StudySession[]>(`/sessions?goalId=${goalId}`);
  logSession = (topicId: number, date: string, minutes: number, note: string) =>
    this.post('/sessions', { topicId, date, minutes, note: note || undefined });
  deleteSession = (id: number) => this.del(`/sessions/${id}`);

  review = (goalId: number) => this.post<Review>(`/goals/${goalId}/review`);

  // Admin configuration
  settings = () => this.get<Settings>('/config');
  updateSettings = (s: Settings) => this.put<Settings>('/config', s);
}
