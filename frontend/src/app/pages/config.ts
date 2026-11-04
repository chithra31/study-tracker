import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errMsg } from '../api.service';

@Component({
  selector: 'app-config',
  imports: [FormsModule],
  template: `
    <div class="page-head"><h1>Configuration</h1></div>
    <p class="muted">
      These values are used by the business rules on the server. Changing them takes effect on the next
      request, with no code change or restart.
    </p>
    <form class="card config-form" (ngSubmit)="save()">
      <label>Minimum minutes per study session
        <input type="number" name="min" [(ngModel)]="min" required />
      </label>
      <label>Maximum minutes per study session
        <input type="number" name="max" [(ngModel)]="max" required />
      </label>
      <label>Maximum prerequisites per topic
        <input type="number" name="prereq" [(ngModel)]="maxPrereq" required />
      </label>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
      @if (saved()) {
        <p class="success">Saved. The new limits apply immediately.</p>
      }
      <button class="btn" type="submit">Save changes</button>
    </form>
  `,
})
export class ConfigPage implements OnInit {
  private api = inject(ApiService);

  min = signal(5);
  max = signal(480);
  maxPrereq = signal(3);
  error = signal('');
  saved = signal(false);

  async ngOnInit() {
    try {
      const s = await this.api.settings();
      this.min.set(s.minSessionMinutes);
      this.max.set(s.maxSessionMinutes);
      this.maxPrereq.set(s.maxPrerequisitesPerTopic);
    } catch (e) {
      this.error.set(errMsg(e));
    }
  }

  async save() {
    this.error.set('');
    this.saved.set(false);
    try {
      const s = await this.api.updateSettings({
        minSessionMinutes: this.min(),
        maxSessionMinutes: this.max(),
        maxPrerequisitesPerTopic: this.maxPrereq(),
      });
      this.min.set(s.minSessionMinutes);
      this.max.set(s.maxSessionMinutes);
      this.maxPrereq.set(s.maxPrerequisitesPerTopic);
      this.saved.set(true);
    } catch (e) {
      this.error.set(errMsg(e));
    }
  }
}
