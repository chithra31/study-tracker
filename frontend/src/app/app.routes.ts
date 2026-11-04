import { Routes } from '@angular/router';
import { authGuard, mentorGuard } from './auth';
import { ConfigPage } from './pages/config';
import { GoalDetailPage } from './pages/goal-detail';
import { GoalsPage } from './pages/goals';
import { LoginPage } from './pages/login';

export const routes: Routes = [
  { path: 'login', component: LoginPage, title: 'Sign in' },
  { path: 'goals', component: GoalsPage, canActivate: [authGuard], title: 'Goals' },
  { path: 'goals/:id', component: GoalDetailPage, canActivate: [authGuard], title: 'Goal' },
  { path: 'config', component: ConfigPage, canActivate: [authGuard, mentorGuard], title: 'Configuration' },
  { path: '', pathMatch: 'full', redirectTo: 'goals' },
  { path: '**', redirectTo: 'goals' },
];
